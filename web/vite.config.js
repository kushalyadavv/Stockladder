import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
  plugins: [react()],
  root: "web",
  envDir: "..",
  define: {
    "import.meta.env.VITE_SHOPIFY_CLIENT_ID": JSON.stringify(
      env.SHOPIFY_CLIENT_ID ?? env.VITE_SHOPIFY_CLIENT_ID ?? "",
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
};
});
