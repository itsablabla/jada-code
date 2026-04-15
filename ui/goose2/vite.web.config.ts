import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tauri-apps/api/core": path.resolve(__dirname, "src/web-shims/tauri-core.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "src/web-shims/tauri-event.ts"),
      "@tauri-apps/api/window": path.resolve(__dirname, "src/web-shims/tauri-event.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "src/web-shims/tauri-plugin-dialog.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "src/web-shims/tauri-plugin-opener.ts"),
    },
  },
  define: {
    "window.__TAURI_INTERNALS__": "undefined",
  },
  server: {
    port: 1520,
    host: true,
    proxy: {
      "/acp": {
        target: "http://127.0.0.1:3284",
        changeOrigin: true,
        ws: true,
      },
      "/status": {
        target: "http://127.0.0.1:3284",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3284",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
