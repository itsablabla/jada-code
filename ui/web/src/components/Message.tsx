import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/hooks/useChat";
import { ToolCallDisplay } from "./ToolCallDisplay";

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  const textContent = message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");

  const toolCalls = message.content.filter((c) => c.type === "tool_call");
  const toolResults = message.content.filter((c) => c.type === "tool_result");

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
          J
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-800 text-gray-100"
        }`}
      >
        {textContent && (
          <div className="prose prose-invert prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
          </div>
        )}

        {toolCalls.map((tc, i) => (
          <ToolCallDisplay
            key={tc.id ?? i}
            name={tc.name ?? "tool"}
            arguments={tc.arguments}
            result={toolResults.find((r) => r.id === tc.id)}
          />
        ))}

        {/* Show orphan tool results (no matching tool call) */}
        {toolResults
          .filter((r) => !toolCalls.some((tc) => tc.id === r.id))
          .map((r, i) => (
            <ToolCallDisplay
              key={r.id ?? `result-${i}`}
              name={r.name ?? "tool"}
              result={r}
            />
          ))}

        {!textContent && toolCalls.length === 0 && toolResults.length === 0 && (
          <span className="text-gray-500 italic">Thinking...</span>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm">
          You
        </div>
      )}
    </div>
  );
}
