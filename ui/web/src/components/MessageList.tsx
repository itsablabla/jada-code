import { useRef, useEffect } from "react";
import type { ChatMessage } from "@/hooks/useChat";
import { Message } from "./Message";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold">
          J
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-300 mb-1">Jada Code</h2>
          <p className="text-sm">AI coding agent for Garza OS</p>
          <p className="text-xs mt-2 text-gray-600">Powered by Goose + Kimi K2.5</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto py-4">
        {messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
        {isStreaming && (
          <div className="flex gap-3 px-4 py-2">
            <div className="w-8" />
            <div className="flex gap-1 items-center text-gray-500 text-sm">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse [animation-delay:200ms]">●</span>
              <span className="animate-pulse [animation-delay:400ms]">●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
