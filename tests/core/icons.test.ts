import { describe, expect, it } from "vitest";
import { createIconResolver, type IconThemeManifest } from "../../src/core/icons";

const manifest: IconThemeManifest = {
  file: "file",
  folder: "folder",
  folderExpanded: "folder-open",
  rootFolder: "root",
  fileNames: { "package.json": "npm", dockerfile: "docker" },
  fileExtensions: { ts: "typescript", "d.ts": "typescript-def", "test.ts": "test" },
  folderNames: { src: "folder-src" },
  folderNamesExpanded: { src: "folder-src-open" },
  languageIds: { rust: "rust" },
  light: { file: "file-light", fileExtensions: { ts: "typescript-light" } },
};

describe("icon resolver", () => {
  const icons = createIconResolver(manifest);

  it("prefers a file name over an extension", () => {
    expect(icons.resolve({ name: "package.json", kind: "file" })).toBe("npm");
    expect(icons.resolve({ name: "Dockerfile", kind: "file" })).toBe("docker");
  });

  it("tries the longest extension first, ignoring case", () => {
    expect(icons.resolve({ name: "types.D.TS", kind: "file" })).toBe("typescript-def");
    expect(icons.resolve({ name: "a.test.ts", kind: "file" })).toBe("test");
    expect(icons.resolve({ name: "a.ts", kind: "file" })).toBe("typescript");
  });

  it("falls back to the language, then the default file icon", () => {
    expect(icons.resolve({ name: "main.unknown", kind: "file", languageId: "rust" })).toBe("rust");
    expect(icons.resolve({ name: "notes.zzz", kind: "file" })).toBe("file");
  });

  it("resolves folders by name, expansion and root", () => {
    expect(icons.resolve({ name: "src", kind: "dir" })).toBe("folder-src");
    expect(icons.resolve({ name: "src", kind: "dir", expanded: true })).toBe("folder-src-open");
    expect(icons.resolve({ name: "lib", kind: "dir", expanded: true })).toBe("folder-open");
    expect(icons.resolve({ name: "x", kind: "dir", isRoot: true })).toBe("root");
  });

  it("applies the light variant over the base theme", () => {
    const light = createIconResolver(manifest, "light");
    expect(light.resolve({ name: "a.ts", kind: "file" })).toBe("typescript-light");
    expect(light.resolve({ name: "a.zzz", kind: "file" })).toBe("file-light");
  });

  it("does not read inherited object keys as names", () => {
    expect(icons.resolve({ name: "constructor", kind: "file" })).toBe("file");
  });
});
