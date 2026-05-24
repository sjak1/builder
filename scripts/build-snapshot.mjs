#!/usr/bin/env node
/**
 * Builds a WebContainer snapshot of the base template with node_modules
 * already installed. The snapshot is loaded by the browser on boot so we
 * skip the ~60s `npm install` step entirely.
 *
 * Run manually with `pnpm build-snapshot`. Re-run whenever base deps change.
 */

import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { snapshot } from "@webcontainer/snapshot";

const gzip = promisify(zlib.gzip);

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(PROJECT_ROOT, "public", "snapshots");
const OUT_FILE = path.join(OUT_DIR, "base.bin");
const OUT_MANIFEST = path.join(OUT_DIR, "manifest.json");

// Keep this in sync with src/lib/template.ts. We deliberately do NOT
// include src/App.tsx — the app overlays it (and other template-variant files)
// after mounting the snapshot, so a single snapshot serves all templates.
const BASE_FILES = {
  "package.json": JSON.stringify(
    {
      name: "generated-app",
      private: true,
      type: "module",
      scripts: {
        dev: "vite --host 0.0.0.0 --port 5173",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
        // Hono ships with the snapshot so every project is fullstack-capable.
        // api/index.ts default-exports a Hono app; Vite mounts it under /api in
        // dev. Same code deploys to Cloudflare Workers in production — Hono is
        // runtime-agnostic (Web Standard fetch).
        hono: "^4.6.14",
        "@hono/node-server": "^1.13.7",
      },
      devDependencies: {
        "@vitejs/plugin-react": "^4.3.4",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        tailwindcss: "^3.4.17",
        autoprefixer: "^10.4.20",
        postcss: "^8.4.49",
        typescript: "^5.7.2",
        vite: "^6.0.7",
      },
      // WebContainer is a WASM port of Node — it cannot dlopen native ELF
      // `.node` binaries. Vite's default pipeline pulls in rollup (native)
      // and esbuild (native), both of which crash on boot inside WC.
      // Alias them to their pure-JS/WASM equivalents so Vite uses those
      // instead. This is the StackBlitz-recommended pattern for Vite in WC.
      overrides: {
        rollup: "npm:@rollup/wasm-node@^4.0.0",
        esbuild: "npm:esbuild-wasm@^0.24.0",
      },
    },
    null,
    2,
  ),
  "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173 },
});
`,
  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        isolatedModules: true,
        noEmit: true,
      },
      include: ["src"],
    },
    null,
    2,
  ),
  "postcss.config.js": `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`,
  "tailwind.config.js": `export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`,
  // index.html and src/* are overlaid client-side after mount so we can keep
  // the error-reporter script and per-template App.tsx fresh without
  // rebuilding the snapshot.
  "src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  "src/App.tsx": `export default function App() { return null; }\n`,
  "src/index.css": `@tailwind base;
@tailwind components;
@tailwind utilities;
`,
  "index.html": `<!doctype html>
<html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>
`,
};

async function dereferenceSymlinks(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // Replace symlink with a copy of the file it points to.
      const target = await fs.realpath(full);
      const stat = await fs.stat(target);
      await fs.unlink(full);
      if (stat.isDirectory()) {
        await fs.cp(target, full, { recursive: true, dereference: true });
        await dereferenceSymlinks(full);
      } else {
        await fs.copyFile(target, full);
        // Preserve executable bit (matters for files in .bin/).
        await fs.chmod(full, stat.mode);
      }
    } else if (entry.isDirectory()) {
      await dereferenceSymlinks(full);
    }
  }
}

async function writeTree(dir, files) {
  for (const [relPath, contents] of Object.entries(files)) {
    const abs = path.join(dir, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, contents);
  }
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "wc-snapshot-"));
  console.log(`→ scaffolding base template at ${tmp}`);
  await writeTree(tmp, BASE_FILES);

  console.log("→ running npm install (this is the slow part)…");
  // WebContainer runs linux/x64/musl. Force npm to install native binaries for
  // that platform (rollup, esbuild, etc.) instead of the host's. Without these
  // flags, snapshots built on macOS ship darwin-arm64 binaries that crash on
  // boot with "Cannot find module @rollup/rollup-linux-x64-musl". The native
  // binaries are also pinned in BASE_FILES.package.json as a guard against
  // npm/cli#4828 (optional deps occasionally skipped cross-platform).
  execSync(
    "npm install --no-audit --no-fund --loglevel=error " +
      "--os=linux --cpu=x64 --libc=musl --include=optional",
    { cwd: tmp, stdio: "inherit" },
  );

  // Verify rollup resolved to the WASM build, not the native one. WebContainer
  // can't load native .node binaries, so if `npm overrides` didn't take effect
  // the dev server would crash on boot — better to fail loudly here.
  const rollupPkg = JSON.parse(
    await fs.readFile(path.join(tmp, "node_modules", "rollup", "package.json"), "utf8"),
  );
  if (rollupPkg.name !== "@rollup/wasm-node") {
    throw new Error(
      `Expected node_modules/rollup to resolve to @rollup/wasm-node, ` +
        `got ${rollupPkg.name}@${rollupPkg.version}. ` +
        "WebContainer can't dlopen native .node binaries.",
    );
  }

  console.log("→ dereferencing symlinks (snapshot doesn't support them)…");
  await dereferenceSymlinks(tmp);

  console.log("→ creating snapshot…");
  const buf = await snapshot(tmp);

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, buf);

  const sizeMb = (buf.byteLength / 1024 / 1024).toFixed(1);
  console.log(`✓ wrote ${path.relative(PROJECT_ROOT, OUT_FILE)} (${sizeMb} MB)`);

  console.log("→ gzipping for faster network transfer…");
  const gz = await gzip(buf, { level: 9 });
  const gzPath = `${OUT_FILE}.gz`;
  await fs.writeFile(gzPath, gz);
  const gzMb = (gz.byteLength / 1024 / 1024).toFixed(1);
  const ratio = ((1 - gz.byteLength / buf.byteLength) * 100).toFixed(0);
  console.log(`✓ wrote ${path.relative(PROJECT_ROOT, gzPath)} (${gzMb} MB, -${ratio}%)`);

  const manifest = {
    base: {
      path: "/snapshots/base.bin",
      gzipPath: "/snapshots/base.bin.gz",
      sha256: sha256(buf),
      gzipSha256: sha256(gz),
      bytes: buf.byteLength,
      gzipBytes: gz.byteLength,
      generatedAt: new Date().toISOString(),
    },
  };
  await fs.writeFile(OUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`✓ wrote ${path.relative(PROJECT_ROOT, OUT_MANIFEST)}`);

  await fs.rm(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
