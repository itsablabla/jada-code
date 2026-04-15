/**
 * Web shim for window.electron and window.appConfig
 *
 * Replaces Electron IPC with web-compatible alternatives:
 * - Settings → localStorage
 * - File operations → no-op stubs
 * - Native dialogs → browser equivalents
 * - goosed connection → direct HTTP to same origin /api
 */

import { defaultSettings, type Settings, type SettingKey } from './utils/settings';

// ── Helpers ──────────────────────────────────────────────────────────

const SETTINGS_PREFIX = 'jada_setting_';

function loadSetting<K extends SettingKey>(key: K): Settings[K] {
  try {
    const raw = localStorage.getItem(`${SETTINGS_PREFIX}${key}`);
    if (raw !== null) return JSON.parse(raw) as Settings[K];
  } catch {
    // ignore parse errors
  }
  return defaultSettings[key];
}

function saveSetting<K extends SettingKey>(key: K, value: Settings[K]): void {
  localStorage.setItem(`${SETTINGS_PREFIX}${key}`, JSON.stringify(value));
}

// Simple event emitter for electron.on / electron.off / electron.emit
type Listener = (...args: unknown[]) => void;
const listeners = new Map<string, Set<Listener>>();

function on(channel: string, callback: Listener): void {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(callback);
}

function off(channel: string, callback: Listener): void {
  listeners.get(channel)?.delete(callback);
}

function emit(channel: string, ...args: unknown[]): void {
  listeners.get(channel)?.forEach((fn) => {
    try {
      fn({} as any, ...args); // first arg is IpcRendererEvent stub
    } catch (e) {
      console.error(`[web-shim] Error in listener for ${channel}:`, e);
    }
  });
}

// Determine goosed API base URL.
// In production the nginx reverse-proxy maps /api/* → goosed,
// so we use window.location.origin + '/api'.
// For local dev you can override with VITE_GOOSED_URL env var.
function getGoosedBaseUrl(): string {
  // @ts-expect-error injected by Vite define
  if (typeof __GOOSED_URL__ === 'string' && __GOOSED_URL__) return __GOOSED_URL__;
  return `${window.location.origin}/api`;
}

// Generate a random hex secret (goosed expects X-Secret-Key header).
// We generate once per browser session and persist in sessionStorage.
function getOrCreateSecretKey(): string {
  let key = sessionStorage.getItem('goosed_secret_key');
  if (!key) {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    key = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem('goosed_secret_key', key);
  }
  return key;
}

// ── window.electron shim ─────────────────────────────────────────────

const electronShim = {
  platform: 'linux' as string,
  arch: 'x86_64' as string,

  // Called by renderer.tsx — no-op in web
  reactReady: () => {},

  getConfig: () => ({}),

  // Navigation / window management — no-ops or browser equivalents
  hideWindow: () => {},
  createChatWindow: (options?: Record<string, unknown>) => {
    // Open a new tab with the same origin
    const params = new URLSearchParams();
    if (options?.resumeSessionId) params.set('resumeSessionId', String(options.resumeSessionId));
    if (options?.recipeId) params.set('recipeId', String(options.recipeId));
    const qs = params.toString();
    window.open(`${window.location.origin}${qs ? `?${qs}` : ''}`, '_blank');
  },
  closeWindow: () => window.close(),
  reloadApp: () => window.location.reload(),

  // Logging
  logInfo: (txt: string) => console.log('[goose]', txt),

  // Notifications
  showNotification: (data: { title: string; body: string }) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(data.title, { body: data.body });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
      Notification.requestPermission().then((p) => {
        if (p === 'granted') new Notification(data.title, { body: data.body });
      });
    }
  },

  // Dialogs
  showMessageBox: async (options: {
    type?: string;
    buttons?: string[];
    defaultId?: number;
    title?: string;
    message: string;
    detail?: string;
  }): Promise<{ response: number; checkboxChecked?: boolean }> => {
    const result = window.confirm(`${options.message}${options.detail ? `\n\n${options.detail}` : ''}`);
    return { response: result ? 0 : 1 };
  },

  showSaveDialog: async (_options: Record<string, unknown>): Promise<{ canceled: boolean; filePath?: string }> => {
    // Web can't do native save dialogs — return canceled
    return { canceled: true };
  },

  // Directory / file operations
  directoryChooser: async () => ({ canceled: true, filePaths: [] }),
  selectFileOrDirectory: async (_defaultPath?: string): Promise<string | null> => null,
  readFile: async (_filePath: string) => ({ file: '', filePath: '', error: 'Not available in web', found: false }),
  writeFile: async (_filePath: string, _content: string) => false,
  ensureDirectory: async (_dirPath: string) => false,
  listFiles: async (_dirPath: string, _extension?: string) => [] as string[],
  getPathForFile: (_file: File) => '',
  openDirectoryInExplorer: async (_directoryPath: string) => false,
  addRecentDir: async (_dir: string) => true,

  // External links
  openExternal: async (url: string) => { window.open(url, '_blank', 'noopener'); },
  openInChrome: (url: string) => { window.open(url, '_blank', 'noopener'); },

  // Metadata fetch (proxy through goosed or direct)
  fetchMetadata: async (url: string) => {
    try {
      const resp = await fetch(url, { mode: 'no-cors' });
      return await resp.text();
    } catch {
      return '';
    }
  },

  // Binary / Ollama / Mesh
  getBinaryPath: async (_binaryName: string) => '',
  checkForOllama: async () => false,
  checkMesh: async () => ({
    running: false,
    installed: false,
    models: [] as string[],
  }),
  startMesh: async (_args: string[]) => ({ started: false, error: 'Not available in web' }),
  stopMesh: async () => ({ stopped: false }),

  // Allowed extensions
  getAllowedExtensions: async () => [] as string[],

  // Menu bar / dock / wakelock / spellcheck — desktop-only, stub
  setMenuBarIcon: async (_show: boolean) => false,
  getMenuBarIconState: async () => false,
  setDockIcon: async (_show: boolean) => false,
  getDockIconState: async () => false,
  setWakelock: async (_enable: boolean) => false,
  getWakelockState: async () => false,
  setSpellcheck: async (_enable: boolean) => false,
  getSpellcheckState: async () => true,
  openNotificationsSettings: async () => false,

  // Settings — backed by localStorage
  getSetting: async <K extends SettingKey>(key: K): Promise<Settings[K]> => loadSetting(key),
  setSetting: async <K extends SettingKey>(key: K, value: Settings[K]): Promise<void> => {
    saveSetting(key, value);
  },

  // Secret key and goosed host
  getSecretKey: async () => getOrCreateSecretKey(),
  getGoosedHostPort: async () => getGoosedBaseUrl(),

  // Mouse back button — no-op
  onMouseBackButtonClicked: (_callback: () => void) => {},
  offMouseBackButtonClicked: (_callback: () => void) => {},

  // Event bus
  on,
  off,
  emit,

  // Theme broadcast — just emit locally
  broadcastThemeChange: (themeData: Record<string, unknown>) => {
    emit('theme-changed', themeData);
  },

  // Updater — not applicable in web
  getVersion: () => '1.31.0-web',
  checkForUpdates: async () => ({ updateInfo: null, error: null }),
  downloadUpdate: async () => ({ success: false, error: 'Not available in web' }),
  installUpdate: () => {},
  restartApp: () => window.location.reload(),
  onUpdaterEvent: (_callback: (event: { event: string; data?: unknown }) => void) => {},
  getUpdateState: async () => null,
  isUsingGitHubFallback: async () => false,

  // Recipe warnings
  hasAcceptedRecipeBefore: async (_recipe: unknown) => true,
  recordRecipeHash: async (_recipe: unknown) => true,

  // Apps
  launchApp: async (_app: unknown) => {},
  refreshApp: async (_app: unknown) => {},
  closeApp: async (_appName: string) => {},
};

// ── window.appConfig shim ────────────────────────────────────────────

const appConfigShim = {
  get: (key: string): unknown => {
    const configDefaults: Record<string, unknown> = {
      GOOSE_VERSION: '1.31.0-web',
    };
    return configDefaults[key] ?? null;
  },
  getAll: () => ({
    GOOSE_VERSION: '1.31.0-web',
  }),
};

// ── Install shims ────────────────────────────────────────────────────

export function installWebShims(): void {
  if (typeof window !== 'undefined') {
    // Only install if not already present (i.e. not running in Electron)
    if (!window.electron) {
      (window as any).electron = electronShim;
    }
    if (!window.appConfig) {
      (window as any).appConfig = appConfigShim;
    }
  }
}
