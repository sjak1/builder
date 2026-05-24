"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import { useStore } from "@/lib/store";
import { getHighlighter, langForPath } from "@/lib/highlighter";

type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
};

function buildTree(files: Record<string, string>): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
  const paths = Object.keys(files).sort();
  for (const path of paths) {
    const parts = path.split("/");
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      let child = cursor.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path: childPath, isDir: !isLast, children: [] };
        cursor.children.push(child);
      }
      cursor = child;
    }
  }
  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

export function CodePane() {
  const files = useStore((s) => s.files);
  const tree = useMemo(() => buildTree(files), [files]);
  const pathList = useMemo(() => Object.keys(files), [files]);
  const defaultPath = pathList.find((p) => p === "src/App.tsx") ?? pathList[0] ?? null;
  const [selected, setSelected] = useState<string | null>(defaultPath);

  useEffect(() => {
    if (selected && files[selected] != null) return;
    setSelected(defaultPath);
  }, [defaultPath, files, selected]);

  return (
    <div className="grid grid-cols-[260px_1fr] grid-rows-1 h-full min-h-0">
      <aside className="border-r border-neutral-800 bg-neutral-950 overflow-y-auto py-2">
        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
          Files
        </div>
        <FileTree
          node={tree}
          depth={0}
          selected={selected}
          onSelect={setSelected}
        />
      </aside>
      <div className="flex flex-col min-w-0 min-h-0 bg-neutral-950">
        {selected ? (
          <CodeView path={selected} contents={files[selected] ?? ""} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">
            Select a file
          </div>
        )}
      </div>
    </div>
  );
}

function FileTree({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <ul>
      {node.children.map((child) =>
        child.isDir ? (
          <Dir
            key={child.path}
            node={child}
            depth={depth}
            selected={selected}
            onSelect={onSelect}
          />
        ) : (
          <li key={child.path}>
            <button
              onClick={() => onSelect(child.path)}
              className={`w-full flex items-center gap-1.5 px-3 py-1 text-xs text-left transition-colors ${
                selected === child.path
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900"
              }`}
              style={{ paddingLeft: 12 + depth * 12 }}
            >
              <File size={12} className="shrink-0 text-neutral-500" />
              <span className="truncate">{child.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function Dir({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1 text-xs text-neutral-400 hover:text-white"
        style={{ paddingLeft: 12 + depth * 12 }}
      >
        <ChevronRight
          size={11}
          className={`transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
        />
        <Folder size={12} className="shrink-0 text-neutral-500" />
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <FileTree
          node={node}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      )}
    </li>
  );
}

function CodeView({ path, contents }: { path: string; contents: string }) {
  const [html, setHtml] = useState<string>("");
  const lang = langForPath(path);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hl = await getHighlighter();
        const rendered = hl.codeToHtml(contents, {
          lang,
          theme: "github-dark",
        });
        if (!cancelled) setHtml(rendered);
      } catch {
        if (!cancelled) setHtml("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contents, lang]);

  return (
    <>
      <div className="h-12 border-b border-neutral-800/80 px-4 flex items-center text-[12px] text-neutral-400 font-mono">
        {path}
      </div>
      <div className="flex-1 overflow-auto text-xs leading-relaxed">
        {html ? (
          <div
            className="shiki-host"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="px-4 py-3 text-neutral-300 font-mono whitespace-pre">
            {contents}
          </pre>
        )}
      </div>
    </>
  );
}
