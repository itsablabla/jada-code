/**
 * ACP (Agent Communication Protocol) client for Jada Code.
 * Speaks JSON-RPC 2.0 over HTTP POST/SSE to the /acp endpoint.
 */

export interface AcpMessage {
  role: "user" | "assistant";
  content: ContentPart[];
}

export interface ContentPart {
  type: "text" | "tool_call" | "tool_result";
  text?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  id?: string;
  isError?: boolean;
}

export interface AcpCapabilities {
  protocolVersion: number;
  agentCapabilities: Record<string, unknown>;
}

export type AcpEventCallback = (event: AcpStreamEvent) => void;

export interface AcpStreamEvent {
  jsonrpc: string;
  method?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  params?: Record<string, unknown>;
}

let rpcId = 1;
function nextId(): number {
  return rpcId++;
}

function jsonrpc(method: string, params?: Record<string, unknown>, id?: number) {
  return {
    jsonrpc: "2.0",
    id: id ?? nextId(),
    method,
    params: params ?? {},
  };
}

export class AcpClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? "").replace(/\/$/, "");
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async status(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/status`);
    return res.text();
  }

  /** Initialize the ACP connection — returns capabilities and sets session ID */
  async initialize(): Promise<AcpCapabilities> {
    const id = nextId();
    const body = jsonrpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "jada-code-web", version: "1.0" },
    }, id);

    const res = await fetch(`${this.baseUrl}/acp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });

    const acpSessionId = res.headers.get("acp-session-id");
    if (acpSessionId) {
      this.sessionId = acpSessionId;
    }

    // Read SSE response
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) throw new Error("No data in initialize response");
    const parsed = JSON.parse(dataLine.slice(5).trim());
    return parsed.result as AcpCapabilities;
  }

  /** Send initialized notification (required after initialize) */
  async sendInitialized(): Promise<void> {
    await fetch(`${this.baseUrl}/acp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Acp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
  }

  /** Send a user message and stream back assistant responses via SSE */
  async sendMessage(
    text: string,
    onEvent: AcpEventCallback,
    signal?: AbortSignal
  ): Promise<void> {
    if (!this.sessionId) {
      await this.initialize();
      await this.sendInitialized();
    }

    const id = nextId();
    const body = jsonrpc(
      "agent/message",
      {
        messages: [
          {
            role: "user",
            content: { type: "text", text },
          },
        ],
      },
      id
    );

    this.abortController = new AbortController();
    const combinedSignal = signal
      ? AbortSignal.any([signal, this.abortController.signal])
      : this.abortController.signal;

    const res = await fetch(`${this.baseUrl}/acp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "Acp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ACP error ${res.status}: ${errText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const data = trimmed.slice(5).trim();
            if (data) {
              try {
                const event = JSON.parse(data) as AcpStreamEvent;
                onEvent(event);
              } catch {
                // skip malformed JSON
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.abortController = null;
    }
  }

  /** Cancel an in-flight message */
  cancel(): void {
    this.abortController?.abort();
  }

  /** Close the ACP session */
  async close(): Promise<void> {
    if (!this.sessionId) return;
    await fetch(`${this.baseUrl}/acp`, {
      method: "DELETE",
      headers: {
        "Acp-Session-Id": this.sessionId,
      },
    });
    this.sessionId = null;
  }
}
