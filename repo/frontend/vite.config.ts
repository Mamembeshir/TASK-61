import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Allow the proxy target to be overridden via env var so the Docker frontend
// container can reach Django by its service name instead of localhost.
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",   // bind on all interfaces so Docker port mapping works
    port: 5173,
    proxy: {
      // Proxy API calls to Django
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
