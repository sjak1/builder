"use client";

import type { Highlighter } from "shiki";

let promise: Promise<Highlighter> | null = null;

export async function getHighlighter(): Promise<Highlighter> {
  if (!promise) {
    promise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: ["github-dark"],
        langs: ["tsx", "ts", "jsx", "js", "json", "css", "html", "md"],
      }),
    );
  }
  return promise;
}

export function langForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "tsx":
      return "tsx";
    case "ts":
      return "ts";
    case "jsx":
      return "jsx";
    case "js":
    case "mjs":
    case "cjs":
      return "js";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "html";
    case "md":
      return "md";
    default:
      return "ts";
  }
}
