"use client";

import { useEffect, useRef, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { Chat } from "@/components/Chat";
import { PreviewPane } from "@/components/PreviewPane";
import { CodePane } from "@/components/CodePane";
import { LogsPane } from "@/components/LogsPane";
import { wcManager, type Status } from "@/lib/webcontainer";
import {
  appendTextToLastBlock,
  pushBlock,
  useStore,
  type AskQuestion,
  type Block,
  type Checkpoint,
  type Message,
} from "@/lib/store";
import { templates, type TemplateId } from "@/lib/template";

const DEFAULT_TEMPLATE: TemplateId = "blank";

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "file"; op: "write_file" | "edit_file"; path: string; contents: string }
  | { type: "delete"; op: "delete_file"; path: string }
  | { type: "tool_error"; op: "write_file" | "edit_file" | "delete_file"; path?: string; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type ProjectRow = {
  id: string;
  name: string;
  template_id: string | null;
  files: Record<string, string>;
  messages: Message[];
  checkpoints: Checkpoint[];
  share_slug?: string | null;
};

function templateFilesToMap(id: TemplateId): Record<string, string> {
  const tree = templates[id].files;
  const out: Record<string, string> = {};
  const walk = (node: typeof tree, prefix: string) => {
    for (const [name, child] of Object.entries(node)) {
      const path = prefix ? `${prefix}/${name}` : name;
      if ("file" in child) {
        const f = child.file as { contents?: string | Uint8Array };
        if (typeof f.contents === "string") out[path] = f.contents;
      } else if ("directory" in child) {
        walk(child.directory, path);
      }
    }
  };
  walk(tree, "");
  return out;
}

// Build a FileSystemTree from a flat path→contents map (for wc.mount).
function mapToTree(files: Record<string, string>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root: any = {};
  for (const [path, contents] of Object.entries(files)) {
    const parts = path.split("/");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      cursor[p] ??= { directory: {} };
      cursor = cursor[p].directory;
    }
    cursor[parts[parts.length - 1]] = { file: { contents } };
  }
  return root;
}

export function Builder({
  project,
  readOnly = false,
}: {
  project: ProjectRow;
  readOnly?: boolean;
}) {
  const templateId = useStore((s) => s.templateId);
  const setTemplate = useStore((s) => s.setTemplate);
  const setProjectName = useStore((s) => s.setProjectName);
  const activeTab = useStore((s) => s.activeTab);
  const setFiles = useStore((s) => s.setFiles);
  const writeFile = useStore((s) => s.writeFile);
  const deleteFile = useStore((s) => s.deleteFile);
  const setSending = useStore((s) => s.setSending);
  const setAbortController = useStore((s) => s.setAbortController);
  const pushMessage = useStore((s) => s.pushMessage);
  const updateLastAssistant = useStore((s) => s.updateLastAssistant);
  const appendLog = useStore((s) => s.appendLog);
  const addCheckpoint = useStore((s) => s.addCheckpoint);
  const abortController = useStore((s) => s.abortController);

  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const filesRef = useRef<Record<string, string>>({});
  const hydratedRef = useRef(false);

  const storeFiles = useStore((s) => s.files);
  useEffect(() => {
    filesRef.current = storeFiles;
  }, [storeFiles]);

  useEffect(() => {
    const unsub = wcManager.subscribe(setStatus);
    const unsubLog = wcManager.onLog(appendLog);
    return () => {
      unsub();
      unsubLog();
    };
  }, [appendLog]);

  const pushPreviewError = useStore((s) => s.pushPreviewError);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "builder-preview") return;
      if (data.kind === "ready") return;
      if (
        data.kind === "runtime-error" ||
        data.kind === "unhandled-rejection" ||
        data.kind === "console-error"
      ) {
        pushPreviewError({
          kind: data.kind,
          message: String(data.message ?? "Unknown error"),
          stack: data.stack ?? null,
          filename: data.filename ?? null,
          lineno: data.lineno ?? null,
          colno: data.colno ?? null,
          at: data.at ?? Date.now(),
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushPreviewError]);

  // Hydrate the store from the project row on first mount.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const tplId = (project.template_id as TemplateId) || DEFAULT_TEMPLATE;
    const hasSavedFiles = Object.keys(project.files).length > 0;
    const files = hasSavedFiles ? project.files : templateFilesToMap(tplId);

    setProjectName(project.name);
    setTemplate(tplId);
    setFiles(files);
    filesRef.current = files;

    // Restore messages + checkpoints into the store directly.
    useStore.setState({
      messages: project.messages ?? [],
      checkpoints: project.checkpoints ?? [],
    });

    // Boot the WebContainer. If we have saved files, mount the template's
    // base snapshot and overlay the saved files on top via wcManager.boot.
    const tree = hasSavedFiles
      ? mapToTree(files)
      : templates[tplId].files;
    wcManager.boot(tree).catch((err) => console.error(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autosave: whenever the persistable parts of state change,
  // PATCH the project row 1.5s after the last change.
  const projectName = useStore((s) => s.projectName);
  const messages = useStore((s) => s.messages);
  const checkpoints = useStore((s) => s.checkpoints);
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (readOnly) return;
    const t = setTimeout(() => {
      void fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: projectName,
          template_id: templateId,
          files: storeFiles,
          messages,
          checkpoints,
        }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [project.id, projectName, templateId, storeFiles, messages, checkpoints, readOnly]);

  async function handleSend(text: string) {
    if (status.kind === "idle") return;
    setSending(true);
    useStore.getState().clearPreviewErrors();
    addCheckpoint(text.length > 60 ? text.slice(0, 57) + "…" : text);

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      blocks: [{ type: "text", text }],
    };
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      blocks: [],
    };
    const priorMessages = useStore.getState().messages;
    pushMessage(userMsg);
    pushMessage(assistantMsg);

    const apiMessages = [
      ...priorMessages.flatMap(msgToApiMessages),
      ...msgToApiMessages(userMsg),
    ];

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, files: filesRef.current }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let detail = "";
        try {
          const data = await res.clone().json();
          detail = data?.error ?? "";
        } catch {
          try {
            detail = await res.text();
          } catch {
            /* ignore */
          }
        }
        throw new Error(
          detail ? `HTTP ${res.status} — ${detail}` : `HTTP ${res.status}`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as StreamEvent;
          await handleEvent(evt);
        }
      }

      updateLastAssistant(transformAskBlock);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error(err);
        updateLastAssistant((m) =>
          pushBlock(m, {
            type: "text",
            text: `\n\n⚠️ ${(err as Error).message}`,
          }),
        );
      }
    } finally {
      setSending(false);
      setAbortController(null);
    }
  }

  async function handleEvent(evt: StreamEvent) {
    if (evt.type === "text") {
      updateLastAssistant((m) => appendTextToLastBlock(m, evt.delta));
    } else if (evt.type === "file") {
      try {
        await wcManager.writeFile(evt.path, evt.contents);
      } catch (err) {
        console.error("writeFile failed", err);
      }
      writeFile(evt.path, evt.contents);
      const block: Block = {
        type: "tool",
        op: evt.op,
        path: evt.path,
        status: "ok",
        contents: evt.contents,
      };
      updateLastAssistant((m) => pushBlock(m, block));
    } else if (evt.type === "delete") {
      try {
        await wcManager.deleteFile(evt.path);
      } catch (err) {
        console.error("deleteFile failed", err);
      }
      deleteFile(evt.path);
      const block: Block = {
        type: "tool",
        op: "delete_file",
        path: evt.path,
        status: "ok",
      };
      updateLastAssistant((m) => pushBlock(m, block));
    } else if (evt.type === "tool_error") {
      const block: Block = {
        type: "tool",
        op: evt.op,
        path: evt.path ?? "(unknown)",
        status: "error",
        message: evt.message,
      };
      updateLastAssistant((m) => pushBlock(m, block));
    } else if (evt.type === "error") {
      updateLastAssistant((m) =>
        pushBlock(m, { type: "text", text: `\n\n⚠️ ${evt.message}` }),
      );
    }
  }

  function handleStop() {
    abortController?.abort();
  }

  function handleAnswerQuestions(
    messageId: string,
    answers: Record<string, string | string[]>,
  ) {
    useStore.setState((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          blocks: m.blocks.map((b) =>
            b.type === "questions" ? { ...b, answered: true } : b,
          ),
        };
      }),
    }));

    const msg = useStore.getState().messages.find((m) => m.id === messageId);
    const qBlock = msg?.blocks.find((b) => b.type === "questions") as
      | { questions: AskQuestion[] }
      | undefined;

    const lines: string[] = ["Here are my answers:"];
    if (qBlock) {
      for (const q of qBlock.questions) {
        const v = answers[q.id];
        const formatted = Array.isArray(v) ? v.join(", ") : v ?? "(skipped)";
        lines.push(`- ${q.q} → ${formatted}`);
      }
    } else {
      for (const [k, v] of Object.entries(answers)) {
        lines.push(`- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
      }
    }
    lines.push("\nGo ahead and build it.");

    void handleSend(lines.join("\n"));
  }

  const lastFilesSyncRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (status.kind !== "ready" && status.kind !== "starting") return;
    if (lastFilesSyncRef.current === storeFiles) return;
    void wcManager.restoreFiles(storeFiles).catch(() => {});
    lastFilesSyncRef.current = storeFiles;
  }, [storeFiles, status]);

  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden">
      <TopBar
        readOnly={readOnly}
        projectId={project.id}
        initialShareSlug={project.share_slug ?? null}
      />
      <div
        className={`flex-1 min-h-0 ${
          readOnly ? "" : "grid grid-cols-[460px_1fr] grid-rows-1 gap-0"
        }`}
      >
        {!readOnly && (
          <Chat
            onSend={handleSend}
            onStop={handleStop}
            onAnswerQuestions={handleAnswerQuestions}
          />
        )}
        <main className="min-w-0 min-h-0 flex flex-col">
          {activeTab === "preview" && <PreviewPane status={status} />}
          {activeTab === "code" && <CodePane />}
          {activeTab === "logs" && <LogsPane />}
        </main>
      </div>
    </div>
  );
}

function msgToApiMessages(m: Message): { role: "user" | "assistant"; content: string }[] {
  const parts: string[] = [];
  for (const b of m.blocks) {
    if (b.type === "text") parts.push(b.text);
    else if (b.type === "questions") {
      parts.push(
        `<ask>\n${JSON.stringify({ intro: b.intro, questions: b.questions }, null, 2)}\n</ask>`,
      );
    }
  }
  const text = parts.join("").trim();
  if (!text) return [];
  return [{ role: m.role, content: text }];
}

function transformAskBlock(m: Message): Message {
  const out = [...m.blocks];
  for (let i = 0; i < out.length; i++) {
    const block = out[i];
    if (block.type !== "text") continue;
    const match = block.text.match(/<ask>\s*([\s\S]*?)\s*<\/ask>/);
    if (!match) continue;
    let parsed: { intro?: string; questions?: unknown };
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (!parsed || !Array.isArray(parsed.questions)) continue;

    const before = block.text.slice(0, match.index).trim();
    const after = block.text.slice((match.index ?? 0) + match[0].length).trim();

    const replacement: Block[] = [];
    if (before) replacement.push({ type: "text", text: before });
    const qBlock: Block = {
      type: "questions",
      intro: typeof parsed.intro === "string" ? parsed.intro : "",
      questions: parsed.questions as AskQuestion[],
    };
    replacement.push(qBlock);
    if (after) replacement.push({ type: "text", text: after });

    out.splice(i, 1, ...replacement);
    break;
  }
  return { ...m, blocks: out };
}
