import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = process.env.VTT_BACKEND ?? 'http://localhost:3001';

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(here, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', 'localhost'],
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/assets': { target: backend, changeOrigin: true },
      '/socket.io': { target: backend, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(here, '../dist/client'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/pixi.js') || id.includes('node_modules/@pixi')) return 'pixi';
          if (id.includes('node_modules/three') || id.includes('node_modules/cannon-es')) return 'dice3d';
          if (id.includes('shared/src/data5e/monsters') || id.includes('shared/src/data5e/spells') || id.includes('shared/src/data5e/items')) return 'compendium';
          return undefined;
        },
      },
    },
  },
});
