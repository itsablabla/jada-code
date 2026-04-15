import { AcpProvider } from "@/hooks/useAcp";
import { Chat } from "@/pages/Chat";

export function App() {
  return (
    <AcpProvider>
      <Chat />
    </AcpProvider>
  );
}
