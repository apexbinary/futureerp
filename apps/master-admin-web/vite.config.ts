import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Ensure a single React instance across the app + @future-erp/ui-kit (pnpm workspace).
  resolve: { dedupe: ["react", "react-dom", "react-router-dom"] },
});
