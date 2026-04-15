import { useChat } from "@/hooks/useChat";
import { useAcp } from "@/hooks/useAcp";
import { MessageList } from "@/components/MessageList";
import { ChatInput } from "@/components/ChatInput";
import { Header } from "@/components/Header";

export function Chat() {
  const { isConnected } = useAcp();
  const { messages, sendMessage, cancelMessage, isStreaming } = useChat();

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <Header />
      <MessageList messages={messages} isStreaming={isStreaming} />
      <div className="max-w-4xl mx-auto w-full">
        <ChatInput
          onSend={sendMessage}
          onCancel={cancelMessage}
          isStreaming={isStreaming}
          disabled={!isConnected}
        />
      </div>
    </div>
  );
}
