/**
 * Shim for @tauri-apps/plugin-opener — uses browser window.open / links.
 */

export async function openUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function openPath(path: string): Promise<void> {
  console.log("[web-shim] openPath not available in browser:", path);
}

export async function revealItemInDir(path: string): Promise<void> {
  console.log("[web-shim] revealItemInDir not available in browser:", path);
}
