"use client";

import { ExternalLink, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore, type Viewport } from "@/lib/store";
import { IconButton } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import type { Status } from "@/lib/webcontainer";

// Logical device sizes. The frame is rendered at this resolution inside a
// scaled wrapper so the iframe's viewport always matches a real device,
// regardless of how much space the preview pane has on screen.
const deviceSpec: Record<
  Viewport,
  { w: number; h: number; kind: "phone" | "tablet" | "desktop" }
> = {
  phone: { w: 390, h: 844, kind: "phone" },
  tablet: { w: 1024, h: 768, kind: "tablet" },
  desktop: { w: 1440, h: 900, kind: "desktop" },
};

function DeviceFrame({
  viewport,
  url,
  nonce,
  iframeRef,
  scale,
}: {
  viewport: Viewport;
  url: string;
  nonce: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  scale: number;
}) {
  const spec = deviceSpec[viewport];
  const iframe = (
    <iframe
      ref={iframeRef}
      key={`${url}-${nonce}`}
      src={url}
      className="w-full h-full bg-white block"
      title="Preview"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
    />
  );

  const wrapperStyle: React.CSSProperties = {
    width: spec.w,
    height: spec.h,
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: `translate(-50%, -50%) scale(${scale})`,
    transformOrigin: "center center",
    transition: "transform 500ms cubic-bezier(0.22, 1, 0.36, 1), width 500ms cubic-bezier(0.22, 1, 0.36, 1), height 500ms cubic-bezier(0.22, 1, 0.36, 1)",
  };

  if (spec.kind === "phone") {
    return (
      <div
        style={wrapperStyle}
        className="relative shrink-0 will-change-transform"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-800 to-neutral-950 rounded-[60px] p-[14px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),inset_0_0_0_2px_rgba(255,255,255,0.04)] border border-neutral-700/80">
          {/* Side buttons */}
          <div className="absolute -left-[3px] top-[120px] w-[3px] h-[34px] rounded-l bg-neutral-700" />
          <div className="absolute -left-[3px] top-[170px] w-[3px] h-[60px] rounded-l bg-neutral-700" />
          <div className="absolute -left-[3px] top-[240px] w-[3px] h-[60px] rounded-l bg-neutral-700" />
          <div className="absolute -right-[3px] top-[180px] w-[3px] h-[100px] rounded-r bg-neutral-700" />
          {/* Screen */}
          <div className="relative bg-black rounded-[48px] overflow-hidden w-full h-full">
            {/* Dynamic island */}
            <div className="absolute top-[10px] left-1/2 -translate-x-1/2 w-[110px] h-[33px] bg-black rounded-full z-10" />
            {iframe}
          </div>
        </div>
      </div>
    );
  }

  if (spec.kind === "tablet") {
    return (
      <div
        style={wrapperStyle}
        className="relative shrink-0 will-change-transform"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-800 to-neutral-950 rounded-[28px] p-[16px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7),inset_0_0_0_2px_rgba(255,255,255,0.04)] border border-neutral-700/80">
          <div className="relative bg-black rounded-[14px] overflow-hidden w-full h-full">
            {iframe}
          </div>
          {/* Camera dot */}
          <div className="absolute top-1/2 -translate-y-1/2 left-[6px] size-1.5 rounded-full bg-neutral-700" />
        </div>
      </div>
    );
  }

  // Desktop: browser chrome
  return (
    <div
      style={wrapperStyle}
      className="relative shrink-0 will-change-transform"
    >
      <div className="absolute inset-0 bg-neutral-900 rounded-xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] border border-neutral-700 overflow-hidden flex flex-col">
        <div className="h-10 bg-gradient-to-b from-neutral-800 to-neutral-900 border-b border-neutral-800 flex items-center px-4 gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-full bg-[#ff5f57]" />
            <div className="size-3 rounded-full bg-[#febc2e]" />
            <div className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-md px-3 py-1 text-[11px] text-neutral-400 truncate max-w-[60%] text-center">
              {url}
            </div>
          </div>
          <div className="w-[60px]" />
        </div>
        <div className="flex-1 bg-white min-h-0">{iframe}</div>
      </div>
    </div>
  );
}

export function PreviewPane({ status }: { status: Status }) {
  const viewport = useStore((s) => s.viewport);
  const setViewport = useStore((s) => s.setViewport);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [nonce, setNonce] = useState(0);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      setStageSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const url = status.kind === "ready" ? status.url : null;
  const spec = deviceSpec[viewport];
  // Leave 8% padding so the chassis doesn't kiss the edges.
  const FIT = 0.92;
  const scale =
    stageSize.w && stageSize.h
      ? Math.min(
          (stageSize.w * FIT) / spec.w,
          (stageSize.h * FIT) / spec.h,
          1,
        )
      : 1;

  return (
    <div className="flex flex-col h-full">
      <div className="h-12 border-b border-neutral-800/80 px-4 flex items-center gap-2.5 bg-neutral-950">
        <StatusBadge status={status} />
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 rounded-md bg-neutral-900 border border-neutral-800 p-0.5">
          {(
            [
              { id: "phone" as const, icon: Smartphone, label: "Phone" },
              { id: "tablet" as const, icon: Tablet, label: "Tablet" },
              { id: "desktop" as const, icon: Monitor, label: "Desktop" },
            ]
          ).map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              title={label}
              onClick={() => setViewport(id)}
              className={`size-7 inline-flex items-center justify-center rounded transition-colors ${
                viewport === id
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Icon size={13} />
            </button>
          ))}
        </div>
        <IconButton
          onClick={() => setNonce((n) => n + 1)}
          title="Reload"
          aria-label="Reload"
          disabled={!url}
        >
          <RotateCw size={14} />
        </IconButton>
        <IconButton
          onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
          title="Open in new tab"
          aria-label="Open in new tab"
          disabled={!url}
        >
          <ExternalLink size={14} />
        </IconButton>
      </div>
      <div
        ref={stageRef}
        className="flex-1 bg-gradient-to-b from-neutral-900 to-neutral-950 flex items-center justify-center overflow-hidden relative"
      >
        {url ? (
          <div
            style={{
              width: spec.w * scale,
              height: spec.h * scale,
            }}
            className="relative transition-[width,height] duration-500 ease-out"
          >
            <DeviceFrame
              viewport={viewport}
              url={url}
              nonce={nonce}
              iframeRef={iframeRef}
              scale={scale}
            />
          </div>
        ) : (
          <PreviewPlaceholder status={status} />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  switch (status.kind) {
    case "ready":
      return <Pill color="emerald">● Live</Pill>;
    case "error":
      return <Pill color="red">● {status.message}</Pill>;
    case "idle":
      return <Pill color="neutral">Idle</Pill>;
    default:
      return <Pill color="amber">{statusLabel(status)}</Pill>;
  }
}

function statusLabel(status: Status) {
  switch (status.kind) {
    case "booting":
      return "Booting sandbox…";
    case "installing":
      return "Installing…";
    case "starting":
      return "Starting dev server…";
    default:
      return status.kind;
  }
}

function PreviewPlaceholder({ status }: { status: Status }) {
  return (
    <div className="text-center text-neutral-500 text-sm space-y-3">
      <div className="size-10 mx-auto rounded-full border-2 border-neutral-700 border-t-violet-400 animate-spin" />
      <div>{statusLabel(status)}</div>
      {status.kind === "installing" && (
        <div className="text-[11px] text-neutral-600">First boot takes ~30s</div>
      )}
    </div>
  );
}
