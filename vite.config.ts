import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [react(), nodePolyfills({ include: ["buffer", "crypto", "stream", "util"], globals: { Buffer: true } })],
  build: { chunkSizeWarningLimit: 4000 },
  server: {
    // `vercel dev` serves /api locally; with plain `vite`, point this at a deployed copy.
    proxy: process.env.API_PROXY ? { "/api": { target: process.env.API_PROXY, changeOrigin: true } } : undefined,
  },
});
