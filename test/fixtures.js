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
