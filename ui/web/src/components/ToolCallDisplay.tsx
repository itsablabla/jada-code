import { useState } from "react";
import type { ContentPart } from "@/lib/acp-client";

interface ToolCallDisplayProps {
  name: string;
  arguments?: Record<string, unknown>;
  result?: ContentPart;
}

export function ToolCallDisplay({ name, arguments: args, result }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  const hasError = result?.isError;
  const statusColor = result
    ? hasError
      ? "text-red-400"
      : "text-green-400"
    : "text-yellow-400";
  const statusIcon = result ? (hasError ? "✗" : "✓") : "⋯";

  return (
    <div className="my-2 rounded-lg border border-gray-700 bg-gray-900/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-800/50 transition-colors"
      >
        <span className={`font-mono ${statusColor}`}>{statusIcon}</span>
        <span className="font-mono text-blue-400">{name}</span>
        <span className="ml-auto text-gray-500 text-xs">
          {expanded ? "▼" : "▶"}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-3 py-2 text-xs">
          {args && Object.keys(args).length > 0 && (
            <div className="mb-2">
              <div className="text-gray-500 mb-1">Arguments:</div>
              <pre className="bg-gray-950 rounded p-2 overflow-x-auto text-gray-300 whitespace-pre-wrap">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result && (
            <div>
              <div className={`mb-1 ${hasError ? "text-red-400" : "text-gray-500"}`}>
                {hasError ? "Error:" : "Result:"}
              </div>
              <pre className="bg-gray-950 rounded p-2 overflow-x-auto text-gray-300 whitespace-pre-wrap">
                {typeof result.result === "string"
                  ? result.result
                  : JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
