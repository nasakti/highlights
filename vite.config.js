import { defineConfig } from "vite";

export default defineConfig({
  base: "/highlights/",
  build: {
    outDir: "dist",
  },
  test: {
    environment: "node",
  },
});
