import { gzipSync } from "node:zlib";

export const repositoryMetadata = {
  full_name: "Example/project",
  html_url: "https://github.com/Example/project",
  description: "Fixture project",
  default_branch: "main",
  visibility: "public",
  private: false,
  archived: false,
  fork: false,
  pushed_at: "2026-08-25T00:00:00Z",
  license: { spdx_id: "MIT" },
};

export const repositoryTree = {
  sha: "tree123",
  truncated: false,
  tree: [
    { path: "package.json", type: "blob", size: 180, sha: "1" },
    { path: "app/page.tsx", type: "blob", size: 80, sha: "2" },
    { path: "app/api/health/route.ts", type: "blob", size: 120, sha: "3" },
    { path: "src/router.tsx", type: "blob", size: 180, sha: "4" },
    { path: "orchestrator/src/index.ts", type: "blob", size: 280000, sha: "4b" },
    { path: "orchestrator/src/openapi.ts", type: "blob", size: 220, sha: "4c" },
    { path: "src/config.ts", type: "blob", size: 180, sha: "5" },
    { path: "src/leak.ts", type: "blob", size: 180, sha: "6" },
    { path: "migrations/001_init.sql", type: "blob", size: 180, sha: "7" },
    { path: ".github/workflows/ci.yml", type: "blob", size: 80, sha: "8" },
    { path: "wrangler.jsonc", type: "blob", size: 80, sha: "9" },
    { path: ".env", type: "blob", size: 80, sha: "10" },
    { path: "README.md", type: "blob", size: 80, sha: "11" },
    { path: "LICENSE", type: "blob", size: 80, sha: "12" },
  ],
};

export const fileBodies = {
  "package.json": JSON.stringify({ scripts: { build: "vite build", test: "node --test", deploy: "wrangler deploy" } }),
  "app/page.tsx": "export default function Page(){ return <main>Home</main> }",
  "app/api/health/route.ts": "export function GET(){ return Response.json({ok:true}) }",
  "src/router.tsx": "<Route path=\"/projects/:id\" element={<Project />} />",
  "orchestrator/src/index.ts": `app.get("/health", healthHandler);\napp.post(\n  "/api/tasks",\n  taskHandler,\n);\nrouter.route("/api/runs/:id").delete(deleteRun);`,
  "orchestrator/src/openapi.ts": `export const paths = { "/api/tasks": { get: {} }, "/api/runs/{id}": { delete: {} } };`,
  "src/config.ts": "export const endpoint = process.env.API_BASE_URL; const mode=import.meta.env.VITE_MODE;",
  "src/leak.ts": `const token = "${"ghp_" + "abcdefghijklmnopqrstuvwxyz123456"}";`,
  "migrations/001_init.sql": "ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;",
  ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test",
  "wrangler.jsonc": "{\"name\":\"fixture\",\"main\":\"src/worker.ts\"}",
  "README.md": "# Fixture",
};

export function installGithubFetchMock() {
  const original = globalThis.fetch;
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "api.github.com" && url.pathname === "/repos/Example/project") {
      return Response.json(repositoryMetadata);
    }
    if (url.hostname === "api.github.com" && url.pathname.includes("/git/trees/")) {
      return Response.json(repositoryTree);
    }
    if (url.hostname === "api.github.com" && url.pathname.endsWith("/branches/main")) {
      return Response.json({ name: "main", protected: true, commit: { sha: "commit123" } });
    }
    if (url.hostname === "api.github.com" && url.pathname.endsWith("/actions/runs")) {
      return Response.json({
        total_count: 1,
        workflow_runs: [{
          id: 101,
          name: "CI",
          event: "push",
          status: "completed",
          conclusion: "success",
          head_sha: "commit123",
          run_number: 7,
          run_started_at: "2026-08-25T01:00:00Z",
          updated_at: "2026-08-25T01:02:00Z",
          html_url: "https://github.com/Example/project/actions/runs/101",
        }],
      });
    }
    if (url.hostname === "api.github.com" && url.pathname.endsWith("/commits/commit123/check-runs")) {
      return Response.json({
        total_count: 1,
        check_runs: [{ id: 201, name: "verify", status: "completed", conclusion: "success", html_url: "https://github.com/Example/project/runs/201" }],
      });
    }
    if (url.hostname === "api.github.com" && url.pathname.endsWith("/commits/commit123/status")) {
      return Response.json({ state: "success", statuses: [{ context: "ci", state: "success", target_url: "https://github.com/Example/project/actions/runs/101" }] });
    }
    if (url.hostname === "raw.githubusercontent.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const path = parts.slice(3).map(decodeURIComponent).join("/");
      if (Object.hasOwn(fileBodies, path)) return new Response(fileBodies[path]);
      return new Response("not found", { status: 404 });
    }
    return new Response("unexpected", { status: 500 });
  };
  return () => { globalThis.fetch = original; };
}

function tarField(header, value, offset, length) {
  Buffer.from(String(value)).copy(header, offset, 0, length);
}

function tarHeader(path, size) {
  const header = Buffer.alloc(512);
  tarField(header, path, 0, 100);
  tarField(header, "0000644\0", 100, 8);
  tarField(header, "0000000\0", 108, 8);
  tarField(header, "0000000\0", 116, 8);
  tarField(header, `${size.toString(8).padStart(11, "0")}\0`, 124, 12);
  tarField(header, "00000000000\0", 136, 12);
  header.fill(32, 148, 156);
  tarField(header, "0", 156, 1);
  tarField(header, "ustar\0", 257, 6);
  tarField(header, "00", 263, 2);
  const checksum = [...header].reduce((total, byte) => total + byte, 0);
  tarField(header, `${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  return header;
}

export function repositoryArchive() {
  const parts = [];
  for (const [path, body] of Object.entries(fileBodies)) {
    if (path === ".env") continue;
    const bytes = Buffer.from(body);
    parts.push(tarHeader(`project-abc123/${path}`, bytes.length), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) parts.push(Buffer.alloc(padding));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

export function installRateLimitedGithubFetchMock() {
  const original = globalThis.fetch;
  const archive = repositoryArchive();
  globalThis.fetch = async (request) => {
    const url = new URL(typeof request === "string" ? request : request.url);
    if (url.hostname === "api.github.com") {
      return Response.json({ message: "rate limit" }, {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      });
    }
    if (url.hostname === "github.com" && url.pathname === "/Example/project/archive/HEAD.tar.gz") {
      return new Response(null, {
        status: 302,
        headers: { location: "https://codeload.github.com/Example/project/tar.gz/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      });
    }
    if (url.hostname === "codeload.github.com") {
      return new Response(archive, {
        headers: { "content-type": "application/x-gzip", "content-length": String(archive.length) },
      });
    }
    return new Response("unexpected", { status: 500 });
  };
  return () => { globalThis.fetch = original; };
}
