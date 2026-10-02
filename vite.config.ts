import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  build: {
    target: "es2022",
    cssCodeSplit: false,
    lib: {
      formats: ["es"],
      cssFileName: "style",
      entry: {
        index: "src/index.ts",
        vue: "src/vue/index.ts",
        editor: "src/editor/index.ts",
        git: "src/git/index.ts",
        languages: "src/languages/index.ts",
        "icons/material": "src/icons/material.ts",
        "icons/symbols": "src/icons/symbols.ts",
      },
    },
    rollupOptions: { external: ["vue"] },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
