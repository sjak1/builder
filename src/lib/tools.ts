import type Anthropic from "@anthropic-ai/sdk";

export const toolDefinitions: Anthropic.Messages.Tool[] = [
  {
    name: "write_file",
    description:
      "Create a new file, or completely overwrite an existing one. Provide the COMPLETE file contents — no diffs, no ellipses. Prefer edit_file when changing only part of a file.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Repo-relative path, e.g. src/components/Counter.tsx",
        },
        contents: { type: "string", description: "Full file contents." },
      },
      required: ["path", "contents"],
    },
  },
  {
    name: "edit_file",
    description: [
      "Replace an exact string in an existing file. Cheaper and safer than rewriting the whole file.",
      "Rules:",
      "- old_string must appear in the file exactly as written (whitespace, indentation, newlines matter).",
      "- old_string must be UNIQUE in the file unless replace_all is true; if it appears more than once you'll get an error and must add surrounding context to disambiguate.",
      "- new_string must differ from old_string.",
      "- Cannot create files; use write_file for that.",
      "If the edit fails, the error message will tell you why — read it and adjust (e.g. add more context lines, use replace_all, or fall back to write_file).",
    ].join("\n"),
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Repo-relative file path." },
        old_string: {
          type: "string",
          description: "Exact text to find. Include enough surrounding context to be unique.",
        },
        new_string: { type: "string", description: "Text to replace it with." },
        replace_all: {
          type: "boolean",
          description: "If true, replace every occurrence. Default false.",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "delete_file",
    description: "Delete a file from the project. Errors if the file doesn't exist.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
];

export type ToolExecResult =
  | { kind: "write"; path: string; contents: string; message: string }
  | { kind: "delete"; path: string; message: string }
  | { kind: "error"; message: string };

export function executeTool(
  name: string,
  rawInput: unknown,
  files: Map<string, string>,
): ToolExecResult {
  const input = rawInput as Record<string, unknown>;

  if (name === "write_file") {
    const path = stringArg(input, "path");
    const contents = stringArg(input, "contents");
    if (path == null || contents == null) {
      return { kind: "error", message: "write_file requires path and contents (strings)." };
    }
    const safePath = normalizePath(path);
    if (safePath == null) return { kind: "error", message: `Invalid path: ${path}` };
    files.set(safePath, contents);
    return { kind: "write", path: safePath, contents, message: `Wrote ${safePath}` };
  }

  if (name === "edit_file") {
    const path = stringArg(input, "path");
    const oldStr = stringArg(input, "old_string");
    const newStr = stringArg(input, "new_string");
    const replaceAll = input.replace_all === true;
    if (path == null || oldStr == null || newStr == null) {
      return {
        kind: "error",
        message: "edit_file requires path, old_string, new_string (strings).",
      };
    }
    const safePath = normalizePath(path);
    if (safePath == null) return { kind: "error", message: `Invalid path: ${path}` };

    const current = files.get(safePath);
    if (current === undefined) {
      return {
        kind: "error",
        message: `File not found: ${safePath}. Use write_file to create new files.`,
      };
    }
    if (oldStr === newStr) {
      return { kind: "error", message: "old_string and new_string are identical." };
    }
    if (oldStr.length === 0) {
      return { kind: "error", message: "old_string must not be empty." };
    }
    if (!current.includes(oldStr)) {
      return {
        kind: "error",
        message: `old_string not found in ${safePath}. The file's current contents are below; copy the exact substring you want to change.\n\n--- ${safePath} ---\n${current}`,
      };
    }
    const occurrences = countOccurrences(current, oldStr);
    if (occurrences > 1 && !replaceAll) {
      return {
        kind: "error",
        message: `old_string appears ${occurrences} times in ${safePath}. Either add more surrounding context to make it unique, or set replace_all: true.`,
      };
    }
    const next = replaceAll
      ? current.split(oldStr).join(newStr)
      : current.replace(oldStr, newStr);
    files.set(safePath, next);
    return {
      kind: "write",
      path: safePath,
      contents: next,
      message: `Edited ${safePath} (${occurrences} replacement${occurrences === 1 ? "" : "s"}).`,
    };
  }

  if (name === "delete_file") {
    const path = stringArg(input, "path");
    if (path == null) return { kind: "error", message: "delete_file requires path." };
    const safePath = normalizePath(path);
    if (safePath == null) return { kind: "error", message: `Invalid path: ${path}` };
    if (!files.has(safePath)) {
      return { kind: "error", message: `File not found: ${safePath}.` };
    }
    files.delete(safePath);
    return { kind: "delete", path: safePath, message: `Deleted ${safePath}` };
  }

  return { kind: "error", message: `Unknown tool: ${name}` };
}

function stringArg(input: Record<string, unknown>, key: string): string | null {
  const v = input[key];
  return typeof v === "string" ? v : null;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

function normalizePath(path: string): string | null {
  const trimmed = path.replace(/^\.\//, "").replace(/^\/+/, "");
  if (trimmed.length === 0) return null;
  if (trimmed.split("/").some((seg) => seg === "..")) return null;
  if (trimmed.startsWith("node_modules/") || trimmed === "node_modules") return null;
  return trimmed;
}
