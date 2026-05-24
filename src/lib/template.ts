import type { FileSystemTree } from "@webcontainer/api";

const basePackageJson = (deps: Record<string, string> = {}) =>
  JSON.stringify(
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
        ...deps,
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
    },
    null,
    2,
  );

const sharedConfigs = {
  "vite.config.ts": {
    file: {
      contents: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Mounts api/index.ts (if it exists) under /api/* so the frontend can call
// fetch('/api/foo'). The handler must be an Express app or any Node
// http handler exported as default. Vite re-evaluates on every request,
// so saving the file hot-reloads the backend instantly.
// Bridges Vite's Node req/res middleware to Hono's Web Standard fetch
// handler. Vite's connect-style use("/api", ...) strips /api before the
// handler runs, so app.get("/notes") serves GET /api/notes.
//
// Same Hono app deploys to Cloudflare Workers in production — no code change.
const apiServer = () => ({
  name: "api-server",
  configureServer(server: any) {
    server.middlewares.use("/api", async (req: any, res: any, next: any) => {
      try {
        const mod = await server.ssrLoadModule("/api/index.ts");
        const app = mod.default || mod.app;
        if (!app || typeof app.fetch !== "function") return next();
        const { getRequestListener } = await import("@hono/node-server");
        return getRequestListener(app.fetch)(req, res);
      } catch (err: any) {
        if (/Cannot find module/.test(String(err?.message))) return next();
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          error: err?.message ?? String(err),
          stack: err?.stack ?? null,
        }));
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), apiServer()],
  server: { host: "0.0.0.0", port: 5173 },
});
`,
    },
  },
  "tsconfig.json": {
    file: {
      contents: JSON.stringify(
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
    },
  },
  "postcss.config.js": {
    file: {
      contents: `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`,
    },
  },
  "tailwind.config.js": {
    file: {
      contents: `export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
`,
    },
  },
  "index.html": {
    file: {
      contents: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated App</title>
    <script>
      (function () {
        var post = function (kind, payload) {
          try {
            window.parent.postMessage(
              Object.assign({ source: "builder-preview", kind: kind, at: Date.now() }, payload),
              "*"
            );
          } catch (e) {}
        };
        function safeStr(v) {
          if (v == null) return String(v);
          if (typeof v === "string") return v;
          try { return JSON.stringify(v); } catch (e) { return String(v); }
        }
        window.addEventListener("error", function (e) {
          post("runtime-error", {
            message: (e.error && e.error.message) || e.message || "Unknown error",
            stack: (e.error && e.error.stack) || null,
            filename: e.filename || null,
            lineno: e.lineno || null,
            colno: e.colno || null,
          });
        });
        window.addEventListener("unhandledrejection", function (e) {
          var r = e.reason;
          post("unhandled-rejection", {
            message: (r && r.message) || safeStr(r),
            stack: (r && r.stack) || null,
          });
        });
        var origErr = console.error.bind(console);
        console.error = function () {
          try {
            var args = Array.prototype.slice.call(arguments);
            var msg = args.map(safeStr).join(" ");
            post("console-error", { message: msg });
          } catch (e) {}
          origErr.apply(null, arguments);
        };
        post("ready", {});
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
  },
} satisfies FileSystemTree;

const mainTsx = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;

const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

function projectFiles(appTsx: string, deps: Record<string, string> = {}): FileSystemTree {
  return {
    "package.json": { file: { contents: basePackageJson(deps) } },
    ...sharedConfigs,
    src: {
      directory: {
        "main.tsx": { file: { contents: mainTsx } },
        "App.tsx": { file: { contents: appTsx } },
        "index.css": { file: { contents: indexCss } },
      },
    },
  };
}

const blankApp = `export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-900">Hello from your AI-built app</h1>
        <p className="mt-4 text-slate-600">Describe a change in the chat and watch it happen.</p>
      </div>
    </div>
  );
}
`;

const todoApp = `import { useEffect, useState } from "react";

type Todo = { id: string; text: string; done: boolean };

const STORAGE_KEY = "todos.v1";

export default function App() {
  const [todos, setTodos] = useState<Todo[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Todo[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const add = () => {
    const text = input.trim();
    if (!text) return;
    setTodos((t) => [...t, { id: crypto.randomUUID(), text, done: false }]);
    setInput("");
  };

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 px-4 py-12">
      <div className="max-w-md mx-auto space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Things to do</h1>
          <p className="text-sm text-slate-500">{remaining} remaining</p>
        </header>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="What needs doing?"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          />
          <button
            onClick={add}
            className="rounded-lg bg-slate-900 text-white px-4 text-sm font-medium hover:bg-slate-700"
          >
            Add
          </button>
        </div>

        <ul className="space-y-2">
          {todos.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-lg bg-white border border-slate-200 px-3 py-2"
            >
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  setTodos((all) =>
                    all.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
                  )
                }
              />
              <span className={t.done ? "line-through text-slate-400 flex-1" : "flex-1"}>
                {t.text}
              </span>
              <button
                onClick={() => setTodos((all) => all.filter((x) => x.id !== t.id))}
                className="text-slate-400 hover:text-red-500 text-sm"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
`;

const counterApp = `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
      <div className="text-center space-y-6">
        <h1 className="text-2xl font-medium opacity-80">Counter</h1>
        <div className="text-8xl font-bold tabular-nums">{count}</div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setCount((c) => c - 1)}
            className="rounded-full bg-white/10 hover:bg-white/20 px-6 py-2 text-lg backdrop-blur"
          >
            −
          </button>
          <button
            onClick={() => setCount(0)}
            className="rounded-full bg-white/10 hover:bg-white/20 px-6 py-2 text-sm backdrop-blur"
          >
            Reset
          </button>
          <button
            onClick={() => setCount((c) => c + 1)}
            className="rounded-full bg-white text-indigo-600 px-6 py-2 text-lg font-semibold"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
`;

const landingApp = `export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-200">
        <div className="font-semibold">◆ Lumen</div>
        <nav className="hidden sm:flex gap-6 text-sm text-slate-600">
          <a href="#" className="hover:text-slate-900">Product</a>
          <a href="#" className="hover:text-slate-900">Pricing</a>
          <a href="#" className="hover:text-slate-900">Docs</a>
        </nav>
        <a href="#" className="rounded-lg bg-slate-900 text-white text-sm px-3 py-1.5">
          Get started
        </a>
      </header>

      <section className="px-6 py-24 max-w-3xl mx-auto text-center space-y-6">
        <span className="inline-block text-xs uppercase tracking-widest text-slate-500">
          new · v2.0
        </span>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          The fastest way to ship.
        </h1>
        <p className="text-lg text-slate-600 max-w-xl mx-auto">
          A short, sharp tagline that explains the value in one breath. Replace this
          with something specific to your product.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <a href="#" className="rounded-lg bg-slate-900 text-white px-5 py-2.5">
            Start free
          </a>
          <a href="#" className="rounded-lg border border-slate-300 px-5 py-2.5">
            Watch demo
          </a>
        </div>
      </section>

      <section className="px-6 py-20 grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">
        {[
          { t: "Fast", d: "Built on modern primitives. Loads instantly." },
          { t: "Composable", d: "Drop into your stack without ceremony." },
          { t: "Open", d: "Self-hostable. No lock-in. MIT licensed." },
        ].map((f) => (
          <div key={f.t} className="rounded-2xl border border-slate-200 p-6">
            <div className="text-lg font-semibold">{f.t}</div>
            <p className="text-slate-600 text-sm mt-1">{f.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
`;

export type TemplateId = "blank" | "todo" | "counter" | "landing";

export type TemplateMeta = {
  id: TemplateId;
  name: string;
  blurb: string;
  files: FileSystemTree;
};

export const templates: Record<TemplateId, TemplateMeta> = {
  blank: {
    id: "blank",
    name: "Blank",
    blurb: "Empty canvas with just a hero. Start from scratch.",
    files: projectFiles(blankApp),
  },
  todo: {
    id: "todo",
    name: "Todo list",
    blurb: "Classic todo app with localStorage persistence.",
    files: projectFiles(todoApp),
  },
  counter: {
    id: "counter",
    name: "Counter",
    blurb: "A single-purpose counter with a gradient backdrop.",
    files: projectFiles(counterApp),
  },
  landing: {
    id: "landing",
    name: "Landing page",
    blurb: "Marketing landing with hero and feature grid.",
    files: projectFiles(landingApp),
  },
};

export const templateList: TemplateMeta[] = [
  templates.blank,
  templates.todo,
  templates.counter,
  templates.landing,
];

export const starterTemplate = templates.blank.files;
