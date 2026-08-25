import { bounded, unique } from "./utils.js";

const MAX_TREE_ENTRIES = 20000;
const MAX_FILES = 42;
const MAX_FILE_BYTES = 120000;
const MAX_TOTAL_BYTES = 1200000;
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
      throw new Error("GitHub public rate limit reached. Try again later");
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
  const metadata = await githubApi(`/repos/${repository.owner}/${repository.repo}`, ctx);
  if (metadata.private) throw new Error("Private repositories require a future authenticated lane");
  const branch = metadata.default_branch;
  const treePayload = await githubApi(`/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, ctx);
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
