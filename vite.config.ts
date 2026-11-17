import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      input: { app: "index.html", render: "render.html" },
    },
    target: "es2022",
    chunkSizeWarningLimit: 1100,
  },
});
