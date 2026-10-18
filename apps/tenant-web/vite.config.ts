import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  // Single React instance across app + @future-erp/ui-kit (pnpm workspace).
  resolve: { dedupe: ["react", "react-dom", "react-router-dom"] },
});
