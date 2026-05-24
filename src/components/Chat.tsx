"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square, AlertTriangle, X, Wand2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { MessageView } from "./Message";
import { EmptyState } from "./EmptyState";

import type { AnswerMap } from "./QuestionsCard";

export function Chat({
  onSend,
  onStop,
  onAnswerQuestions,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  onAnswerQuestions: (messageId: string, answers: AnswerMap) => void;
}) {
  const messages = useStore((s) => s.messages);
  const sending = useStore((s) => s.sending);
  const pendingChatInput = useStore((s) => s.pendingChatInput);
  const setPendingChatInput = useStore((s) => s.setPendingChatInput);
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Consume prefilled input from "Fix it" buttons or other callers.
  useEffect(() => {
    if (pendingChatInput == null) return;
    setInput(pendingChatInput);
    setPendingChatInput(null);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }, [pendingChatInput, setPendingChatInput]);

  const submit = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    onSend(text);
  };

  return (
    <aside className="flex flex-col h-full border-r border-neutral-800 bg-neutral-950">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState onPick={(p) => onSend(p)} />
        ) : (
          <div className="px-6 py-6 space-y-8">
            {messages.map((m) => (
              <MessageView
                key={m.id}
                message={m}
                onAnswerQuestions={onAnswerQuestions}
              />
            ))}
            {sending && (
              <div className="flex items-center gap-2.5 text-[13px] text-neutral-500">
                <div className="size-1.5 rounded-full bg-violet-400 animate-pulse" />
                Working…
              </div>
            )}
          </div>
        )}
      </div>

      <PreviewErrorBanner onSend={onSend} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-t border-neutral-800/80 p-4"
      >
        <div className="relative rounded-2xl border border-neutral-800 bg-neutral-900/80 focus-within:border-neutral-600 transition-colors shadow-lg shadow-black/20">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              messages.length === 0
                ? "Describe your app…"
                : "Ask for a change… (⏎ to send)"
            }
            rows={3}
            className="w-full bg-transparent px-4 py-3.5 text-[14px] leading-relaxed resize-none focus:outline-none placeholder:text-neutral-600"
          />
          <div className="flex items-center justify-end gap-1 px-2.5 pb-2.5">
            {sending ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-1.5 size-8 justify-center rounded-md bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
                aria-label="Stop"
              >
                <Square size={13} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="inline-flex items-center justify-center size-8 rounded-md bg-white text-neutral-900 hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-500"
                aria-label="Send"
              >
                <ArrowUp size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2.5 text-[11px] text-neutral-600 px-1">
          Enter to send · Shift+Enter for newline
        </div>
      </form>
    </aside>
  );
}

function PreviewErrorBanner({ onSend }: { onSend: (text: string) => void }) {
  const errors = useStore((s) => s.previewErrors);
  const dismiss = useStore((s) => s.dismissPreviewError);
  const clearAll = useStore((s) => s.clearPreviewErrors);
  const sending = useStore((s) => s.sending);

  if (errors.length === 0) return null;
  const latest = errors[errors.length - 1];
  const extra = errors.length - 1;

  function askToFix() {
    const lines = [
      "The preview just crashed with this error — please fix it.",
      "",
      "```",
      `[${latest.kind}] ${latest.message}`,
    ];
    if (latest.filename) {
      lines.push(
        `at ${latest.filename}${latest.lineno ? `:${latest.lineno}` : ""}${latest.colno ? `:${latest.colno}` : ""}`,
      );
    }
    if (latest.stack) {
      lines.push("", latest.stack.split("\n").slice(0, 8).join("\n"));
    }
    lines.push("```");
    clearAll();
    onSend(lines.join("\n"));
  }

  return (
    <div className="mx-4 mb-2 mt-1 rounded-xl border border-red-500/30 bg-red-500/[0.06] overflow-hidden">
      <div className="flex items-start gap-2.5 px-3.5 py-2.5">
        <AlertTriangle size={15} className="text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] uppercase tracking-wide text-red-300/80 mb-0.5 flex items-center gap-1.5">
            Preview error
            {extra > 0 && (
              <span className="text-[10px] text-red-300/60">
                +{extra} more
              </span>
            )}
          </div>
          <div className="text-[13px] text-red-100 leading-snug font-mono truncate">
            {latest.message}
          </div>
        </div>
        <button
          onClick={() => dismiss(latest.id)}
          className="text-red-300/60 hover:text-red-200 p-0.5"
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
      <button
        onClick={askToFix}
        disabled={sending}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border-t border-red-500/20 text-[12.5px] text-red-100 hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
      >
        <Wand2 size={13} />
        Ask AI to fix
      </button>
    </div>
  );
}
