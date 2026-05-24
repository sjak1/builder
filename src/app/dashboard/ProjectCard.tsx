"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2, ExternalLink } from "lucide-react";

type Props = {
  id: string;
  name: string;
  templateId: string | null;
  updatedAt: string;
  shareSlug: string | null;
};

export function ProjectCard({ id, name, templateId, updatedAt, shareSlug }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setDeleting(false);
  }

  return (
    <div className="group relative">
      <Link
        href={`/p/${id}`}
        className="block rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-700 transition-all p-5 h-full"
      >
        {/* preview placeholder */}
        <div className="aspect-[16/10] rounded-lg bg-gradient-to-br from-neutral-800 to-neutral-900 border border-neutral-800 mb-4 flex items-center justify-center text-neutral-700 text-xs uppercase tracking-wider relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.04] to-blue-500/[0.04]" />
          <span className="relative">{templateId || "blank"}</span>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-neutral-100 group-hover:text-white truncate">
              {name}
            </h3>
            <p
              className="text-xs text-neutral-500 mt-0.5"
              suppressHydrationWarning
            >
              Updated {formatRel(updatedAt)}
            </p>
          </div>
          {shareSlug && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
              Public
            </span>
          )}
        </div>
      </Link>

      {/* menu button overlay */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        aria-label="Options"
        className="absolute top-3 right-3 size-7 rounded-md bg-neutral-900/80 backdrop-blur border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <MoreHorizontal size={14} />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute top-11 right-3 z-20 w-44 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl overflow-hidden text-sm">
            <Link
              href={`/p/${id}`}
              className="flex items-center gap-2 px-3 py-2 text-neutral-200 hover:bg-neutral-800"
            >
              <ExternalLink size={13} />
              Open
            </Link>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="w-full flex items-center gap-2 px-3 py-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              <Trash2 size={13} />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function formatRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
