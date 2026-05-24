"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User } from "lucide-react";
import type { Message as MessageType } from "@/lib/store";
import { ToolCallCard } from "./ToolCallCard";
import { QuestionsCard, type AnswerMap } from "./QuestionsCard";

export function MessageView({
  message,
  onAnswerQuestions,
}: {
  message: MessageType;
  onAnswerQuestions?: (messageId: string, answers: AnswerMap) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className="flex gap-3.5">
      <div
        className={`size-8 shrink-0 rounded-full flex items-center justify-center ${
          isUser ? "bg-violet-500/20 text-violet-300" : "bg-neutral-800 text-neutral-300"
        }`}
      >
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>
      <div className="min-w-0 flex-1 space-y-3 pt-1">
        {message.blocks.map((block, i) => {
          if (block.type === "text") {
            if (!block.text) return null;
            return (
              <div
                key={i}
                className="prose prose-invert prose-sm max-w-none text-[14px] text-neutral-200 leading-[1.7]
                  prose-p:my-2 prose-headings:font-semibold prose-headings:my-3
                  prose-code:bg-neutral-800 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[12.5px] prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-800 prose-pre:rounded-xl prose-pre:text-xs prose-pre:p-4
                  prose-strong:text-white prose-a:text-violet-300"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
              </div>
            );
          }
          if (block.type === "questions") {
            return (
              <QuestionsCard
                key={i}
                block={block}
                onSubmit={(answers) =>
                  onAnswerQuestions?.(message.id, answers)
                }
              />
            );
          }
          return <ToolCallCard key={i} block={block} />;
        })}
      </div>
    </div>
  );
}
