"use client";

import { WebContainer, type FileSystemTree } from "@webcontainer/api";

type Status =
  | { kind: "idle" }
  | { kind: "booting" }
  | { kind: "installing" }
  | { kind: "starting" }
  | { kind: "ready"; url: string }
  | { kind: "error"; message: string };

type Listener = (status: Status) => void;

class WebContainerManager {
  private container: WebContainer | null = null;
  private bootPromise: Promise<WebContainer> | null = null;
  private status: Status = { kind: "idle" };
  private listeners = new Set<Listener>();
  private logListeners = new Set<(line: string) => void>();

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  onLog(fn: (line: string) => void) {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }

  getStatus() {
    return this.status;
  }

  private setStatus(status: Status) {
    this.status = status;
    for (const fn of this.listeners) fn(status);
  }

  private log(line: string) {
    for (const fn of this.logListeners) fn(line);
  }

  async boot(initialTree: FileSystemTree): Promise<WebContainer> {
    if (this.container) return this.container;
    if (this.bootPromise) return this.bootPromise;

    this.bootPromise = (async () => {
      const tBoot = performance.now();
      const phase = (name: string, start: number) =>
        console.log(`[wc] ${name}: ${(performance.now() - start).toFixed(0)}ms`);

      this.setStatus({ kind: "booting" });
      const tWc = performance.now();
      const wc = await WebContainer.boot();
      this.container = wc;
      phase("WebContainer.boot()", tWc);

      wc.on("server-ready", (_port, url) => {
        console.log(
          `[wc] server-ready (total cold boot: ${(performance.now() - tBoot).toFixed(0)}ms)`,
        );
        this.setStatus({ kind: "ready", url });
      });
      wc.on("error", (err) => {
        this.setStatus({ kind: "error", message: err.message });
      });

      const tSnap = performance.now();
      const snapshot = await fetchSnapshot();
      phase("fetchSnapshot()", tSnap);

      if (snapshot) {
        const tMount = performance.now();
        await wc.mount(snapshot);
        phase("wc.mount(snapshot)", tMount);

        const tOverlay = performance.now();
        await overlayTree(wc, initialTree);
        phase("overlayTree()", tOverlay);

        await this.startDevServer();
      } else {
        await wc.mount(initialTree);
        await this.startDevServer();
      }
      return wc;
    })();

    return this.bootPromise;
  }

  private async startDevServer() {
    if (!this.container) return;
    this.setStatus({ kind: "starting" });

    // Bypass node_modules/.bin/vite (the snapshot serializer strips its
    // executable bit). Invoke Vite's JS entry directly via node — same result.
    console.log("[wc] spawning: node node_modules/vite/bin/vite.js");
    const dev = await this.container.spawn("node", [
      "node_modules/vite/bin/vite.js",
      "--host",
      "0.0.0.0",
      "--port",
      "5173",
    ]);
    this.pipeOutput(dev, "dev");

    // Don't await dev.exit — it shouldn't exit, but log if it does.
    dev.exit
      .then((code) => {
        console.warn(`[wc] dev server exited with code ${code}`);
        this.log(`\n\n*** dev server exited with code ${code} ***\n`);
        if (code !== 0) {
          this.setStatus({
            kind: "error",
            message: `dev server exited (code ${code})`,
          });
        }
      })
      .catch((err) => {
        console.error("[wc] dev server errored:", err);
      });
  }

  private pipeOutput(
    proc: Awaited<ReturnType<WebContainer["spawn"]>>,
    label = "proc",
  ) {
    let bytes = 0;
    proc.output
      .pipeTo(
        new WritableStream({
          write: (chunk) => {
            bytes += chunk.length;
            this.log(chunk);
          },
        }),
      )
      .then(() => console.log(`[wc] ${label} output stream closed (${bytes}B)`))
      .catch((err) => console.error(`[wc] ${label} pipe failed:`, err));
  }

  async writeFile(path: string, contents: string) {
    if (!this.container) throw new Error("WebContainer not booted");
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir) {
      await this.container.fs.mkdir(dir, { recursive: true });
    }
    await this.container.fs.writeFile(path, contents);
  }

  async deleteFile(path: string) {
    if (!this.container) throw new Error("WebContainer not booted");
    try {
      await this.container.fs.rm(path, { force: true });
    } catch {
      // ignore — already gone
    }
  }

  async restoreFiles(snapshot: Record<string, string>) {
    if (!this.container) throw new Error("WebContainer not booted");
    const current = await this.readAllFiles();
    const snapshotPaths = new Set(Object.keys(snapshot));

    for (const path of Object.keys(current)) {
      if (!snapshotPaths.has(path)) {
        await this.deleteFile(path);
      }
    }
    for (const [path, contents] of Object.entries(snapshot)) {
      if (current[path] !== contents) {
        await this.writeFile(path, contents);
      }
    }
  }

  async readAllFiles(): Promise<Record<string, string>> {
    if (!this.container) return {};
    return collectFromContainer(this.container);
  }

  // Runs `npm run build` inside the WebContainer, then returns the contents
  // of the resulting dist/ folder as a flat path→contents map. Throws if
  // the build exits non-zero.
  async buildFrontend(
    onProgress?: (line: string) => void,
  ): Promise<Record<string, string>> {
    if (!this.container) throw new Error("WebContainer not booted");
    this.log("\n*** building production bundle ***\n");
    const proc = await this.container.spawn("node", [
      "node_modules/vite/bin/vite.js",
      "build",
    ]);
    proc.output.pipeTo(
      new WritableStream({
        write: (chunk) => {
          this.log(chunk);
          onProgress?.(chunk);
        },
      }),
    );
    const code = await proc.exit;
    if (code !== 0) {
      throw new Error(`vite build exited with code ${code}`);
    }
    // Vite writes dist/ at the root of the WC fs.
    return collectDir(this.container, "dist");
  }
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".vite",
  "dist",
  ".cache",
  ".git",
  ".builder",
]);

type SnapshotManifest = {
  base?: {
    path?: string;
    gzipPath?: string;
    sha256?: string;
    gzipSha256?: string;
  };
};

async function fetchSnapshot(): Promise<Uint8Array | null> {
  const manifest = await fetchSnapshotManifest();
  const snapshotPath = manifest?.base?.path ?? "/snapshots/base.bin";
  const gzipPath = manifest?.base?.gzipPath ?? "/snapshots/base.bin.gz";
  const rawVersion = manifest?.base?.sha256;
  const gzipVersion = manifest?.base?.gzipSha256 ?? rawVersion;

  // Try the gzipped variant first — it's ~3x smaller. DecompressionStream is
  // standard in all modern browsers and runs natively (no JS gzip lib).
  const gz = await tryFetch(versionedUrl(gzipPath, gzipVersion));
  if (gz && typeof DecompressionStream !== "undefined") {
    try {
      const t0 = performance.now();
      const decompressed = new Response(
        gz.body!.pipeThrough(new DecompressionStream("gzip")),
      );
      const buf = await decompressed.arrayBuffer();
      console.log(
        `[wc] decompressed snapshot in ${(performance.now() - t0).toFixed(0)}ms (${(
          buf.byteLength /
          1024 /
          1024
        ).toFixed(1)}MB)`,
      );
      if (buf.byteLength >= 1024) return new Uint8Array(buf);
    } catch (err) {
      console.warn("[wc] gz decompression failed, falling back", err);
    }
  }
  const raw = await tryFetch(versionedUrl(snapshotPath, rawVersion));
  if (!raw) return null;
  const buf = await raw.arrayBuffer();
  if (buf.byteLength < 1024) return null;
  return new Uint8Array(buf);
}

async function fetchSnapshotManifest(): Promise<SnapshotManifest | null> {
  try {
    const res = await fetch("/snapshots/manifest.json", { cache: "no-cache" });
    if (!res.ok) return null;
    return (await res.json()) as SnapshotManifest;
  } catch {
    return null;
  }
}

function versionedUrl(url: string, version?: string) {
  if (!version) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

async function tryFetch(url: string): Promise<Response | null> {
  try {
    const t0 = performance.now();
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    console.log(
      `[wc] fetched ${url} (${res.status}) in ${(performance.now() - t0).toFixed(0)}ms`,
    );
    return res;
  } catch {
    return null;
  }
}

// Walk a FileSystemTree and write every file via wc.fs, creating dirs as needed.
// This is how we overlay per-template source on top of a base snapshot.
async function overlayTree(
  wc: WebContainer,
  tree: FileSystemTree,
  prefix = "",
): Promise<void> {
  for (const [name, node] of Object.entries(tree)) {
    const fullPath = prefix ? `${prefix}/${name}` : name;
    if ("file" in node) {
      const f = node.file;
      if ("contents" in f && typeof f.contents === "string") {
        const dir = fullPath.split("/").slice(0, -1).join("/");
        if (dir) await wc.fs.mkdir(dir, { recursive: true });
        await wc.fs.writeFile(fullPath, f.contents);
      }
    } else if ("directory" in node) {
      await wc.fs.mkdir(fullPath, { recursive: true });
      await overlayTree(wc, node.directory, fullPath);
    }
  }
}

async function collectFromContainer(
  wc: WebContainer,
  prefix = "",
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const entries = await wc.fs.readdir(prefix || ".", { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(out, await collectFromContainer(wc, path));
    } else {
      try {
        out[path] = await wc.fs.readFile(path, "utf-8");
      } catch {
        // skip binary or unreadable
      }
    }
  }
  return out;
}

// Recursively read a single directory tree, returning a flat path map keyed
// from the directory root (NOT including the prefix itself — so dist/index.html
// becomes "index.html"). Used by buildFrontend to package the production
// bundle for upload to Cloudflare.
async function collectDir(
  wc: WebContainer,
  rootDir: string,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(absDir: string, relPrefix: string) {
    const entries = await wc.fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = `${absDir}/${entry.name}`;
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else {
        // Use utf-8 — Pages serves text files. Binary assets (images, fonts)
        // are decoded to a "string" of bytes here; the server re-encodes via
        // Buffer.from(..., "utf8") which preserves the bytes 1:1 because
        // WebContainer's readFile returns a string-of-bytes for utf8 mode.
        try {
          out[rel] = await wc.fs.readFile(abs, "utf-8");
        } catch {
          // unreadable — skip
        }
      }
    }
  }
  await walk(rootDir, "");
  return out;
}

export const wcManager = new WebContainerManager();
export type { Status };
