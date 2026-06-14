import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("@dynamic-labs") ||
            id.includes("@walletconnect") ||
            id.includes("@reown") ||
            id.includes("@turnkey")
          ) {
            return "wallet-vendor";
          }

          if (id.includes("node_modules/react")) {
            return "react-vendor";
          }
        },
      },
    },
  },
  define: {
    "process.env": {},
    global: "globalThis",
  },
  server: {
    port: 5173,
  },
});
