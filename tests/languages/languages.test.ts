import { describe, expect, it } from "vitest";
import { createMemoryProvider } from "../../src/core/memory";
import { createTree } from "../../src/core/model";
import { detectLanguage, languagePlugin } from "../../src/languages";

describe("language detection", () => {
  it("matches exact file names before extensions", () => {
    expect(detectLanguage("Dockerfile")).toBe("dockerfile");
    expect(detectLanguage("tsconfig.json")).toBe("jsonc");
    expect(detectLanguage("data.json")).toBe("json");
  });

  it("prefers the longest multi dot extension and ignores case", () => {
    expect(detectLanguage("types.d.ts")).toBe("typescript");
    expect(detectLanguage("App.TSX")).toBe("typescriptreact");
    expect(detectLanguage("a.b.c.rs")).toBe("rust");
  });

  it("lets the host extend and override the table", () => {
    expect(detectLanguage("a.foo", { extensions: { foo: "foolang" } })).toBe("foolang");
    expect(detectLanguage("a.ts", { extensions: { ts: "mine" } })).toBe("mine");
    expect(detectLanguage("BUILD", { fileNames: { build: "starlark" } })).toBe("starlark");
  });

  it("keeps resolving the languages the hand written table covered", () => {
    const expected: Record<string, string> = {
      "a.ts": "typescript",
      "a.mts": "typescript",
      "a.tsx": "typescriptreact",
      "a.js": "javascript",
      "a.mjs": "javascript",
      "a.jsx": "javascriptreact",
      "a.json": "json",
      "a.jsonc": "jsonc",
      "a.md": "markdown",
      "a.mdx": "mdx",
      "a.html": "html",
      "a.css": "css",
      "a.scss": "scss",
      "a.less": "less",
      "a.vue": "vue",
      "a.svelte": "svelte",
      "a.rs": "rust",
      "a.go": "go",
      "a.py": "python",
      "a.rb": "ruby",
      "a.java": "java",
      "a.kt": "kotlin",
      "a.swift": "swift",
      "a.c": "c",
      "a.h": "c",
      "a.cpp": "cpp",
      "a.cs": "csharp",
      "a.php": "php",
      "a.sh": "shellscript",
      "a.zsh": "shellscript",
      "a.ps1": "powershell",
      "a.yml": "yaml",
      "a.yaml": "yaml",
      "a.toml": "toml",
      "a.xml": "xml",
      "a.svg": "xml",
      "a.sql": "sql",
      "a.lua": "lua",
      "a.dart": "dart",
      "a.ex": "elixir",
      "a.hs": "haskell",
      "a.graphql": "graphql",
      "a.proto": "proto3",
      "a.tf": "terraform",
      "a.zig": "zig",
      "a.nix": "nix",
      "a.vim": "vim",
      "a.ini": "ini",
      "a.txt": "plaintext",
      "a.csv": "csv",
      "a.diff": "diff",
      Dockerfile: "dockerfile",
      Makefile: "makefile",
      GNUmakefile: "makefile",
      "CMakeLists.txt": "cmake",
      ".gitignore": "ignore",
      ".dockerignore": "ignore",
      ".env": "dotenv",
      ".bashrc": "shellscript",
      ".zshrc": "shellscript",
      "go.mod": "go.mod",
    };
    for (const [name, language] of Object.entries(expected)) {
      expect(detectLanguage(name), name).toBe(language);
    }
  });

  it("does not read inherited object keys as languages", () => {
    expect(detectLanguage("constructor")).toBeUndefined();
    expect(detectLanguage("a.constructor")).toBeUndefined();
    expect(detectLanguage("__proto__")).toBeUndefined();
  });

  it("returns nothing for an unknown file", () => {
    expect(detectLanguage("mystery.zzz")).toBeUndefined();
  });
});

describe("language plugin", () => {
  it("sets the language on files only, and only when installed", async () => {
    const files = ["/p/a.rs", "/p/src/"];
    const withPlugin = createTree({
      provider: createMemoryProvider(files, "/p"),
      root: "/p",
      plugins: [languagePlugin()],
    });
    await withPlugin.start();
    expect(withPlugin.get("/p/a.rs")?.languageId).toBe("rust");
    expect(withPlugin.get("/p/src")?.languageId).toBeUndefined();

    const plain = createTree({ provider: createMemoryProvider(files, "/p"), root: "/p" });
    await plain.start();
    expect(plain.get("/p/a.rs")?.languageId).toBeUndefined();
  });
});
