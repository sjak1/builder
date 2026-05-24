"use client";

import { Sparkles } from "lucide-react";

const PROMPTS = [
  "Build a kanban board with three columns",
  "Make a markdown previewer with live rendering",
  "Create a pomodoro timer with sound",
  "A weather widget with a fake API",
  "A typing speed test with WPM and accuracy",
  "A drum machine with keyboard shortcuts",
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="px-6 py-14 flex flex-col items-center text-center">
      <div className="size-14 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20">
        <Sparkles size={24} />
      </div>
      <h2 className="font-serif text-[28px] leading-tight text-neutral-50">
        What do you want to build?
      </h2>
      <p className="text-[13px] text-neutral-500 mt-3 max-w-[20rem] leading-relaxed">
        Describe an app. I&apos;ll write the code and run it live in the preview.
      </p>
      <div className="mt-8 grid gap-2 w-full">
        {PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPick(p)}
            className="text-left text-[13px] text-neutral-300 px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 hover:bg-neutral-800/50 hover:border-neutral-700 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
