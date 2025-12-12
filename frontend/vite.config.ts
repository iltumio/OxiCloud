import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8086",
        changeOrigin: true,
        secure: false,
      },
      "/auth": {
        target: "http://localhost:8086",
        changeOrigin: true,
        secure: false,
      },
      "/files": {
        target: "http://localhost:8086",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
