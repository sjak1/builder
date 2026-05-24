# Builder — Architecture

End-to-end map of how the app fits together. Read top → bottom.

---

## 1. The big picture (two-tier)

```
┌──────────────────────────────────────────────────────────────┐
│  BUILDER APP (this repo)        →  hosted on Vercel later    │
│  Next.js 16 · React · Tailwind                               │
│                                                              │
│  ┌────────────┐   ┌──────────────┐   ┌────────────────────┐  │
│  │  Browser   │←→ │  Next.js     │←→ │  Supabase          │  │
│  │  (chat +   │   │  API routes  │   │  · Postgres        │  │
│  │  preview)  │   │  (server)    │   │  · Auth (magic)    │  │
│  └─────┬──────┘   └──────┬───────┘   │  · RLS             │  │
│        │                 │           └────────────────────┘  │
│        │                 │                                   │
│        │                 └─→ Anthropic API (Claude)          │
│        │                                                     │
│        ▼                                                     │
│  ┌─────────────────┐                                         │
│  │  WebContainer   │  ← runs the user's app in the BROWSER   │
│  │  (Node + Vite + │    (StackBlitz tech, in-browser Linux)  │
│  │   Hono backend) │                                         │
│  └─────────────────┘                                         │
└──────────────────────────────────────────────────────────────┘
                                  │
                                  │  on "Deploy"
                                  ▼
                  ┌────────────────────────────────┐
                  │  USER'S DEPLOYED APP           │
                  │  Cloudflare Pages              │
                  │  builder-<id>.pages.dev        │
                  └────────────────────────────────┘
```

**Two separate planes:**
- **Supabase** = brain of the Builder itself (who you are, which projects you own).
- **Cloudflare Pages** = where users' generated apps go to actually live on the internet.

---

## 2. The user journey

1. **Land on `/`** → marketing page (`src/app/page.tsx`).
2. **Sign in** via magic link (`src/app/login/page.tsx` → Supabase auth → `src/app/auth/callback/route.ts`).
3. **Dashboard** (`src/app/dashboard/page.tsx`) — server component, fetches your projects from Supabase, renders the card grid.
4. **Click "New project"** → creates a row in `projects` table → redirects to `/p/[id]`.
5. **Builder page** (`src/app/p/[id]/page.tsx` → `src/components/Builder.tsx`):
   - Boots a **WebContainer** (a full Linux+Node sandbox running in your browser tab)
   - Mounts a pre-baked snapshot (`public/snapshots/base.bin.gz`, ~14MB gzipped) with `node_modules` already installed
   - Starts Vite dev server inside the container
   - Iframe shows the live preview
6. **You chat with Claude** → it writes/edits files via tool calls → files sync into the WebContainer → Vite HMRs → preview updates live.
7. **Click "Deploy"** → builds the frontend in the WebContainer → uploads `dist/` to **Cloudflare Pages** → you get a public URL.
8. **Click "Share"** → generates a public slug → anyone with the link can view (read-only) at `/s/[slug]`, or fork it to their own account.

---

## 3. Frontend (Next.js)

### Layout
- `src/app/layout.tsx` — root layout, fonts (Inter Tight + JetBrains Mono + Instrument Serif), globals.
- `src/app/globals.css` — Tailwind v4 + custom scrollbars.

### Routes
| Path | What it does | File |
|------|--------------|------|
| `/` | Marketing landing | `src/app/page.tsx` |
| `/login` | Magic-link auth | `src/app/login/page.tsx` |
| `/auth/callback` | Supabase OAuth/magic callback | `src/app/auth/callback/route.ts` |
| `/dashboard` | Project list | `src/app/dashboard/page.tsx` |
| `/p/[id]` | Builder workspace (owner) | `src/app/p/[id]/page.tsx` |
| `/s/[slug]` | Public read-only view | `src/app/s/[slug]/page.tsx` |

### Builder client component
`src/components/Builder.tsx` is the heart. It:

1. **Hydrates Zustand store** (`src/lib/store.ts`) from the DB row.
2. **Boots WebContainer** with saved files overlayed on the snapshot.
3. **Debounced autosave** (1.5s) PATCHes the project row whenever files/messages/checkpoints change.
4. Lays out **TopBar / Chat / Preview-Code-Logs panes**.

### Sub-components
- `TopBar.tsx` — brand link, name edit, tab switcher, Deploy / Share / Fork buttons, History (checkpoints).
- `Chat.tsx` — message list + input + `PreviewErrorBanner` (auto "Ask AI to fix").
- `PreviewPane.tsx` — iframe wrapped in device chassis (phone/tablet/desktop) with transform-scale fitting.
- `CodePane.tsx` — file tree + code viewer (Shiki highlighter).
- `LogsPane.tsx` — WebContainer process output.
- `Message.tsx` — renders user/assistant messages + tool-call cards + question forms.

### State
**Zustand** (`src/lib/store.ts`) holds: `projectName`, `templateId`, `files`, `messages`, `checkpoints`, `previewErrors`, `activeTab`, `viewport`, `sending`. One source of truth for the client.

---

## 4. WebContainer (the in-browser sandbox)

This is the magic. `@webcontainer/api` runs a real Node.js + Linux userspace **inside your browser tab** via WebAssembly.

`src/lib/webcontainer.ts` — singleton `wcManager`:
- `boot(initialTree)` — mounts a pre-built snapshot of `node_modules` (so we don't reinstall every time), overlays the project's source files, spawns `vite`.
- `writeFile`, `deleteFile`, `restoreFiles` — sync ops triggered by Claude's tool calls or checkpoint reverts.
- `buildFrontend()` — runs `vite build` and returns the `dist/` files as a flat map (used by Deploy).
- Listens for `server-ready` event → exposes the dev URL to the iframe.

### Snapshot pipeline
`scripts/build-snapshot.mjs`:
1. Spins up a temp dir
2. Runs `pnpm install` on the base template deps (React, Vite, Hono, etc.)
3. Snapshots the entire FS into `public/snapshots/base.bin` (+ gzip)
4. Writes `manifest.json` with SHA-256 hashes

Result: WebContainer boots in ~3-5s on cold load (no `npm install` needed).

### Backend in the WebContainer (Hono)
The template includes `api/index.ts` exporting a Hono app. `vite.config.ts` (in `src/lib/template.ts`) mounts it via Vite's middleware using `@hono/node-server`'s `getRequestListener`, so `/api/*` routes work in the live preview with hot reload. Same Hono app can later deploy to Cloudflare Workers verbatim (web-standard fetch handler).

---

## 5. AI / chat pipeline

### Request flow
```
User types message
   ↓
Chat.tsx → onSend(text) → Builder.handleSend()
   ↓
POST /api/chat  with { messages, files }
   ↓
src/app/api/chat/route.ts
   ↓
Anthropic SDK (streaming)
   ↓
Claude responds with text + tool calls
   ↓
Stream parser emits NDJSON events:
   { type: "text", delta }
   { type: "file", op: "write_file", path, contents }
   { type: "delete", op: "delete_file", path }
   { type: "tool_error", ... }
   ↓
Builder.handleEvent() applies each:
   · text → append to assistant message
   · file → wcManager.writeFile() + store.writeFile()
   · delete → wcManager.deleteFile() + store.deleteFile()
   ↓
Vite picks up file changes → HMR → preview iframe updates
```

### System prompt
In `src/app/api/chat/route.ts`. Teaches Claude:
- Available tools: `write_file`, `edit_file`, `delete_file`, `ask` (for clarifying questions)
- Hono backend conventions (Web Standard fetch, `c.json()`, etc.)
- File-tree etiquette, no native modules in WebContainer

### Error feedback loop
The preview iframe injects a snippet that postMessages runtime errors back to the parent (`window.addEventListener("message", ...)` in Builder.tsx). The `PreviewErrorBanner` in `Chat.tsx` surfaces them with an "Ask AI to fix" button that formats the error+stack and auto-sends it.

---

## 6. Database (Supabase)

### Schema (`supabase/migrations/`)
```sql
-- 0001_init.sql
projects (
  id uuid pk,
  user_id uuid → auth.users,
  name text,
  template_id text,
  files jsonb,
  messages jsonb,
  checkpoints jsonb,
  share_slug text unique,        -- null = private
  created_at, updated_at
)

-- 0002_deploys.sql
projects.deploy_url text         -- last Cloudflare URL
projects.last_deployed_at timestamptz
projects.cf_project_name text    -- stable name for re-deploys
```

### RLS policies
- **Owner CRUD**: `auth.uid() = user_id` for select/insert/update/delete
- **Public read** (for `/s/[slug]`): `share_slug is not null` allows anonymous SELECT
- Service role bypasses everything (used for admin ops)

### Clients
- `src/lib/supabase/client.ts` — browser client (anon key)
- `src/lib/supabase/server.ts` — server client (reads auth from cookies)
- `src/proxy.ts` — Next 16 middleware that refreshes the Supabase session on every request

---

## 7. API routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/chat` | POST | Stream Claude completions + tool calls |
| `/api/projects` | GET, POST | List your projects / create a new one |
| `/api/projects/[id]` | GET, PATCH, DELETE | Read/update/delete a project |
| `/api/projects/[id]/share` | POST, DELETE | Enable / revoke public link |
| `/api/projects/[id]/fork` | POST | Clone a shared project into your account |
| `/api/projects/[id]/deploy` | POST | Build → push to Cloudflare Pages |

All authed routes check `supabase.auth.getUser()` first and rely on RLS for safety.

---

## 8. Deployment (Cloudflare Pages)

`src/lib/cloudflare.ts` implements the 4-step **Direct Upload** flow:

1. **Create project** (`POST /accounts/:acc/pages/projects`) — idempotent, 409 = fine
2. **Get upload JWT** (`GET /upload-token`)
3. **Check missing hashes** (`POST /pages/assets/check-missing`) — CF dedupes already-uploaded blobs
4. **Upload blobs** in batches of 50 — files base64-encoded, hashed with SHA-256
5. **Create deployment** (`POST /deployments`) with the file manifest

`projectNameFor(uuid)` returns `builder-<first-12-chars-of-uuid>` so re-deploys hit the same CF Pages project → URL stays stable.

**Architecture choice:** all deploys use the team's single CF account via `CLOUDFLARE_API_TOKEN` env var. Users never see CF — they just see "Deploy" + a working URL. (Tradeoff: cost is on us, but UX is one-click.)

**v1 limit:** only the frontend `dist/` ships. The Hono backend stays in the preview WebContainer. v2 = bundle Hono → Cloudflare Workers and route `/api/*` to it.

---

## 9. Environment vars

```bash
# Supabase (Builder's own DB + auth)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=

# Anthropic (the AI)
ANTHROPIC_API_KEY=

# Cloudflare (where user apps deploy to)
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
```

---

## 10. What's NOT built yet

- **Hono → Cloudflare Workers deploy** — currently deployed apps are frontend-only
- **Template picker UI** — "New project" uses a hardcoded blank template
- **Project thumbnails** — dashboard cards show gradient placeholders
- **Builder app itself isn't deployed** — needs to go to Vercel/CF for boss demo

---

## TL;DR

- **Frontend:** Next.js 16 + Zustand + WebContainer for in-browser sandbox
- **Backend (this app):** Next API routes + Anthropic streaming
- **Storage:** Supabase Postgres + magic-link auth + RLS
- **User's app sandbox:** WebContainer in browser (no server cost for previews)
- **User's app production:** Cloudflare Pages via Direct Upload API
- **Generated apps:** React + Vite + Hono — fullstack-capable, web-standard, portable
