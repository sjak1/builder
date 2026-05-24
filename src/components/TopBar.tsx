"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  History,
  Rocket,
  Share2,
  Sparkles,
  Terminal,
} from "lucide-react";
import { wcManager } from "@/lib/webcontainer";
import { useStore, type Tab } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/Button";

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Code", icon: Code2 },
  { id: "logs", label: "Logs", icon: Terminal },
];

export function TopBar({
  readOnly = false,
  projectId,
  initialShareSlug = null,
}: {
  readOnly?: boolean;
  projectId?: string;
  initialShareSlug?: string | null;
}) {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const projectName = useStore((s) => s.projectName);
  const setProjectName = useStore((s) => s.setProjectName);
  const checkpoints = useStore((s) => s.checkpoints);
  const revert = useStore((s) => s.revertCheckpoint);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);
  const [openHistory, setOpenHistory] = useState(false);

  return (
    <header className="h-14 border-b border-neutral-800/80 bg-neutral-950 px-5 flex items-center gap-3">
      <Link
        href={readOnly ? "/" : "/dashboard"}
        className="flex items-center gap-2.5 pr-3 group"
        title={readOnly ? "Builder home" : "Back to dashboard"}
      >
        <Sparkles size={18} className="text-violet-400 group-hover:text-violet-300 transition-colors" />
        <span className="font-serif text-[20px] leading-none text-neutral-100 group-hover:text-white transition-colors">
          Builder
        </span>
      </Link>

      <div className="h-5 w-px bg-neutral-800" />

      <div className="flex items-center gap-1 text-sm">
        {readOnly ? (
          <span className="text-neutral-200 px-1.5 py-0.5 inline-flex items-center gap-2">
            {projectName}
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
              Read-only
            </span>
          </span>
        ) : editingName ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              setProjectName(draftName.trim() || "Untitled project");
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setProjectName(draftName.trim() || "Untitled project");
                setEditingName(false);
              } else if (e.key === "Escape") {
                setDraftName(projectName);
                setEditingName(false);
              }
            }}
            className="bg-neutral-900 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-600 w-40"
          />
        ) : (
          <button
            onClick={() => {
              setDraftName(projectName);
              setEditingName(true);
            }}
            className="text-neutral-200 hover:text-white px-1.5 py-0.5 rounded hover:bg-neutral-800"
          >
            {projectName}
          </button>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5 rounded-xl bg-neutral-900/80 p-1 border border-neutral-800">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-1.5 px-3 h-8 text-[13px] rounded-lg transition-colors ${
              activeTab === id
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:text-neutral-100"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {!readOnly && projectId && <DeployButton projectId={projectId} />}
      {!readOnly && projectId && (
        <ShareMenu projectId={projectId} initialSlug={initialShareSlug} />
      )}
      {readOnly && projectId && <ForkButton projectId={projectId} />}

      <div className="relative">
        <IconButton
          aria-label="History"
          active={openHistory}
          onClick={() => setOpenHistory((v) => !v)}
        >
          <History size={16} />
        </IconButton>
        {openHistory && (
          <div className="absolute right-0 top-full mt-1.5 w-72 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-30 overflow-hidden">
            <div className="px-3 py-2 border-b border-neutral-800 text-xs uppercase tracking-wider text-neutral-500">
              Checkpoints
            </div>
            {checkpoints.length === 0 && (
              <div className="px-3 py-4 text-xs text-neutral-500">
                No checkpoints yet. One is created before each prompt.
              </div>
            )}
            <ul className="max-h-72 overflow-y-auto">
              {[...checkpoints].reverse().map((cp) => (
                <li key={cp.id}>
                  <button
                    onClick={() => {
                      revert(cp.id);
                      setOpenHistory(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-neutral-800 flex items-center gap-2"
                  >
                    <ChevronDown size={12} className="text-neutral-500" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-neutral-200 truncate">
                        {cp.label}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        {new Date(cp.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}

function ShareMenu({
  projectId,
  initialSlug,
}: {
  projectId: string;
  initialSlug: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function enable() {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/share`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (data.share_slug) setSlug(data.share_slug);
  }

  async function disable() {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/share`, { method: "DELETE" });
    setSlug(null);
    setBusy(false);
  }

  async function copyUrl() {
    if (!slug) return;
    const url = `${window.location.origin}/s/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const shareUrl = slug ? `${window.location.origin}/s/${slug}` : "";

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        <Share2 size={13} />
        Share
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-80 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-30 overflow-hidden">
            <div className="px-3.5 py-3 border-b border-neutral-800">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Globe size={14} className="text-neutral-400" />
                Share this project
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Anyone with the link can view your project (read-only).
              </p>
            </div>
            {slug ? (
              <div className="p-3.5 space-y-3">
                <div className="flex gap-1.5">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={copyUrl}
                    className="shrink-0 px-2.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs inline-flex items-center gap-1"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={disable}
                  disabled={busy}
                  className="w-full text-xs text-red-300 hover:text-red-200 py-1.5 disabled:opacity-50"
                >
                  Stop sharing
                </button>
              </div>
            ) : (
              <div className="p-3.5">
                <Button onClick={enable} disabled={busy} className="w-full">
                  {busy ? "Creating link…" : "Create public link"}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type DeployState =
  | { kind: "idle" }
  | { kind: "building" }
  | { kind: "uploading" }
  | { kind: "done"; url: string }
  | { kind: "error"; message: string };

function DeployButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeployState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  async function deploy() {
    setState({ kind: "building" });
    try {
      const dist = await wcManager.buildFrontend();
      if (Object.keys(dist).length === 0) {
        throw new Error("build produced no files in dist/");
      }
      setState({ kind: "uploading" });
      const res = await fetch(`/api/projects/${projectId}/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: dist }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setState({ kind: "done", url: data.url });
    } catch (err) {
      setState({ kind: "error", message: (err as Error).message });
    }
  }

  async function copyUrl() {
    if (state.kind !== "done") return;
    await navigator.clipboard.writeText(state.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const busy = state.kind === "building" || state.kind === "uploading";

  return (
    <div className="relative">
      <Button
        variant="primary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
      >
        <Rocket size={13} />
        {state.kind === "building"
          ? "Building…"
          : state.kind === "uploading"
            ? "Deploying…"
            : "Deploy"}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-80 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-30 overflow-hidden">
            <div className="px-3.5 py-3 border-b border-neutral-800">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Rocket size={14} className="text-violet-400" />
                Deploy to the web
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                Builds the frontend and ships it to Cloudflare Pages.
                <br />
                <span className="text-neutral-600">
                  Backend (Hono) stays in the preview for now.
                </span>
              </p>
            </div>

            {state.kind === "idle" || state.kind === "error" ? (
              <div className="p-3.5">
                <Button onClick={deploy} className="w-full">
                  Deploy now
                </Button>
                {state.kind === "error" && (
                  <p className="mt-2.5 text-[11px] text-red-400 leading-snug break-words">
                    {state.message}
                  </p>
                )}
              </div>
            ) : busy ? (
              <div className="p-4 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-neutral-300">
                  <div className="size-2 rounded-full bg-violet-400 animate-pulse" />
                  {state.kind === "building"
                    ? "Building your app…"
                    : "Uploading to Cloudflare…"}
                </div>
                <p className="text-[11px] text-neutral-600 mt-1.5">
                  This usually takes 10–20 seconds.
                </p>
              </div>
            ) : state.kind === "done" ? (
              <div className="p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <Check size={13} /> Live
                </div>
                <div className="flex gap-1.5">
                  <input
                    readOnly
                    value={state.url}
                    className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-300 focus:outline-none"
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={copyUrl}
                    className="shrink-0 px-2.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs inline-flex items-center gap-1"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
                <a
                  href={state.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-md bg-white text-neutral-900 hover:bg-neutral-200 text-xs font-medium"
                >
                  <ExternalLink size={12} />
                  Open in new tab
                </a>
                <button
                  onClick={deploy}
                  className="w-full text-xs text-neutral-400 hover:text-neutral-200 py-1.5"
                >
                  Deploy again
                </button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function ForkButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function fork() {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/fork`, { method: "POST" });
    if (res.status === 401) {
      router.push(`/login?next=/s/${projectId}`);
      return;
    }
    const data = await res.json();
    setBusy(false);
    if (data.id) router.push(`/p/${data.id}`);
  }

  return (
    <Button onClick={fork} disabled={busy} size="sm">
      {busy ? "Forking…" : "Fork to my account"}
    </Button>
  );
}
