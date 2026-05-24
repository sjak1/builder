"use client";

import { useState } from "react";
import { Check, Sparkles, Wand2 } from "lucide-react";
import type { AskQuestion, QuestionsBlock } from "@/lib/store";

export type Answer = string | string[];
export type AnswerMap = Record<string, Answer>;

export function QuestionsCard({
  block,
  onSubmit,
}: {
  block: QuestionsBlock;
  onSubmit: (answers: AnswerMap) => void;
}) {
  const [answers, setAnswers] = useState<AnswerMap>({});

  const setAnswer = (id: string, value: Answer) =>
    setAnswers((a) => ({ ...a, [id]: value }));

  const allRequiredAnswered = block.questions.every((q) => {
    const v = answers[q.id];
    if (q.type === "choice") {
      if (q.multi) return Array.isArray(v) && v.length > 0;
      return typeof v === "string" && v.length > 0;
    }
    return typeof v === "string" && v.trim().length > 0;
  });

  if (block.answered) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-[12.5px] text-neutral-500 flex items-center gap-2">
        <Check size={14} className="text-emerald-400" />
        Plan confirmed — building…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-950/30 to-neutral-900/60 overflow-hidden">
      <div className="px-5 py-4 border-b border-violet-500/20 flex items-start gap-3">
        <div className="size-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-md shadow-violet-500/30">
          <Sparkles size={15} />
        </div>
        <div className="flex-1 pt-0.5">
          <div className="text-[11px] uppercase tracking-wider text-violet-300/80 mb-0.5">
            A few quick questions
          </div>
          <div className="text-[14px] text-neutral-100 leading-relaxed">
            {block.intro}
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-6">
        {block.questions.map((q) => (
          <QuestionRow
            key={q.id}
            q={q}
            value={answers[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
          />
        ))}
      </div>

      <div className="px-5 py-3.5 border-t border-violet-500/15 bg-neutral-950/40 flex items-center justify-between">
        <div className="text-[11px] text-neutral-500">
          Your answers shape what gets built.
        </div>
        <button
          onClick={() => onSubmit(answers)}
          disabled={!allRequiredAnswered}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-white text-neutral-900 text-[13px] font-medium hover:bg-neutral-100 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors"
        >
          <Wand2 size={14} />
          Build it
        </button>
      </div>
    </div>
  );
}

function QuestionRow({
  q,
  value,
  onChange,
}: {
  q: AskQuestion;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
}) {
  return (
    <div>
      <div className="text-[13.5px] text-neutral-100 mb-2.5 leading-snug">
        {q.q}
        {q.type === "choice" && q.multi && (
          <span className="ml-2 text-[11px] text-neutral-500 font-normal">
            pick any
          </span>
        )}
      </div>
      {q.type === "choice" ? (
        <ChoiceField q={q} value={value} onChange={onChange} />
      ) : (
        <TextField q={q} value={value} onChange={onChange} />
      )}
    </div>
  );
}

function ChoiceField({
  q,
  value,
  onChange,
}: {
  q: AskQuestion;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
}) {
  const options = q.options ?? [];

  if (q.multi) {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (label: string) => {
      onChange(
        selected.includes(label)
          ? selected.filter((s) => s !== label)
          : [...selected, label],
      );
    };
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt.label);
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => toggle(opt.label)}
              className={`text-left rounded-xl border px-3.5 py-2.5 transition-all ${
                on
                  ? "border-violet-400 bg-violet-500/10 ring-1 ring-violet-400/40"
                  : "border-neutral-800 bg-neutral-900/40 hover:bg-neutral-800/50 hover:border-neutral-700"
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`size-4 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                    on ? "bg-violet-500" : "bg-neutral-800 border border-neutral-700"
                  }`}
                >
                  {on && <Check size={11} className="text-white" />}
                </div>
                <div className="text-[13px] text-neutral-100">{opt.label}</div>
              </div>
              {opt.desc && (
                <div className="text-[11.5px] text-neutral-500 mt-1 ml-6">
                  {opt.desc}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const selected = typeof value === "string" ? value : "";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {options.map((opt) => {
        const on = selected === opt.label;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.label)}
            className={`text-left rounded-xl border px-3.5 py-2.5 transition-all ${
              on
                ? "border-violet-400 bg-violet-500/10 ring-1 ring-violet-400/40"
                : "border-neutral-800 bg-neutral-900/40 hover:bg-neutral-800/50 hover:border-neutral-700"
            }`}
          >
            <div className="text-[13px] text-neutral-100">{opt.label}</div>
            {opt.desc && (
              <div className="text-[11.5px] text-neutral-500 mt-1">
                {opt.desc}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TextField({
  q,
  value,
  onChange,
}: {
  q: AskQuestion;
  value: Answer | undefined;
  onChange: (v: Answer) => void;
}) {
  return (
    <input
      type="text"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.placeholder ?? "Type your answer…"}
      className="w-full h-10 px-3 rounded-xl bg-neutral-900/60 border border-neutral-800 focus:border-violet-400 focus:bg-neutral-900 focus:outline-none text-[13px] placeholder:text-neutral-600 transition-colors"
    />
  );
}
