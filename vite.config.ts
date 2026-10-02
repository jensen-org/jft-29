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
        languages: "src/languages/index.ts",
      },
    },
    rollupOptions: { external: ["vue"] },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
