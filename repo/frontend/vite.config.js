var _a, _b;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// Allow the proxy target to be overridden via env var so the Docker frontend
// container can reach Django by its service name instead of localhost.
var apiTarget = (_a = process.env.VITE_API_TARGET) !== null && _a !== void 0 ? _a : "http://localhost:8000";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        host: "0.0.0.0", // bind on all interfaces so Docker port mapping works
        port: parseInt((_b = process.env.PORT) !== null && _b !== void 0 ? _b : "5173", 10),
        proxy: {
            // Proxy API calls to Django
            "/api": {
                target: apiTarget,
                changeOrigin: true,
            },
        },
    },
});
