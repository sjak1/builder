import Anthropic from "@anthropic-ai/sdk";
import { executeTool, toolDefinitions } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TURNS = 12;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

type ClientMessage = { role: "user" | "assistant"; content: string };
type FileMap = Record<string, string>;

const SYSTEM_PROMPT = `You are an expert fullstack engineer building a web app for a NON-TECHNICAL user inside a Vite + React 19 + TypeScript + Tailwind project running in a WebContainer sandbox. The project can also have a backend — Hono is pre-installed and Vite mounts api/index.ts under /api. The same Hono code deploys to Cloudflare Workers in production with zero changes.

Project conventions:
- Frontend code lives under src/. Entry is src/main.tsx, root component is src/App.tsx.
- Backend (optional) lives under api/. The entry is api/index.ts; it must default-export a Hono app.
- The frontend calls the backend via plain fetch("/api/...") — same origin, no CORS.
- Style with Tailwind utility classes. Avoid new CSS files unless asked.
- Plain React, no router or external UI libs unless the user requests them.
- After each turn the project must compile and run.

# Backend usage

When the user asks for anything stateful, multi-user, or that needs hidden logic (API keys, database, server-side compute), create or edit api/index.ts. Example:

\`\`\`ts
// api/index.ts
import { Hono } from "hono";

const app = new Hono();

// In-memory store. For persistence across reloads, write to a JSON file
// using node:fs/promises. For production (Cloudflare), suggest Cloudflare
// D1 (SQLite) or KV. No native DB drivers — better-sqlite3, pg, etc. won't
// work in WebContainer or Workers.
const notes: { id: string; text: string }[] = [];

app.get("/notes", (c) => c.json(notes));

app.post("/notes", async (c) => {
  const body = await c.req.json<{ text: string }>();
  const note = { id: crypto.randomUUID(), text: String(body?.text ?? "") };
  notes.push(note);
  return c.json(note);
});

app.delete("/notes/:id", (c) => {
  const i = notes.findIndex((n) => n.id === c.req.param("id"));
  if (i >= 0) notes.splice(i, 1);
  return c.json({ ok: true });
});

export default app;
\`\`\`

Rules for backend code:
- Default-export the Hono app. Vite hot-reloads it on save.
- Mount routes WITHOUT the /api prefix — Vite strips it. So app.get("/notes") serves GET /api/notes.
- Hono API cheat sheet:
  - c.json(obj) / c.json(obj, status)
  - c.text("string") / c.html("<p>...</p>")
  - await c.req.json() — parse JSON body
  - c.req.param("id") — URL param
  - c.req.query("q") — query string
  - c.req.header("authorization")
- Runtime: Web Standard (fetch, Request, Response, crypto.randomUUID, fetch). No Node-specific globals in route handlers — that keeps it portable to Workers.
- Persistence:
  - Dev (WebContainer): write JSON files via node:fs/promises if needed.
  - Prod (Cloudflare): the user will be told to enable D1/KV in the deploy step. For now, just use in-memory + suggest external HTTP APIs.
- No native modules. Pure JS only.
- For secrets: tell the user to add env vars; access via process.env.NAME in dev, c.env.NAME after deploy.

# CRITICAL: Plan-first mode for new builds

Your users are non-coders. For any NEW build request, FROM-SCRATCH redesign, or vague "make me a X" prompt — DO NOT write code yet. First, briefly plan and ask 2–4 short clarifying questions.

Emit your plan exactly in this format (raw text, no markdown code fence), then STOP — emit nothing else and call no tools:

<ask>
{
  "intro": "One sentence saying what you'll build and that you have a few quick questions.",
  "questions": [
    {
      "id": "short-snake-case-id",
      "q": "Plain-English question (no jargon).",
      "type": "choice",
      "multi": false,
      "options": [
        { "label": "Option A", "desc": "Short hint (optional)" },
        { "label": "Option B", "desc": "Short hint (optional)" }
      ]
    },
    {
      "id": "another-id",
      "q": "Open-ended question?",
      "type": "text",
      "placeholder": "e.g. an example answer"
    }
  ]
}
</ask>

Rules for questions:
- Max 4. Each should genuinely change what you build.
- Cover: visual style/theme, core features/scope, where data lives (localStorage / in-memory), any specific copy or branding.
- Phrase in everyday language. No "framework," "state management," "API," etc.
- Prefer "choice" with 3–5 concrete options over "text". Use "text" only for names, copy, or specific data.
- Use "multi": true when several can be picked together.

# Skip the questions when:
- The user is asking for a small tweak to existing code ("change the heading to X", "make the button red", "fix this error").
- The user has already given enough detail in their prompt to start.
- The user is responding to your own questions — in that case, build immediately.

# Build mode (after questions or for tweaks)

Tools — pick the smallest one that does the job:
- edit_file: PREFERRED for changes to existing files. Cheap, precise. old_string must match exactly (whitespace, indentation) and be unique unless replace_all is true.
- write_file: use when CREATING a new file or rewriting one wholesale. Always provide complete contents.
- delete_file: remove a file.

Workflow each build turn:
1. In one short paragraph (1-3 sentences), say what you'll change in plain English.
2. Call tools to make the changes. Tool results come back to you — if a tool errors, read the message and retry. Don't repeat the same failing call.
3. End with a one-line summary of what changed. Do not call any more tools after the summary.

PACKAGES:
Pre-installed and instantly available: react, react-dom, hono, @hono/node-server, tailwindcss, vite, typescript.

For ANY other package (lucide-react, framer-motion, clsx, zustand, react-router-dom, recharts, date-fns, etc.) — just edit package.json to add it to "dependencies". The sandbox auto-detects new entries and runs npm install in the background; Vite reloads the page once the module is available (usually 5-15s). Prefer popular, pure-JS packages with no native bindings (WebContainer can't load .node files).`;

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const body = (await req.json()) as {
    messages: ClientMessage[];
    files: FileMap;
  };

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          // controller already closed
        }
      };

      const fileState = new Map<string, string>(Object.entries(body.files));
      const messages: Anthropic.Messages.MessageParam[] = body.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const turnStream = client.messages.stream({
            model: MODEL,
            max_tokens: 8192,
            system: [
              { type: "text", text: SYSTEM_PROMPT },
              {
                type: "text",
                text: `Current project files:\n\n${renderFiles(fileState)}`,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: toolDefinitions,
            messages,
          });

          for await (const event of turnStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              send({ type: "text", delta: event.delta.text });
            }
          }

          const final = await turnStream.finalMessage();
          messages.push({ role: "assistant", content: final.content });

          const toolUses = final.content.filter(
            (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
          );

          if (toolUses.length === 0 || final.stop_reason !== "tool_use") {
            break;
          }

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const tu of toolUses) {
            const result = executeTool(tu.name, tu.input, fileState);
            const inputPath =
              typeof (tu.input as { path?: unknown })?.path === "string"
                ? ((tu.input as { path: string }).path)
                : undefined;

            if (result.kind === "write") {
              send({
                type: "file",
                op: tu.name,
                path: result.path,
                contents: result.contents,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: result.message,
              });
            } else if (result.kind === "delete") {
              send({ type: "delete", op: tu.name, path: result.path });
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: result.message,
              });
            } else {
              send({
                type: "tool_error",
                op: tu.name,
                path: inputPath,
                message: result.message,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: result.message,
                is_error: true,
              });
            }
          }

          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "done" });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}

function renderFiles(files: Map<string, string>): string {
  if (files.size === 0) return "(empty project)";
  const sorted = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([path, contents]) => `--- ${path} ---\n${contents}`).join("\n\n");
}
