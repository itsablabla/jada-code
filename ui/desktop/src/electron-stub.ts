/**
 * Stub for the 'electron' module in web builds.
 * Only type-level imports are used in renderer code.
 */

export interface IpcRendererEvent {
  preventDefault: () => void;
  sender: unknown;
  senderId: number;
}

export const contextBridge = {
  exposeInMainWorld: () => {},
};

export const ipcRenderer = {
  on: () => {},
  off: () => {},
  send: () => {},
  invoke: async () => null,
  emit: () => {},
  sendSync: () => null,
  removeListener: () => {},
};

export const webUtils = {
  getPathForFile: () => '',
};
