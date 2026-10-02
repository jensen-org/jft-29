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
