"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  FilePlus,
  FileText,
  Trash2,
} from "lucide-react";
import type { ToolBlock } from "@/lib/store";

const labels: Record<ToolBlock["op"], string> = {
  write_file: "Wrote",
  edit_file: "Edited",
  delete_file: "Deleted",
};

const icons: Record<ToolBlock["op"], React.ComponentType<{ size?: number }>> = {
  write_file: FilePlus,
  edit_file: FileText,
  delete_file: Trash2,
};

export function ToolCallCard({ block }: { block: ToolBlock }) {
  const [open, setOpen] = useState(false);
  const Icon = block.status === "error" ? AlertTriangle : icons[block.op];

  const lineCount = block.contents
    ? block.contents.split("\n").length
    : null;

  const canExpand =
    block.status === "error" || (block.contents && block.op !== "delete_file");

  return (
    <div
      className={`rounded-lg border text-xs overflow-hidden ${
        block.status === "error"
          ? "border-red-500/30 bg-red-500/5"
          : "border-neutral-800 bg-neutral-900/60"
      }`}
    >
      <button
        type="button"
        onClick={() => canExpand && setOpen((v) => !v)}
        className={`w-full px-2.5 py-1.5 flex items-center gap-2 text-left ${
          canExpand ? "hover:bg-white/[0.03]" : "cursor-default"
        }`}
      >
        {canExpand && (
          <ChevronRight
            size={12}
            className={`text-neutral-500 transition-transform ${open ? "rotate-90" : ""}`}
          />
        )}
        <Icon size={13} />
        <span
          className={
            block.status === "error" ? "text-red-300" : "text-neutral-300"
          }
        >
          {block.status === "error"
            ? `${block.op.replace("_", " ")} failed`
            : labels[block.op]}
        </span>
        <code className="text-neutral-100 font-mono">{block.path}</code>
        {lineCount != null && block.status === "ok" && (
          <span className="ml-auto text-neutral-500">{lineCount} lines</span>
        )}
      </button>
      {open && (
        <div className="border-t border-neutral-800 max-h-64 overflow-auto">
          {block.status === "error" ? (
            <pre className="px-3 py-2 text-red-300 whitespace-pre-wrap text-[11px] font-mono">
              {block.message}
            </pre>
          ) : (
            <pre className="px-3 py-2 text-neutral-200 whitespace-pre text-[11px] font-mono">
              {block.contents}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
