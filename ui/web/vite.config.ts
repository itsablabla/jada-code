import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/acp": {
        target: process.env.VITE_ACP_URL || "http://127.0.0.1:3284",
        changeOrigin: true,
      },
      "/status": {
        target: process.env.VITE_ACP_URL || "http://127.0.0.1:3284",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.VITE_ACP_URL || "http://127.0.0.1:3284",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
