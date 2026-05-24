"use client";

import { create } from "zustand";
import type { TemplateId } from "./template";

export type ToolBlock = {
  type: "tool";
  op: "write_file" | "edit_file" | "delete_file";
  path: string;
  status: "ok" | "error";
  message?: string;
  contents?: string;
};

export type TextBlock = { type: "text"; text: string };

export type AskQuestion = {
  id: string;
  q: string;
  type: "choice" | "text";
  multi?: boolean;
  placeholder?: string;
  options?: { label: string; desc?: string }[];
};

export type QuestionsBlock = {
  type: "questions";
  intro: string;
  questions: AskQuestion[];
  answered?: boolean;
};

export type Block = TextBlock | ToolBlock | QuestionsBlock;

export type Message = {
  id: string;
  role: "user" | "assistant";
  blocks: Block[];
};

export type Checkpoint = {
  id: string;
  label: string;
  createdAt: number;
  files: Record<string, string>;
  messageCount: number;
};

export type Tab = "preview" | "code" | "logs";
export type Viewport = "phone" | "tablet" | "desktop";

export type PreviewError = {
  id: string;
  kind: "runtime-error" | "unhandled-rejection" | "console-error";
  message: string;
  stack?: string | null;
  filename?: string | null;
  lineno?: number | null;
  colno?: number | null;
  at: number;
};

type State = {
  templateId: TemplateId | null;
  projectName: string;
  messages: Message[];
  files: Record<string, string>;
  checkpoints: Checkpoint[];
  activeTab: Tab;
  viewport: Viewport;
  sending: boolean;
  logs: string[];
  abortController: AbortController | null;
  previewErrors: PreviewError[];
  pendingChatInput: string | null;

  setTemplate: (id: TemplateId) => void;
  setProjectName: (name: string) => void;
  setActiveTab: (tab: Tab) => void;
  setViewport: (v: Viewport) => void;
  setSending: (b: boolean) => void;
  setAbortController: (c: AbortController | null) => void;
  appendLog: (line: string) => void;

  setFiles: (files: Record<string, string>) => void;
  writeFile: (path: string, contents: string) => void;
  deleteFile: (path: string) => void;

  pushMessage: (m: Message) => void;
  updateLastAssistant: (mut: (m: Message) => Message) => void;

  addCheckpoint: (label: string) => void;
  revertCheckpoint: (id: string) => Checkpoint | null;

  pushPreviewError: (e: Omit<PreviewError, "id">) => void;
  dismissPreviewError: (id: string) => void;
  clearPreviewErrors: () => void;

  setPendingChatInput: (s: string | null) => void;
};

export const useStore = create<State>((set, get) => ({
  templateId: null,
  projectName: "Untitled project",
  messages: [],
  files: {},
  checkpoints: [],
  activeTab: "preview",
  viewport: "desktop",
  sending: false,
  logs: [],
  abortController: null,
  previewErrors: [],
  pendingChatInput: null,

  setTemplate: (id) => set({ templateId: id }),
  setProjectName: (name) => set({ projectName: name }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setViewport: (v) => set({ viewport: v }),
  setSending: (b) => set({ sending: b }),
  setAbortController: (c) => set({ abortController: c }),
  appendLog: (line) =>
    set((s) => ({ logs: [...s.logs.slice(-1000), line] })),

  setFiles: (files) => set({ files }),
  writeFile: (path, contents) =>
    set((s) => ({ files: { ...s.files, [path]: contents } })),
  deleteFile: (path) =>
    set((s) => {
      const next = { ...s.files };
      delete next[path];
      return { files: next };
    }),

  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateLastAssistant: (mut) =>
    set((s) => {
      if (s.messages.length === 0) return s;
      const idx = s.messages.length - 1;
      const last = s.messages[idx];
      if (last.role !== "assistant") return s;
      const copy = [...s.messages];
      copy[idx] = mut(last);
      return { messages: copy };
    }),

  addCheckpoint: (label) => {
    const cp: Checkpoint = {
      id: crypto.randomUUID(),
      label,
      createdAt: Date.now(),
      files: { ...get().files },
      messageCount: get().messages.length,
    };
    set((s) => ({ checkpoints: [...s.checkpoints, cp] }));
  },

  pushPreviewError: (e) => {
    set((s) => {
      // Dedupe: if last error has same message+kind within 2s, ignore.
      const last = s.previewErrors[s.previewErrors.length - 1];
      if (
        last &&
        last.kind === e.kind &&
        last.message === e.message &&
        e.at - last.at < 2000
      ) {
        return s;
      }
      const next: PreviewError = { id: crypto.randomUUID(), ...e };
      const trimmed = [...s.previewErrors, next].slice(-10);
      return { previewErrors: trimmed };
    });
  },
  dismissPreviewError: (id) =>
    set((s) => ({ previewErrors: s.previewErrors.filter((e) => e.id !== id) })),
  clearPreviewErrors: () => set({ previewErrors: [] }),

  setPendingChatInput: (s) => set({ pendingChatInput: s }),

  revertCheckpoint: (id) => {
    const cp = get().checkpoints.find((c) => c.id === id);
    if (!cp) return null;
    set((s) => ({
      files: { ...cp.files },
      messages: s.messages.slice(0, cp.messageCount),
      checkpoints: s.checkpoints.filter((c) => c.createdAt <= cp.createdAt),
      previewErrors: [],
    }));
    return cp;
  },
}));

export function appendTextToLastBlock(m: Message, delta: string): Message {
  const blocks = [...m.blocks];
  const last = blocks[blocks.length - 1];
  if (last && last.type === "text") {
    blocks[blocks.length - 1] = { ...last, text: last.text + delta };
  } else {
    blocks.push({ type: "text", text: delta });
  }
  return { ...m, blocks };
}

export function pushBlock(m: Message, block: Block): Message {
  return { ...m, blocks: [...m.blocks, block] };
}
