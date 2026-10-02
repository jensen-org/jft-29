import { createApp, h } from "vue";
import { createMemoryProvider, type Tree } from "../src/index.js";
import { languagePlugin } from "../src/languages/index.js";
import { FileTree } from "../src/vue/index.js";

const provider = createMemoryProvider(
  ["/p/src/a.ts", "/p/src/deep/er/b.ts", "/p/README.md", "/p/docs/guide.md", "/p/package.json"],
  "/p",
);
const log = document.getElementById("log") as HTMLElement;
let tree: Tree | null = null;

function write(line: string): void {
  log.textContent = `${line}\n${log.textContent ?? ""}`;
}

createApp({
  render: () =>
    h(FileTree, {
      provider,
      root: "/p",
      plugins: [languagePlugin()],
      compactFolders: true,
      multiSelect: true,
      actions: [
        { id: "file", label: "New file", run: () => void tree?.startCreate("/p", "file") },
        { id: "collapse", label: "Collapse all", run: () => tree?.collapseAll() },
      ],
      onOpen: (event: unknown) => write(`open ${JSON.stringify(event)}`),
      onError: (error: Error) => write(`error ${error.message}`),
      onDeleteRequest: ({ paths }: { paths: string[] }) => {
        for (const path of paths) void tree?.remove(path);
      },
      ref: (instance: unknown) => {
        tree = (instance as { tree: Tree | null } | null)?.tree ?? tree;
      },
    }),
}).mount("#tree");

document.getElementById("burst")?.addEventListener("click", () => {
  const batch = Array.from({ length: 1000 }, (_, i) => `/p/burst-${i}.txt`);
  for (const path of batch) provider.add(path);
  provider.emit(batch.map((path) => ({ type: "add" as const, path, kind: "file" as const })));
});
document.getElementById("atomic")?.addEventListener("click", () => {
  const name = `/p/atomic-${Date.now()}.ts`;
  provider.add(name);
  provider.emit([
    { type: "add", path: "/p/.tmp", kind: "file" },
    { type: "rename", from: "/p/.tmp", to: name, kind: "file" },
  ]);
});
document.getElementById("reveal")?.addEventListener("click", () => {
  void tree?.reveal("/p/src/deep/er/b.ts", { scroll: "center" });
});
