import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { AcpClient } from "@/lib/acp-client";

interface AcpContextType {
  client: AcpClient;
  isConnected: boolean;
  error: string | null;
  reconnect: () => Promise<void>;
}

const AcpContext = createContext<AcpContextType | null>(null);

const BASE_URL = import.meta.env.VITE_ACP_URL || "";

export function AcpProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new AcpClient(BASE_URL));
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      const status = await client.status();
      if (status.trim() === "ok") {
        await client.initialize();
        await client.sendInitialized();
        setIsConnected(true);
        setError(null);
      }
    } catch (err) {
      setIsConnected(false);
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, [client]);

  useEffect(() => {
    connect();
    const interval = setInterval(async () => {
      try {
        const status = await client.status();
        if (status.trim() !== "ok") {
          setIsConnected(false);
        }
      } catch {
        setIsConnected(false);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [client, connect]);

  return (
    <AcpContext.Provider value={{ client, isConnected, error, reconnect: connect }}>
      {children}
    </AcpContext.Provider>
  );
}

export function useAcp(): AcpContextType {
  const ctx = useContext(AcpContext);
  if (!ctx) throw new Error("useAcp must be used within AcpProvider");
  return ctx;
}
