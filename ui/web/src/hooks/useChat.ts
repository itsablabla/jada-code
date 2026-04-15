import { useState, useCallback, useRef } from "react";
import { useAcp } from "./useAcp";
import type { AcpStreamEvent, ContentPart } from "@/lib/acp-client";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: ContentPart[];
  timestamp: number;
}

export function useChat() {
  const { client, isConnected } = useAcp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const assistantBufferRef = useRef<ContentPart[]>([]);
  const assistantIdRef = useRef<string>("");

  const sendMessage = useCallback(
    async (text: string) => {
      if (!isConnected || isStreaming) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      };

      assistantIdRef.current = `assistant-${Date.now()}`;
      assistantBufferRef.current = [];

      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantIdRef.current,
          role: "assistant",
          content: [],
          timestamp: Date.now(),
        },
      ]);
      setIsStreaming(true);

      try {
        await client.sendMessage(text, (event: AcpStreamEvent) => {
          handleStreamEvent(event);
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          assistantBufferRef.current.push({
            type: "text",
            text: `Error: ${(err as Error).message}`,
          });
          updateAssistantMessage();
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [client, isConnected, isStreaming]
  );

  function handleStreamEvent(event: AcpStreamEvent) {
    // JSON-RPC result with content (final response or intermediate)
    if (event.result && typeof event.result === "object") {
      const result = event.result as Record<string, unknown>;

      // Handle content array in result
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          const contentItem = item as Record<string, unknown>;
          if (contentItem.type === "text" && contentItem.text) {
            // Append or update text content
            const existingText = assistantBufferRef.current.find(
              (c) => c.type === "text"
            );
            if (existingText) {
              existingText.text = (existingText.text ?? "") + String(contentItem.text);
            } else {
              assistantBufferRef.current.push({
                type: "text",
                text: String(contentItem.text),
              });
            }
          }
        }
        updateAssistantMessage();
        return;
      }

      // Handle model field (streaming text chunks)
      if (result.model || result.message) {
        const msg = (result.message ?? result) as Record<string, unknown>;
        if (msg.content && Array.isArray(msg.content)) {
          for (const item of msg.content) {
            const ci = item as Record<string, unknown>;
            if (ci.type === "text" && ci.text) {
              const existingText = assistantBufferRef.current.find(
                (c) => c.type === "text"
              );
              if (existingText) {
                existingText.text = (existingText.text ?? "") + String(ci.text);
              } else {
                assistantBufferRef.current.push({
                  type: "text",
                  text: String(ci.text),
                });
              }
            }
          }
          updateAssistantMessage();
          return;
        }
      }
    }

    // JSON-RPC notification with params (tool calls, progress, etc.)
    if (event.method && event.params) {
      const params = event.params;

      if (event.method === "notifications/message" || event.method === "notifications/progress") {
        const data = params.data as Record<string, unknown> | undefined;
        if (data) {
          // Tool call notification
          if (data.type === "tool_call" || data.tool_name || data.name) {
            assistantBufferRef.current.push({
              type: "tool_call",
              name: String(data.tool_name ?? data.name ?? "tool"),
              arguments: (data.arguments ?? data.input ?? {}) as Record<string, unknown>,
              id: String(data.id ?? Date.now()),
            });
            updateAssistantMessage();
            return;
          }

          // Tool result notification
          if (data.type === "tool_result") {
            assistantBufferRef.current.push({
              type: "tool_result",
              id: String(data.id ?? ""),
              name: String(data.tool_name ?? data.name ?? "tool"),
              result: data.result ?? data.output,
              isError: Boolean(data.isError),
            });
            updateAssistantMessage();
            return;
          }

          // Text content in notification
          if (data.type === "text" || typeof data.text === "string") {
            const existingText = assistantBufferRef.current.find(
              (c) => c.type === "text"
            );
            if (existingText) {
              existingText.text = (existingText.text ?? "") + String(data.text);
            } else {
              assistantBufferRef.current.push({
                type: "text",
                text: String(data.text),
              });
            }
            updateAssistantMessage();
            return;
          }
        }
      }
    }

    // Error
    if (event.error) {
      assistantBufferRef.current.push({
        type: "text",
        text: `Error: ${event.error.message}`,
      });
      updateAssistantMessage();
    }
  }

  function updateAssistantMessage() {
    const id = assistantIdRef.current;
    const content = [...assistantBufferRef.current];
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content } : m))
    );
  }

  const cancelMessage = useCallback(() => {
    client.cancel();
    setIsStreaming(false);
  }, [client]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, sendMessage, cancelMessage, clearMessages, isStreaming };
}
