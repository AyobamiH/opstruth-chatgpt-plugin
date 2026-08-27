import { bounded, unique } from "./utils.js";
import { PLUGIN_VERSION } from "./version.js";

const MAX_TREE_ENTRIES = 20000;
// Keep repository, status and file fetches below Cloudflare's per-invocation subrequest ceiling.
const MAX_FILES = 30;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_GITHUB_API_BYTES = 16 * 1024 * 1024;
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

function githubHeaders(env = {}) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": `opstruth-chatgpt-plugin/${PLUGIN_VERSION}`,
    "x-github-api-version": "2022-11-28",
  };
  if (env?.GITHUB_READ_TOKEN) headers.authorization = `Bearer ${env.GITHUB_READ_TOKEN}`;
  return headers;
}

async function githubApi(path, ctx, env = {}) {
  const headers = githubHeaders(env);
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
  const bytes = await readBounded(response.body, MAX_GITHUB_API_BYTES, "GitHub API response");
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error("GitHub API returned invalid JSON");
  }
}

async function optionalGithubApi(path, ctx, env = {}) {
  try {
    return { available: true, value: await githubApi(path, ctx, env), reason: null };
  } catch (error) {
    return { available: false, value: null, reason: error?.code === "GITHUB_RATE_LIMIT" ? "rate_limited" : error.message };
  }
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
  let score = 10;
  if (["package.json", "pyproject.toml", "cargo.toml", "go.mod", "pom.xml", "composer.json"].includes(base)) score = lower.includes("/") ? 88 : 100;
  else if (["wrangler.json", "wrangler.jsonc", "wrangler.toml", "vercel.json", "netlify.toml", "dockerfile", "tsconfig.json", "openapi.json", "openapi.yaml", "openapi.yml"].includes(base)) score = 100;
  else if (lower.startsWith(".github/workflows/") || ["readme.md", "contributing.md", "security.md"].includes(base)) score = 95;
  else if (/(?:^|\/)migrations?\//.test(lower)) score = 90;
  else if (/(?:^|\/)(?:app|pages)\/.+\/(?:page|route)\.(?:js|jsx|ts|tsx)$/.test(lower)) score = 92;
  else if (/(?:^|\/)(?:orchestrator|server|backend|api|worker)\/src\/(?:index|app|server|router|routes|api|worker|openapi)\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(lower)) score = 99;
  else if (/(?:^|\/)src\/(?:index|app|server|router|routes|api|worker)\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(lower)) score = 96;
  else if (/(?:router|routes|api|server|worker|index)\.(?:js|jsx|ts|tsx|mjs|cjs)$/.test(base)) score = 84;
  else if (/(?:^|\/)(?:src|app|pages|api|server|worker)\//.test(lower)) score = 62;
  else if (/\.(?:md|json|ya?ml|toml)$/.test(lower)) score = 30;

  if (/(?:^|\/)(?:node_modules|dist|build|coverage|vendor|third[_-]?party|\.next|\.cache|fixtures?|__snapshots__)(?:\/|$)/.test(lower)) return -100;
  if (/(?:^|\/)(?:openai-cookbook|openclaw-docs|cookbook)(?:\/|$)/.test(lower)) score -= 90;
  else if (/(?:^|\/)(?:test|tests|examples?|docs)(?:\/|$)/.test(lower) && score < 90) score -= 70;
  return score;
}

function selectFiles(tree) {
  return tree
    .filter((entry) => entry.type === "blob" && Number(entry.size || 0) <= MAX_FILE_BYTES)
    .filter((entry) => TEXT_EXTENSIONS.has(extension(entry.path)) || priority(entry.path) >= 90)
    .filter((entry) => !unsafeToRead(entry.path))
    .filter((entry) => priority(entry.path) > 0)
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
        if (isFile && size <= MAX_FILE_BYTES && !unsafeToRead(path) && priority(path) > 0
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
    headers: { "user-agent": `opstruth-chatgpt-plugin/${PLUGIN_VERSION}` },
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

  const request = new Request(archiveUrl, { headers: { "user-agent": `opstruth-chatgpt-plugin/${PLUGIN_VERSION}` } });
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
      providerRepositoryId: null,
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
  const response = await fetch(new Request(url, { headers: { "user-agent": `opstruth-chatgpt-plugin/${PLUGIN_VERSION}` } }));
  if (!response.ok) return null;
  const bytes = await readBounded(response.body, MAX_FILE_BYTES, "GitHub raw file");
  const text = decoder.decode(bytes);
  return { path: entry.path, text, truncated: Number(entry.size || 0) > bytes.byteLength };
}

async function fetchSelectedFiles(repository, branch, tree) {
  const selected = selectFiles(tree);
  const files = [];
  let total = 0;
  for (let index = 0; index < selected.length; index += 10) {
    const batch = await Promise.all(selected.slice(index, index + 10).map((entry) => fetchRawFile(repository, branch, entry)));
    for (const file of batch.filter(Boolean)) {
      if (total + file.text.length > MAX_TOTAL_BYTES) return files;
      files.push(file);
      total += file.text.length;
    }
  }
  return files;
}

function unavailableGithubStatus(defaultBranch, reason) {
  return {
    source: "github-public-api",
    available: false,
    reason,
    defaultBranch,
    headCommitSha: null,
    branchProtection: { available: false, protected: null, reason },
    workflowRuns: { available: false, totalObserved: 0, latest: [], reason },
    checkRuns: { available: false, totalObserved: 0, latest: [], reason },
    commitStatus: { available: false, state: null, contexts: [], reason },
  };
}

async function loadGithubStatus(repository, defaultBranch, ctx, env = {}) {
  const encodedBranch = encodeURIComponent(defaultBranch);
  const [branchResult, workflowResult] = await Promise.all([
    optionalGithubApi(`/repos/${repository.owner}/${repository.repo}/branches/${encodedBranch}`, ctx, env),
    optionalGithubApi(`/repos/${repository.owner}/${repository.repo}/actions/runs?branch=${encodedBranch}&per_page=20&exclude_pull_requests=true`, ctx, env),
  ]);
  const headCommitSha = branchResult.value?.commit?.sha || null;
  const [checksResult, statusResult] = headCommitSha
    ? await Promise.all([
      optionalGithubApi(`/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(headCommitSha)}/check-runs?per_page=100`, ctx, env),
      optionalGithubApi(`/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(headCommitSha)}/status`, ctx, env),
    ])
    : [{ available: false, value: null, reason: branchResult.reason || "head_commit_unavailable" }, { available: false, value: null, reason: branchResult.reason || "head_commit_unavailable" }];

  const workflowRuns = Array.isArray(workflowResult.value?.workflow_runs)
    ? workflowResult.value.workflow_runs.slice(0, 20).map((run) => ({
      id: run.id,
      name: run.name || run.display_title || "Unnamed workflow",
      event: run.event || null,
      status: run.status || null,
      conclusion: run.conclusion || null,
      headSha: run.head_sha || null,
      runNumber: run.run_number || null,
      startedAt: run.run_started_at || run.created_at || null,
      updatedAt: run.updated_at || null,
      htmlUrl: run.html_url || null,
    }))
    : [];
  const checkRuns = Array.isArray(checksResult.value?.check_runs)
    ? checksResult.value.check_runs.slice(0, 100).map((run) => ({
      id: run.id,
      name: run.name || "Unnamed check",
      status: run.status || null,
      conclusion: run.conclusion || null,
      startedAt: run.started_at || null,
      completedAt: run.completed_at || null,
      htmlUrl: run.html_url || null,
    }))
    : [];
  const contexts = Array.isArray(statusResult.value?.statuses)
    ? statusResult.value.statuses.slice(0, 100).map((status) => ({
      context: status.context || null,
      state: status.state || null,
      updatedAt: status.updated_at || status.created_at || null,
      targetUrl: status.target_url || null,
    }))
    : [];
  const anyAvailable = branchResult.available || workflowResult.available || checksResult.available || statusResult.available;
  return {
    source: "github-public-api",
    available: anyAvailable,
    reason: anyAvailable ? null : branchResult.reason || workflowResult.reason || "github_status_unavailable",
    defaultBranch,
    headCommitSha,
    branchProtection: {
      available: branchResult.available,
      protected: branchResult.available ? Boolean(branchResult.value?.protected) : null,
      reason: branchResult.reason,
    },
    workflowRuns: {
      available: workflowResult.available,
      totalObserved: Number(workflowResult.value?.total_count || workflowRuns.length),
      latest: workflowRuns,
      reason: workflowResult.reason,
    },
    checkRuns: {
      available: checksResult.available,
      totalObserved: Number(checksResult.value?.total_count || checkRuns.length),
      latest: checkRuns,
      reason: checksResult.reason,
    },
    commitStatus: {
      available: statusResult.available,
      state: statusResult.value?.state || null,
      contexts,
      reason: statusResult.reason,
    },
  };
}

export async function loadRepositorySnapshot(input, env = {}, ctx = {}) {
  const repository = parseRepository(input);
  let metadata;
  let treePayload;
  try {
    metadata = await githubApi(`/repos/${repository.owner}/${repository.repo}`, ctx, env);
    if (metadata.private) throw new Error("Private repositories require a future authenticated lane");
    treePayload = await githubApi(`/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`, ctx, env);
  } catch (error) {
    if (error?.code === "GITHUB_RATE_LIMIT") {
      const snapshot = await loadArchiveSnapshot(repository, ctx);
      snapshot.githubStatus = unavailableGithubStatus(snapshot.repository.defaultBranch, "rate_limited");
      return snapshot;
    }
    throw error;
  }
  const branch = metadata.default_branch;
  const completeTree = Array.isArray(treePayload.tree) ? treePayload.tree : [];
  const tree = bounded(completeTree, MAX_TREE_ENTRIES).map(({ path, type, size, sha }) => ({ path, type, size: size || 0, sha }));
  const [files, githubStatus] = await Promise.all([
    fetchSelectedFiles(repository, branch, tree),
    loadGithubStatus(repository, branch, ctx, env),
  ]);
  return {
    repository: {
      owner: repository.owner,
      name: repository.repo,
      fullName: metadata.full_name,
      providerRepositoryId: metadata.id === undefined || metadata.id === null ? null : String(metadata.id),
      htmlUrl: metadata.html_url,
      description: metadata.description,
      defaultBranch: branch,
      headTreeSha: treePayload.sha || null,
      visibility: metadata.visibility,
      archived: Boolean(metadata.archived),
      fork: Boolean(metadata.fork),
      pushedAt: metadata.pushed_at,
      license: metadata.license?.spdx_id || null,
      headCommitSha: githubStatus.headCommitSha,
    },
    tree,
    files,
    githubStatus,
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
