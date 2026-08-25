import { bounded, unique } from "./utils.js";

const MAX_TREE_ENTRIES = 20000;
const MAX_FILES = 42;
const MAX_FILE_BYTES = 120000;
const MAX_TOTAL_BYTES = 1200000;
const MAX_ARCHIVE_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const decoder = new TextDecoder();
const TEXT_EXTENSIONS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "json", "jsonc", "md", "mdx", "yaml", "yml",
  "toml", "sql", "graphql", "gql", "html", "css", "scss", "txt", "sh", "py", "go", "rs",
]);

export function parseRepository(input) {
  const value = String(input || "").trim();
  let candidate = value.replace(/\.git$/, "");
  if (/^https?:\/\//i.test(candidate)) {
    let url;
    try {
      url = new URL(candidate);
    } catch {
      throw new Error("Repository URL is invalid");
    }
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
      throw new Error("Only public GitHub repositories are supported");
    }
    candidate = url.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(candidate) || candidate.includes("..")) {
    throw new Error("Repository must be owner/name or a public GitHub URL");
  }
  const [owner, repo] = candidate.split("/");
  return { owner, repo, fullName: `${owner}/${repo}`, htmlUrl: `https://github.com/${owner}/${repo}` };
}

async function cachedFetch(request, ctx) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  const response = await fetch(request);
  if (cache && response.ok) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "public, max-age=300");
    const cacheable = new Response(response.clone().body, { status: response.status, headers });
    const write = cache.put(request, cacheable);
    if (ctx?.waitUntil) ctx.waitUntil(write);
    else await write;
  }
  return response;
}

async function githubApi(path, ctx) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "opstruth-chatgpt-plugin/0.2.0",
    "x-github-api-version": "2022-11-28",
  };
  const request = new Request(`https://api.github.com${path}`, { headers });
  const response = await cachedFetch(request, ctx);
  if (!response.ok) {
    if (response.status === 404) throw new Error("Repository was not found or is not public");
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      const error = new Error("GitHub public rate limit reached");
      error.code = "GITHUB_RATE_LIMIT";
      throw error;
    }
    throw new Error(`GitHub request failed with status ${response.status}`);
  }
  return response.json();
}

function extension(path) {
  const name = path.split("/").at(-1) || "";
  return name.includes(".") ? name.split(".").at(-1).toLowerCase() : "";
}

function unsafeToRead(path) {
  const lower = path.toLowerCase();
  const base = lower.split("/").at(-1);
  return base === ".env" || base.startsWith(".env.") || /(?:^|\/)(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/.test(lower)
    || /\.(?:pem|key|p12|pfx|keystore)$/i.test(lower);
}

function priority(path) {
  const lower = path.toLowerCase();
  const base = lower.split("/").at(-1);
  if (["package.json", "wrangler.json", "wrangler.jsonc", "wrangler.toml", "vercel.json", "netlify.toml", "dockerfile", "tsconfig.json", "openapi.json", "openapi.yaml", "openapi.yml"].includes(base)) return 100;
  if (lower.startsWith(".github/workflows/") || ["readme.md", "contributing.md", "security.md"].includes(base)) return 95;
  if (/\/migrations?\//.test(`/${lower}`) || /(?:^|\/)migrations?\//.test(lower)) return 90;
  if (/(?:^|\/)(?:app|pages)\/.+\/(?:page|route)\.(?:js|jsx|ts|tsx)$/.test(lower)) return 88;
  if (/(?:router|routes|api|server|worker|index)\.(?:js|jsx|ts|tsx)$/.test(base)) return 80;
  if (/^(?:src|app|pages|api|server|worker)\//.test(lower)) return 60;
  if (/\.(?:md|json|ya?ml|toml)$/.test(lower)) return 30;
  return 10;
}

function selectFiles(tree) {
  return tree
    .filter((entry) => entry.type === "blob" && Number(entry.size || 0) <= MAX_FILE_BYTES)
    .filter((entry) => TEXT_EXTENSIONS.has(extension(entry.path)) || priority(entry.path) >= 90)
    .filter((entry) => !unsafeToRead(entry.path))
    .sort((left, right) => priority(right.path) - priority(left.path) || left.path.localeCompare(right.path))
    .slice(0, MAX_FILES);
}

function tarString(bytes, start, length) {
  const field = bytes.subarray(start, start + length);
  const zero = field.indexOf(0);
  return decoder.decode(zero === -1 ? field : field.subarray(0, zero)).trim();
}

function tarNumber(bytes, start, length) {
  const value = tarString(bytes, start, length).replace(/\0/g, "").trim();
  if (!value) return 0;
  if (value.charCodeAt(0) & 0x80) {
    let result = BigInt(value.charCodeAt(0) & 0x7f);
    for (let index = 1; index < value.length; index += 1) result = (result << 8n) | BigInt(value.charCodeAt(index));
    return Number(result);
  }
  const parsed = Number.parseInt(value, 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanArchivePath(path) {
  const normalized = String(path || "").replace(/^\.\//, "").replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const clean = parts.slice(1).join("/");
  if (!clean || clean.startsWith("/") || clean.split("/").some((part) => part === "..")) return null;
  return clean;
}

function parsePaxPath(text) {
  let offset = 0;
  let path = null;
  while (offset < text.length) {
    const space = text.indexOf(" ", offset);
    if (space === -1) break;
    const length = Number.parseInt(text.slice(offset, space), 10);
    if (!Number.isFinite(length) || length <= 0) break;
    const record = text.slice(space + 1, offset + length).replace(/\n$/, "");
    const equals = record.indexOf("=");
    if (equals !== -1 && record.slice(0, equals) === "path") path = record.slice(equals + 1);
    offset += length;
  }
  return path;
}

function candidateOrder(left, right) {
  return priority(right.path) - priority(left.path) || left.path.localeCompare(right.path);
}

export function parseTarArchive(bytes) {
  const tree = [];
  const candidates = [];
  let offset = 0;
  let pendingPath = null;
  let treeTruncated = false;

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const size = tarNumber(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (!Number.isSafeInteger(size) || size < 0 || dataEnd > bytes.length) throw new Error("GitHub archive was malformed");

    const body = bytes.subarray(dataStart, dataEnd);
    if (type === "x") pendingPath = parsePaxPath(decoder.decode(body)) || pendingPath;
    else if (type === "L") pendingPath = decoder.decode(body).replace(/\0.*$/s, "").trim();
    else {
      const archivePath = pendingPath || [prefix, name].filter(Boolean).join("/");
      pendingPath = null;
      const path = cleanArchivePath(archivePath);
      if (path && (type === "0" || type === "\0" || type === "5")) {
        if (tree.length >= MAX_TREE_ENTRIES) {
          treeTruncated = true;
          break;
        }
        const isFile = type !== "5";
        tree.push({ path, type: isFile ? "blob" : "tree", size: isFile ? size : 0, sha: null });
        if (isFile && size <= MAX_FILE_BYTES && !unsafeToRead(path)
          && (TEXT_EXTENSIONS.has(extension(path)) || priority(path) >= 90)) {
          candidates.push({ path, text: decoder.decode(body), truncated: false });
          candidates.sort(candidateOrder);
          if (candidates.length > MAX_FILES) candidates.pop();
        }
      }
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  const files = [];
  let total = 0;
  for (const candidate of candidates.sort(candidateOrder)) {
    if (total + candidate.text.length > MAX_TOTAL_BYTES) break;
    files.push(candidate);
    total += candidate.text.length;
  }
  return { tree, files, treeTruncated };
}

async function readBounded(stream, limit, label) {
  if (!stream) throw new Error(`${label} response had no body`);
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error(`${label} exceeded the ${Math.floor(limit / (1024 * 1024))} MiB safety limit`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function loadArchiveSnapshot(repository, ctx) {
  const headUrl = `https://github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/archive/HEAD.tar.gz`;
  const headResponse = await fetch(new Request(headUrl, {
    redirect: "manual",
    headers: { "user-agent": "opstruth-chatgpt-plugin/0.2.0" },
  }));
  if (headResponse.status === 404) throw new Error("Repository was not found or is not public");

  let archiveUrl = `https://codeload.github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/tar.gz/HEAD`;
  let headCommitSha = null;
  if (headResponse.status >= 300 && headResponse.status < 400) {
    const location = headResponse.headers.get("location");
    if (location) {
      const candidate = new URL(location);
      if (candidate.protocol === "https:" && candidate.hostname === "codeload.github.com") {
        archiveUrl = candidate.href;
        const ref = candidate.pathname.split("/").filter(Boolean).at(-1);
        if (/^[a-f0-9]{40,64}$/i.test(ref || "")) headCommitSha = ref;
      }
    }
  }

  const request = new Request(archiveUrl, { headers: { "user-agent": "opstruth-chatgpt-plugin/0.2.0" } });
  const response = await cachedFetch(request, ctx);
  if (response.status === 404) throw new Error("Repository was not found or is not public");
  if (!response.ok) throw new Error(`GitHub archive request failed with status ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ARCHIVE_COMPRESSED_BYTES) throw new Error("GitHub archive exceeded the 64 MiB compressed safety limit");

  let decompressedStream;
  try {
    decompressedStream = response.body.pipeThrough(new DecompressionStream("gzip"));
  } catch {
    throw new Error("GitHub archive could not be decompressed");
  }
  const archive = await readBounded(decompressedStream, MAX_ARCHIVE_UNCOMPRESSED_BYTES, "GitHub archive contents");
  const parsed = parseTarArchive(archive);
  if (!parsed.tree.length) throw new Error("GitHub archive did not contain a readable public repository tree");
  const lowerPaths = new Set(parsed.tree.map((entry) => entry.path.toLowerCase()));

  return {
    repository: {
      owner: repository.owner,
      name: repository.repo,
      fullName: repository.fullName,
      htmlUrl: repository.htmlUrl,
      description: null,
      defaultBranch: "HEAD",
      headTreeSha: null,
      headCommitSha,
      visibility: "public",
      archived: null,
      fork: null,
      pushedAt: null,
      license: [...lowerPaths].some((path) => /(?:^|\/)licen[cs]e(?:\.|$)/i.test(path)) ? "Detected in tree" : null,
      metadataSource: "public-archive-fallback",
    },
    tree: parsed.tree,
    files: parsed.files,
    limits: {
      treeEntriesObserved: parsed.tree.length,
      treeTruncated: parsed.treeTruncated,
      filesRead: parsed.files.length,
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES,
      archiveFallback: true,
    },
  };
}

async function fetchRawFile(repository, branch, entry) {
  const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");
  const url = `https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
  const response = await fetch(new Request(url, { headers: { "user-agent": "opstruth-chatgpt-plugin/0.2.0" } }));
  if (!response.ok) return null;
  const text = (await response.text()).slice(0, MAX_FILE_BYTES);
  return { path: entry.path, text, truncated: Number(entry.size || 0) > text.length };
}

async function fetchSelectedFiles(repository, branch, tree) {
  const selected = selectFiles(tree);
  const files = [];
  let total = 0;
  for (let index = 0; index < selected.length; index += 5) {
    const batch = await Promise.all(selected.slice(index, index + 5).map((entry) => fetchRawFile(repository, branch, entry)));
    for (const file of batch.filter(Boolean)) {
      if (total + file.text.length > MAX_TOTAL_BYTES) return files;
      files.push(file);
      total += file.text.length;
    }
  }
  return files;
}

export async function loadRepositorySnapshot(input, env = {}, ctx = {}) {
  const repository = parseRepository(input);
  let metadata;
  let treePayload;
  try {
    metadata = await githubApi(`/repos/${repository.owner}/${repository.repo}`, ctx);
    if (metadata.private) throw new Error("Private repositories require a future authenticated lane");
    treePayload = await githubApi(`/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`, ctx);
  } catch (error) {
    if (error?.code === "GITHUB_RATE_LIMIT") return loadArchiveSnapshot(repository, ctx);
    throw error;
  }
  const branch = metadata.default_branch;
  const completeTree = Array.isArray(treePayload.tree) ? treePayload.tree : [];
  const tree = bounded(completeTree, MAX_TREE_ENTRIES).map(({ path, type, size, sha }) => ({ path, type, size: size || 0, sha }));
  const files = await fetchSelectedFiles(repository, branch, tree);
  return {
    repository: {
      owner: repository.owner,
      name: repository.repo,
      fullName: metadata.full_name,
      htmlUrl: metadata.html_url,
      description: metadata.description,
      defaultBranch: branch,
      headTreeSha: treePayload.sha || null,
      visibility: metadata.visibility,
      archived: Boolean(metadata.archived),
      fork: Boolean(metadata.fork),
      pushedAt: metadata.pushed_at,
      license: metadata.license?.spdx_id || null,
    },
    tree,
    files,
    limits: {
      treeEntriesObserved: tree.length,
      treeTruncated: Boolean(treePayload.truncated) || completeTree.length > MAX_TREE_ENTRIES,
      filesRead: files.length,
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES,
    },
  };
}

export function fileMap(snapshot) {
  return new Map(snapshot.files.map((file) => [file.path, file.text]));
}

export function paths(snapshot) {
  return snapshot.tree.map((entry) => entry.path);
}

export function fileContents(snapshot) {
  return snapshot.files.map((file) => ({ path: file.path, text: file.text }));
}

export function declaredEnvironmentNames(snapshot) {
  const names = [];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
    /env\.([A-Z][A-Z0-9_]*)/g,
  ];
  for (const file of snapshot.files) {
    for (const pattern of patterns) {
      for (const match of file.text.matchAll(pattern)) names.push(match[1]);
    }
  }
  return unique(names).sort();
}
