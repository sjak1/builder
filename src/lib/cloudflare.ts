// Cloudflare Pages "Direct Upload" deployment.
//
// Docs: https://developers.cloudflare.com/pages/get-started/direct-upload/
// The flow is 4 steps:
//   1. Ensure the Pages project exists (idempotent — 409 means "already there")
//   2. Get a deployment upload JWT
//   3. POST each unique file blob (skipping ones CF already has)
//   4. Create a deployment with a manifest of {filepath: hash}
//
// All runs server-side. The browser sends us the built dist/ as a flat
// path→contents map; we never expose CLOUDFLARE_API_TOKEN to the client.

import crypto from "node:crypto";

const API = "https://api.cloudflare.com/client/v4";

export type CfFile = { path: string; contents: string };

type CfResponse<T> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  messages?: unknown[];
  result?: T;
};

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function cf<T>(
  url: string,
  init: RequestInit,
  token: string,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...authHeaders(token), ...(init.headers as Record<string, string>) },
  });
  const json = (await res.json()) as CfResponse<T>;
  if (!json.success) {
    const msg = json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ||
      `HTTP ${res.status}`;
    throw new Error(`Cloudflare API: ${msg}`);
  }
  return json.result as T;
}

// SHA-256 hash of a file's content — what Cloudflare expects in the manifest.
// MUST be exactly 32 hex chars (16 bytes). They use this to dedupe and skip
// already-uploaded blobs, and to look up files when serving requests.
function fileHash(contents: string): string {
  return crypto
    .createHash("sha256")
    .update(contents)
    .digest("hex")
    .slice(0, 32);
}

export async function createProjectIfMissing(
  accountId: string,
  token: string,
  name: string,
): Promise<void> {
  const res = await fetch(`${API}/accounts/${accountId}/pages/projects`, {
    method: "POST",
    headers: { ...authHeaders(token), "content-type": "application/json" },
    body: JSON.stringify({
      name,
      production_branch: "main",
    }),
  });
  if (res.ok) return;
  // 409 / already exists = fine. Anything else = propagate.
  const text = await res.text();
  if (res.status === 409 || /already\s*exists/i.test(text)) return;
  throw new Error(`Failed to create CF Pages project "${name}": ${text}`);
}

async function getUploadJwt(
  accountId: string,
  token: string,
  projectName: string,
): Promise<string> {
  const result = await cf<{ jwt: string }>(
    `${API}/accounts/${accountId}/pages/projects/${projectName}/upload-token`,
    { method: "GET" },
    token,
  );
  return result.jwt;
}

async function checkMissingHashes(
  jwt: string,
  allHashes: string[],
): Promise<string[]> {
  const res = await fetch(`${API}/pages/assets/check-missing`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ hashes: allHashes }),
  });
  const json = (await res.json()) as CfResponse<string[]>;
  if (!json.success) {
    throw new Error(
      `check-missing failed: ${json.errors?.map((e) => e.message).join("; ")}`,
    );
  }
  return json.result || [];
}

async function uploadBatch(
  jwt: string,
  payloads: { key: string; value: string; metadata: { contentType: string } }[],
): Promise<void> {
  if (payloads.length === 0) return;
  const res = await fetch(`${API}/pages/assets/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payloads),
  });
  const json = (await res.json()) as CfResponse<unknown>;
  if (!json.success) {
    throw new Error(
      `asset upload failed: ${json.errors?.map((e) => e.message).join("; ")}`,
    );
  }
}

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    txt: "text/plain; charset=utf-8",
    map: "application/json",
  };
  return map[ext || ""] || "application/octet-stream";
}

async function createDeployment(
  accountId: string,
  token: string,
  projectName: string,
  manifest: Record<string, string>,
): Promise<{ url: string; id: string }> {
  // The manifest endpoint needs the deployment created via multipart form,
  // with the manifest as a JSON string field. Empty file list = "use only
  // assets already uploaded via the JWT flow".
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  // Without branch, CF treats this as a preview deployment and serves it on a
  // hash-prefixed subdomain that often lacks SSL until prod is set up. Pin to
  // the project's production branch so we always get the canonical URL.
  form.append("branch", "main");

  const res = await fetch(
    `${API}/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: form,
    },
  );
  const json = (await res.json()) as CfResponse<{ url: string; id: string }>;
  if (!json.success || !json.result) {
    throw new Error(
      `create deployment failed: ${json.errors?.map((e) => e.message).join("; ")}`,
    );
  }
  return { url: json.result.url, id: json.result.id };
}

// Main entry: takes dist files, returns the live URL.
export async function deployToCloudflarePages(opts: {
  accountId: string;
  token: string;
  projectName: string;
  files: CfFile[];
}): Promise<{ url: string; id: string }> {
  const { accountId, token, projectName, files } = opts;

  await createProjectIfMissing(accountId, token, projectName);
  const jwt = await getUploadJwt(accountId, token, projectName);

  // Build a manifest mapping leading-slash filepath → 32-char file key.
  const manifest: Record<string, string> = {};
  const blobByKey = new Map<string, CfFile & { key: string }>();
  for (const f of files) {
    const key = fileHash(f.contents);
    manifest["/" + f.path.replace(/^\/+/, "")] = key;
    blobByKey.set(key, { ...f, key });
  }

  // Ask CF which file keys it doesn't have yet, then upload just those.
  const missing = await checkMissingHashes(jwt, [...blobByKey.keys()]);
  const toUpload = missing
    .map((key) => blobByKey.get(key))
    .filter((b): b is CfFile & { key: string } => !!b);

  // Batch in groups to stay under request size limits.
  const BATCH = 50;
  for (let i = 0; i < toUpload.length; i += BATCH) {
    const slice = toUpload.slice(i, i + BATCH);
    await uploadBatch(
      jwt,
      slice.map((f) => ({
        key: f.key,
        // Without base64: true, CF stores the raw base64 STRING as the file
        // contents instead of decoding it — so the page literally serves
        // "PCFkb2N0eXBlIGh0bWw+..." text. The flag tells CF to decode first.
        value: Buffer.from(f.contents, "utf8").toString("base64"),
        base64: true,
        metadata: { contentType: contentTypeFor(f.path) },
      })),
    );
  }

  return createDeployment(accountId, token, projectName, manifest);
}

// Project name must be 1-58 chars, lowercase letters, digits, dashes.
// We derive from the project UUID so each builder project maps to one CF
// Pages project (re-deploys go to the same URL slug).
export function projectNameFor(projectUuid: string): string {
  // Short, stable, valid CF name.
  const short = projectUuid.replace(/-/g, "").slice(0, 12).toLowerCase();
  return `builder-${short}`;
}
