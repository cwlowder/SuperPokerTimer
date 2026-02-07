import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Load env vars for the current mode
  const env = loadEnv(mode, process.cwd(), "");

  const backendUrl =
    env.VITE_BACKEND_URL || "http://backend:8000";

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          ws: false,
        },
        "/sounds": {
          target: backendUrl,
          changeOrigin: true,
        },
        "/ws": {
          target: backendUrl,
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
