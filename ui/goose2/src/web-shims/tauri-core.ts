/**
 * Shim for @tauri-apps/api/core — translates Tauri invoke() calls
 * into WebSocket messages against the ACP server.
 *
 * Uses WebSocket transport instead of HTTP/SSE to avoid the mutex
 * deadlock in the HTTP transport where each SSE stream locks the
 * shared receiver and blocks subsequent requests.
 *
 * WebSocket flow:
 *  1. GET /acp → WebSocket upgrade → single bidirectional connection
 *  2. Client sends JSON-RPC messages as text frames
 *  3. Server sends JSON-RPC responses/notifications as text frames
 *  4. Responses are matched to requests by JSON-RPC "id"
 */

import { emit } from "./event-bus";

export function convertFileSrc(path: string, _protocol?: string): string {
  return path;
}

const ACP_BASE =
  (typeof window !== "undefined" &&
    (window as Record<string, unknown>).__ACP_BASE_URL__) ||
  "";

// ---------- WebSocket connection ----------

let ws: WebSocket | null = null;
let wsReady: Promise<void> | null = null;
let rpcId = 1;

/** Pending RPC requests awaiting a response (keyed by JSON-RPC id). */
const pendingRequests = new Map<
  number,
  {
    resolve: (result: unknown) => void;
    reject: (err: Error) => void;
  }
>();

/** Currently active prompt streaming state — tracks which local session is streaming. */
let activeStream: {
  localSessionId: string;
  messageId: string;
  promptRpcId: number;
} | null = null;

function nextId(): number {
  return rpcId++;
}

function getWsUrl(): string {
  // Convert http(s)://host/... to ws(s)://host/acp
  const loc = window.location;
  const base = ACP_BASE || loc.origin;
  const wsProto = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "");
  return `${wsProto}://${host}/acp`;
}

/** Establish the WebSocket connection (once). Returns when connected. */
function ensureWs(): Promise<void> {
  if (wsReady) return wsReady;

  wsReady = new Promise<void>((resolve, reject) => {
    const url = getWsUrl();
    console.log("[acp] Connecting WebSocket:", url);

    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      console.log("[acp] WebSocket connected");
      resolve();
    };

    socket.onerror = (ev) => {
      console.error("[acp] WebSocket error:", ev);
      reject(new Error("WebSocket connection failed"));
    };

    socket.onclose = (ev) => {
      console.warn("[acp] WebSocket closed:", ev.code, ev.reason);
      ws = null;
      wsReady = null;
      initialized = false;
      // Reject any pending requests
      for (const [id, pending] of pendingRequests) {
        pending.reject(new Error("WebSocket closed"));
        pendingRequests.delete(id);
      }
      // If there was an active stream, emit done
      if (activeStream) {
        emit("acp:done", {
          sessionId: activeStream.localSessionId,
          messageId: activeStream.messageId,
        });
        activeStream = null;
      }
    };

    socket.onmessage = (ev) => {
      handleWsMessage(ev.data as string);
    };
  });

  return wsReady;
}

/** Handle an incoming WebSocket message from the server. */
function handleWsMessage(raw: string): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.warn("[acp] Non-JSON message:", raw.slice(0, 200));
    return;
  }

  // --- JSON-RPC Response (has "id" + "result" or "error") ---
  if ("id" in msg && ("result" in msg || "error" in msg)) {
    const id = msg.id as number;
    const pending = pendingRequests.get(id);
    if (pending) {
      pendingRequests.delete(id);
      if (msg.error) {
        const err = msg.error as Record<string, unknown>;
        pending.reject(
          new Error(String(err.message ?? "RPC error")),
        );
      } else {
        pending.resolve(msg.result);
      }
    }

    // If this is the response to a session/prompt request, it means the
    // prompt is complete — emit done
    if (activeStream && activeStream.promptRpcId === id) {
      emit("acp:done", {
        sessionId: activeStream.localSessionId,
        messageId: activeStream.messageId,
      });
      activeStream = null;
    }
    return;
  }

  // --- JSON-RPC Notification (has "method" but no "id") ---
  if ("method" in msg && !("id" in msg)) {
    handleNotification(msg);
    return;
  }

  console.debug("[acp] Unhandled message:", msg);
}

/** Handle a JSON-RPC notification from the server. */
function handleNotification(msg: Record<string, unknown>): void {
  const method = msg.method as string;
  const params = msg.params as Record<string, unknown> | undefined;

  if (!activeStream) {
    // No active stream — can't route notifications to a session
    console.debug("[acp] Notification without active stream:", method);
    return;
  }

  const { localSessionId, messageId } = activeStream;

  switch (method) {
    case "notifications/message": {
      if (!params) break;
      const data = params.data as Record<string, unknown> | undefined;
      if (!data) break;

      if (data.type === "text" || typeof data.text === "string") {
        emit("acp:text", {
          sessionId: localSessionId,
          messageId,
          text: String(data.text ?? ""),
        });
      } else if (data.type === "tool_call" || data.tool_name || data.name) {
        emit("acp:tool_call", {
          sessionId: localSessionId,
          messageId,
          toolCallId: String(data.id ?? `tc-${Date.now()}`),
          title: String(data.tool_name ?? data.name ?? "tool"),
        });
      } else if (data.type === "tool_result") {
        emit("acp:tool_result", {
          sessionId: localSessionId,
          messageId,
          content: String(data.result ?? data.output ?? ""),
        });
      }
      break;
    }

    // ACP session/update notifications — actual server format
    case "session/update": {
      if (!params) break;
      const update = params.update as Record<string, unknown> | undefined;
      if (!update) break;

      // The update has a "sessionUpdate" field indicating what kind of update
      const updateType = (update.sessionUpdate ?? update.type) as string | undefined;

      switch (updateType) {
        case "agent_message_chunk":
        case "AgentMessageChunk": {
          const content = update.content as Record<string, unknown> | undefined;
          if (content?.type === "text" || content?.type === "Text") {
            const text = content.text;
            if (text) {
              emit("acp:text", {
                sessionId: localSessionId,
                messageId,
                text: String(text),
              });
            }
          }
          break;
        }
        case "tool_call":
        case "ToolCall": {
          const tc = update ?? params;
          emit("acp:tool_call", {
            sessionId: localSessionId,
            messageId,
            toolCallId: String(
              (tc.tool_call_id as Record<string, unknown>)?.["0"] ??
              tc.toolCallId ??
              tc.tool_call_id ??
              `tc-${Date.now()}`
            ),
            title: String(tc.title ?? "tool"),
          });
          break;
        }
        case "tool_call_update":
        case "ToolCallUpdate": {
          const tcu = update ?? params;
          const fields = tcu.fields as Record<string, unknown> | undefined;
          if (fields?.title) {
            emit("acp:tool_title", {
              sessionId: localSessionId,
              messageId,
              toolCallId: String(
                (tcu.tool_call_id as Record<string, unknown>)?.["0"] ??
                tcu.toolCallId ??
                tcu.tool_call_id ??
                ""
              ),
              title: String(fields.title),
            });
          }
          if (fields?.content) {
            // Extract preview from content
            const contentArr = fields.content as Array<Record<string, unknown>>;
            let preview = "Done";
            if (Array.isArray(contentArr)) {
              for (const item of contentArr) {
                if (item.type === "Content" || item.content) {
                  const inner = (item.content as Record<string, unknown>) ?? item;
                  if (inner.type === "Text" || inner.type === "text") {
                    const t = (inner as Record<string, unknown>).text;
                    if (typeof t === "object" && t !== null) {
                      preview = String((t as Record<string, unknown>).text ?? "Done");
                    } else {
                      preview = String(t ?? "Done");
                    }
                    break;
                  }
                }
              }
            }
            emit("acp:tool_result", {
              sessionId: localSessionId,
              messageId,
              content: preview,
            });
          }
          break;
        }
        case "session_info_update":
        case "SessionInfoUpdate": {
          const info = update ?? params;
          const title = info.title as Record<string, unknown> | string | undefined;
          const titleStr = typeof title === "string" ? title : (title as Record<string, unknown>)?.value as string | undefined;
          if (titleStr) {
            emit("acp:session_info", {
              sessionId: localSessionId,
              title: titleStr,
            });
          }
          break;
        }
        case "config_option_update":
        case "ConfigOptionUpdate": {
          // Model state updates — extract model info from config options
          const options = (update?.config_options ?? params.config_options) as Array<Record<string, unknown>> | undefined;
          if (options) {
            for (const opt of options) {
              if (opt.category === "Model" || opt.category === "model") {
                const kind = opt.kind as Record<string, unknown> | undefined;
                if (kind?.Select || kind?.select) {
                  const select = (kind.Select ?? kind.select) as Record<string, unknown>;
                  const currentValue = select.current_value ?? select.currentValue;
                  const selectOptions = (select.options ?? select.Options) as unknown;
                  const models: Array<{ id: string; name: string }> = [];
                  
                  if (Array.isArray(selectOptions)) {
                    // Ungrouped
                    for (const v of selectOptions as Array<Record<string, unknown>>) {
                      models.push({
                        id: String(v.value ?? ""),
                        name: String(v.name ?? v.value ?? ""),
                      });
                    }
                  }

                  emit("acp:model_state", {
                    sessionId: localSessionId,
                    providerId: undefined,
                    currentModelId: String(currentValue ?? ""),
                    currentModelName: models.find(m => m.id === String(currentValue))?.name,
                    availableModels: models,
                  });
                }
              }
            }
          }
          break;
        }
        case "user_message_chunk":
        case "UserMessageChunk": {
          // During replay — ignore for now
          break;
        }
        default:
          console.debug("[acp] Unknown notification type:", updateType, params);
      }
      break;
    }

    default:
      console.debug("[acp] Unhandled notification method:", method);
  }
}

/** Send a JSON-RPC request over WebSocket and wait for the response. */
async function rpcRequest(
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  await ensureWs();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }

  const id = nextId();
  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    id,
    method,
  };
  if (params) body.params = params;

  return new Promise<unknown>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    ws!.send(JSON.stringify(body));
  });
}

/** Send a JSON-RPC notification (no response expected). */
async function rpcNotify(
  method: string,
  params?: Record<string, unknown>,
): Promise<void> {
  await ensureWs();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }

  const body: Record<string, unknown> = {
    jsonrpc: "2.0",
    method,
  };
  if (params) body.params = params;

  ws.send(JSON.stringify(body));
}

// ---------- ACP protocol ----------

let initialized = false;

/** Initialize the ACP protocol (once per connection). */
async function initializeAcp(): Promise<void> {
  if (initialized) return;

  const result = await rpcRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "jada-code-web", version: "1.0" },
  });

  console.log("[acp] Initialized:", result);
  initialized = true;

  // Send notifications/initialized
  await rpcNotify("notifications/initialized");
}

/** Create a new agent session and return its goose session ID. */
async function createAgentSession(workingDir = "/tmp"): Promise<string> {
  await initializeAcp();

  const result = (await rpcRequest("session/new", {
    cwd: workingDir,
    mcpServers: [],
  })) as Record<string, unknown>;

  const sessionId = result?.sessionId as string | undefined;
  if (!sessionId) {
    throw new Error("session/new: no sessionId in response: " + JSON.stringify(result));
  }

  return sessionId;
}

// Map local session IDs to goose (agent) session IDs
const sessionMap = new Map<string, string>();

/** Ensure a goose session exists for the given local session ID. */
async function ensureGooseSession(
  localSessionId: string,
  workingDir?: string,
): Promise<string> {
  const existing = sessionMap.get(localSessionId);
  if (existing) return existing;

  const gooseId = await createAgentSession(workingDir ?? "/tmp");
  sessionMap.set(localSessionId, gooseId);

  emit("acp:session_bound", {
    sessionId: localSessionId,
    gooseSessionId: gooseId,
  });

  return gooseId;
}

/** Send a prompt to the agent. Notifications stream via WebSocket automatically. */
async function sendPrompt(
  localSessionId: string,
  gooseSessionId: string,
  prompt: string,
  images?: [string, string][],
): Promise<void> {
  const content: Array<Record<string, unknown>> = [];
  if (images) {
    for (const [data, mimeType] of images) {
      content.push({
        type: "image",
        source: { type: "base64", mediaType: mimeType, data },
      });
    }
  }
  content.push({ type: "text", text: prompt });

  await ensureWs();
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("WebSocket not connected");
  }

  const id = nextId();
  const messageId = `msg-${Date.now()}-${id}`;

  // Set up active stream BEFORE sending the request
  activeStream = {
    localSessionId,
    messageId,
    promptRpcId: id,
  };

  // Emit message_created so the UI shows the assistant bubble
  emit("acp:message_created", {
    sessionId: localSessionId,
    messageId,
    personaId: undefined,
    personaName: undefined,
  });

  const body = {
    jsonrpc: "2.0",
    id,
    method: "session/prompt",
    params: {
      sessionId: gooseSessionId,
      prompt: content,
    },
  };

  // Send the request — the response will come as a JSON-RPC response with matching id,
  // and notifications will stream in between via handleNotification.
  return new Promise<void>((resolve, reject) => {
    pendingRequests.set(id, {
      resolve: () => {
        // The done event is emitted by handleWsMessage when it sees the response
        resolve();
      },
      reject: (err) => {
        if (activeStream?.promptRpcId === id) {
          emit("acp:done", {
            sessionId: localSessionId,
            messageId,
          });
          activeStream = null;
        }
        reject(err);
      },
    });
    ws!.send(JSON.stringify(body));
  });
}

// ---------- Local storage helpers ----------

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`jada:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  localStorage.setItem(`jada:${key}`, JSON.stringify(value));
}

// ---------- Command handler map ----------

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

const handlers: Record<string, Handler> = {
  // ---- ACP core ----
  async discover_acp_providers() {
    return [{ id: "goose", label: "Jada Code" }];
  },

  async acp_send_message(args) {
    const { sessionId, prompt, images } = args as {
      sessionId: string;
      prompt: string;
      images?: [string, string][];
    };

    const gooseSessionId = await ensureGooseSession(sessionId);
    await sendPrompt(sessionId, gooseSessionId, prompt, images);
  },

  async acp_prepare_session(args) {
    const { sessionId, workingDir } = args as {
      sessionId: string;
      workingDir?: string;
    };
    await ensureGooseSession(sessionId ?? "default", workingDir);
  },

  async acp_set_model(_args) {
    // Model is configured server-side
  },

  async acp_list_sessions() {
    try {
      await initializeAcp();
      const result = (await rpcRequest("session/list", {})) as Record<string, unknown>;
      return (result?.sessions as unknown[]) ?? [];
    } catch (err) {
      console.warn("[acp] list sessions error:", err);
    }
    return [];
  },

  async acp_search_sessions(args) {
    const { query } = args as { query: string };
    const sessions = lsGet<Array<{ sessionId: string; title: string }>>(
      "sessions",
      [],
    );
    return sessions
      .filter((s) => s.title?.toLowerCase().includes(query.toLowerCase()))
      .map((s) => ({
        sessionId: s.sessionId,
        snippet: s.title,
        messageId: "",
        matchCount: 1,
      }));
  },

  async acp_load_session(args) {
    const { sessionId } = args as { sessionId: string };
    emit("acp:replay_complete", { sessionId });
  },

  async acp_export_session(args) {
    const { sessionId } = args as { sessionId: string };
    const data = lsGet(`session:${sessionId}`, {});
    return JSON.stringify(data);
  },

  async acp_import_session(args) {
    const { json } = args as { json: string };
    const data = JSON.parse(json);
    const id = `imported-${Date.now()}`;
    lsSet(`session:${id}`, data);
    return {
      sessionId: id,
      title: "Imported Session",
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
  },

  async acp_duplicate_session(args) {
    const { sessionId } = args as { sessionId: string };
    const newId = `dup-${Date.now()}`;
    const data = lsGet(`session:${sessionId}`, {});
    lsSet(`session:${newId}`, data);
    return {
      sessionId: newId,
      title: "Duplicated Session",
      updatedAt: new Date().toISOString(),
      messageCount: 0,
    };
  },

  async acp_cancel_session() {
    return true;
  },

  // ---- Personas ----
  async list_personas() {
    return lsGet("personas", []);
  },
  async create_persona(args) {
    const { request } = args as { request: Record<string, unknown> };
    const personas = lsGet<unknown[]>("personas", []);
    const p = { ...request, id: `persona-${Date.now()}` };
    personas.push(p);
    lsSet("personas", personas);
    return p;
  },
  async update_persona(args) {
    const { id, request } = args as {
      id: string;
      request: Record<string, unknown>;
    };
    const personas = lsGet<Array<Record<string, unknown>>>("personas", []);
    const idx = personas.findIndex((p) => p.id === id);
    if (idx >= 0) personas[idx] = { ...personas[idx], ...request };
    lsSet("personas", personas);
    return personas[idx];
  },
  async delete_persona(args) {
    const { id } = args as { id: string };
    const personas = lsGet<Array<Record<string, unknown>>>("personas", []);
    lsSet(
      "personas",
      personas.filter((p) => p.id !== id),
    );
  },
  async refresh_personas() {
    return lsGet("personas", []);
  },
  async export_persona(args) {
    const { id } = args as { id: string };
    const personas = lsGet<Array<Record<string, unknown>>>("personas", []);
    return personas.find((p) => p.id === id) ?? null;
  },
  async import_personas() {
    return [];
  },
  async save_persona_avatar() {
    return null;
  },
  async save_persona_avatar_bytes() {
    return null;
  },
  async get_avatars_dir() {
    return "/avatars";
  },

  // ---- System ----
  async get_home_dir() {
    return "/home";
  },
  async save_exported_session_file(args) {
    const { defaultFilename, contents } = args as {
      defaultFilename: string;
      contents: string;
    };
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultFilename;
    a.click();
    URL.revokeObjectURL(url);
    return defaultFilename;
  },
  async path_exists() {
    return false;
  },
  async list_files_for_mentions() {
    return [];
  },
  async list_directory_entries() {
    return [];
  },
  async inspect_attachment_paths() {
    return [];
  },
  async read_image_attachment() {
    return null;
  },

  // ---- Git (stubbed) ----
  async get_git_state() {
    return { branch: null, status: "not_available" };
  },
  async git_switch_branch() {},
  async git_stash() {},
  async git_init() {},
  async git_fetch() {},
  async git_pull() {},
  async git_create_branch() {},
  async get_changed_files() {
    return [];
  },
  async git_create_worktree() {},

  // ---- Doctor ----
  async run_doctor() {
    return { checks: [], overallStatus: "ok" };
  },
  async run_doctor_fix() {
    return { success: true };
  },

  // ---- Skills ----
  async list_skills() {
    return lsGet("skills", []);
  },
  async create_skill(args) {
    const skills = lsGet<unknown[]>("skills", []);
    skills.push(args);
    lsSet("skills", skills);
    return args;
  },
  async delete_skill(args) {
    const { name } = args as { name: string };
    const skills = lsGet<Array<Record<string, unknown>>>("skills", []);
    lsSet(
      "skills",
      skills.filter((s) => s.name !== name),
    );
  },
  async update_skill(args) {
    const { name } = args as { name: string };
    const skills = lsGet<Array<Record<string, unknown>>>("skills", []);
    const idx = skills.findIndex((s) => s.name === name);
    if (idx >= 0) skills[idx] = { ...skills[idx], ...args };
    lsSet("skills", skills);
    return skills[idx];
  },
  async export_skill(args) {
    const { name } = args as { name: string };
    const skills = lsGet<Array<Record<string, unknown>>>("skills", []);
    return skills.find((s) => s.name === name) ?? null;
  },
  async import_skills() {
    return [];
  },

  // ---- Projects ----
  async list_projects() {
    return lsGet("projects", []);
  },
  async create_project(args) {
    const projects = lsGet<unknown[]>("projects", []);
    const p = {
      ...args,
      id: `proj-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    projects.push(p);
    lsSet("projects", projects);
    return p;
  },
  async update_project(args) {
    const { id } = args as { id: string };
    const projects = lsGet<Array<Record<string, unknown>>>("projects", []);
    const idx = projects.findIndex((p) => p.id === id);
    if (idx >= 0) projects[idx] = { ...projects[idx], ...args };
    lsSet("projects", projects);
    return projects[idx];
  },
  async delete_project(args) {
    const { id } = args as { id: string };
    const projects = lsGet<Array<Record<string, unknown>>>("projects", []);
    lsSet(
      "projects",
      projects.filter((p) => p.id !== id),
    );
  },
  async get_project(args) {
    const { id } = args as { id: string };
    const projects = lsGet<Array<Record<string, unknown>>>("projects", []);
    return projects.find((p) => p.id === id) ?? null;
  },
  async list_archived_projects() {
    return [];
  },
  async archive_project() {},
  async restore_project() {},

  // ---- Provider config ----
  async get_provider_config(args) {
    const { providerId } = args as { providerId: string };
    return lsGet(`provider:${providerId}`, null);
  },
  async save_provider_field(args) {
    const { key, value } = args as { key: string; value: string };
    lsSet(`provider-field:${key}`, value);
  },
  async delete_provider_config(args) {
    const { providerId } = args as { providerId: string };
    localStorage.removeItem(`jada:provider:${providerId}`);
  },
  async check_all_provider_status() {
    return {};
  },
  async restart_app() {
    window.location.reload();
  },

  // ---- Agent setup ----
  async check_agent_installed() {
    return true;
  },
  async check_agent_auth() {
    return true;
  },
  async install_agent() {
    return true;
  },
  async authenticate_agent() {
    return true;
  },
  async authenticate_model_provider() {
    return true;
  },
};

export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const handler = handlers[cmd];
  if (!handler) {
    console.warn(`[web-shim] Unhandled invoke: ${cmd}`, args);
    return undefined as T;
  }
  return handler(args ?? {}) as Promise<T>;
}
