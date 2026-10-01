import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3410,
    strictPort: true,
    // Aceita conexões de fora: dá para desenvolver de outro PC pelo Tailscale.
    host: true,
    // Em desenvolvimento a API roda na 3401 (ver apps/api/src/server.ts).
    proxy: { "/api": "http://127.0.0.1:3401" },
  },
});
