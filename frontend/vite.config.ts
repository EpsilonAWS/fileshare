import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    // Inline (empty) PostCSS config stops Vite from picking up the Next.js
    // postcss.config.mjs in the repo root. Tailwind v4 runs via its Vite plugin.
    css: { postcss: {} },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@shared": path.resolve(__dirname, "../shared"),
      },
    },
    server: {
      port: 5173,
      // Allow importing ../shared/types.ts from outside the frontend folder.
      fs: { allow: [".."] },
      // When mocks are off, /api/* goes to the backend dev server.
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});
