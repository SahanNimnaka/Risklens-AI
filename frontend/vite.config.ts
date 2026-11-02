import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiTarget = env.API_PROXY_TARGET || "http://127.0.0.1:8000";

  // The browser only ever calls VITE_API_BASE_URL (/api by default). Vite
  // forwards that prefix to the FastAPI backend, which avoids a backend CORS
  // change for local development.
  const proxy = {
    "/api": {
      target: apiTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/api/, ""),
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      port: 4173,
      proxy,
    },
  };
});
