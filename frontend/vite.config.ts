import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const backendUrl =
    env.VITE_BACKEND_URL || "http://backend:8000";

  // Parse allowed hosts
  const allowedHostsEnv = env.VITE_ALLOWED_HOSTS;
  const allowedHosts =
    allowedHostsEnv === "all"
      ? "all"
      : allowedHostsEnv
      ? allowedHostsEnv.split(",").map(h => h.trim())
      : "all"; // default = allow all

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: true,

      allowedHosts,

      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
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
