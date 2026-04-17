import { defineConfig } from "vitest/config";
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
    port: parseInt(process.env.PORT ?? "5173", 10),
    allowedHosts: true,  // allow any host (needed for Docker service-name access in E2E)
    proxy: {
      // Proxy API calls to Django
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
  },
});
