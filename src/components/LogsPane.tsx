"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { IconButton } from "@/components/ui/Button";

// Strip ANSI CSI (colors, cursor moves), OSC (titles), and other escape sequences.
// eslint-disable-next-line no-control-regex
const ANSI_CSI = /\x1B\[[0-?]*[ -/]*[@-~]/g;
// eslint-disable-next-line no-control-regex
const ANSI_OSC = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g;
// eslint-disable-next-line no-control-regex
const ANSI_OTHER = /\x1B[@-Z\\-_]/g;

function clean(raw: string): string {
  return raw
    .replace(ANSI_OSC, "")
    .replace(ANSI_CSI, "")
    .replace(ANSI_OTHER, "")
    // Normalize CRLF → LF first so trailing \r doesn't get treated as a
    // line-reset and erase the line above it.
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      // An internal \r is a "redraw this line" — keep only what came after
      // the last one. A trailing \r (after we already stripped CRLFs above)
      // is rare progress output; strip it.
      const trimmed = line.replace(/\r$/, "");
      const idx = trimmed.lastIndexOf("\r");
      return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
    })
    .join("\n");
}

export function LogsPane() {
  const logs = useStore((s) => s.logs);
  const setLogs = useStore.setState;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const [filter, setFilter] = useState("");

  const lines = useMemo(() => {
    const text = clean(logs.join(""));
    // Drop a single trailing empty line from the final split (artifact of trailing \n),
    // but preserve interior blanks so Vite's boxed output keeps its shape.
    const split = text.split("\n");
    if (split.length && split[split.length - 1] === "") split.pop();
    if (!filter) return split;
    const needle = filter.toLowerCase();
    return split.filter((l) => l.toLowerCase().includes(needle));
  }, [logs, filter]);

  useEffect(() => {
    if (!stick) return;
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
    });
  }, [lines, stick]);

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      <div className="h-12 border-b border-neutral-800/80 px-4 flex items-center gap-2.5">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="h-7 bg-neutral-900 border border-neutral-800 rounded px-2 text-xs focus:outline-none focus:border-neutral-600 w-48"
        />
        <label className="text-[11px] text-neutral-500 inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={stick}
            onChange={(e) => setStick(e.target.checked)}
          />
          Auto-scroll
        </label>
        <div className="flex-1" />
        <IconButton
          onClick={() => setLogs({ logs: [] })}
          title="Clear"
          aria-label="Clear logs"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>
      <div
        ref={scrollerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
          setStick(atBottom);
        }}
        className="flex-1 overflow-auto p-5 font-mono text-[12px] leading-[1.7] text-neutral-300"
      >
        {lines.length === 0 && (
          <div className="text-neutral-600 text-xs">No logs yet.</div>
        )}
        {lines.map((line, i) => (
          <LogLine key={i} line={line} />
        ))}
      </div>
    </div>
  );
}

function LogLine({ line }: { line: string }) {
  const lower = line.toLowerCase();
  let color = "text-neutral-300";
  if (lower.includes("error") || lower.includes("fail")) color = "text-red-400";
  else if (lower.includes("warn")) color = "text-amber-300";
  else if (lower.includes("ready") || lower.includes("vite v")) color = "text-emerald-300";
  return (
    <div className={`${color} whitespace-pre min-h-[1.7em]`}>
      {line || " "}
    </div>
  );
}
