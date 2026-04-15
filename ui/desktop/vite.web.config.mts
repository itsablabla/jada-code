import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// Web build config — strips Electron, builds as standalone SPA
export default defineConfig({
  root: resolve(__dirname),

  define: {
    'process.env.ALPHA': JSON.stringify(false),
    'process.env.GOOSE_TUNNEL': JSON.stringify(false),
    // Goosed API URL — overridable at build time
    '__GOOSED_URL__': JSON.stringify(process.env.GOOSED_URL || ''),
  },

  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      // Stub out the 'electron' module for renderer code that imports types from it
      'electron': resolve(__dirname, 'src/electron-stub.ts'),
    },
  },

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: resolve(__dirname, 'index.web.html'),
      // Exclude Electron-only packages from the bundle
      external: [
        'electron-log',
        'electron-updater',
        'electron-window-state',
        'electron-squirrel-startup',
        'electron-devtools-installer',
      ],
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3270',
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
    },
  },
});
