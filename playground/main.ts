import { createApp, h, ref, shallowRef } from "vue";
import { materialIcons } from "../src/icons/material.js";
import { symbolsIcons } from "../src/icons/symbols.js";
import { createMemoryProvider, type Tree, type TreeProvider } from "../src/index.js";
import { languagePlugin } from "../src/languages/index.js";
import { FileTree } from "../src/vue/index.js";
import { openDirectory } from "./directory-provider.js";

type Source = { provider: TreeProvider; root: string };

const memory = createMemoryProvider(
  ["/p/src/a.ts", "/p/src/deep/er/b.ts", "/p/README.md", "/p/docs/guide.md", "/p/package.json"],
  "/p",
);
const log = document.getElementById("log") as HTMLElement;
const source = shallowRef<Source>({ provider: memory, root: "/p" });
const variant = ref<"dark" | "light">(
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
);
const packs = {
  symbols: symbolsIcons("/icons/symbols"),
  material: materialIcons("/icons/material"),
};
const pack = ref<keyof typeof packs>("symbols");
let tree: Tree | null = null;

function write(line: string): void {
  log.textContent = `${line}\n${log.textContent ?? ""}`;
}

createApp({
  render: () =>
    h(FileTree, {
      key: source.value.root,
      provider: source.value.provider,
      root: source.value.root,
      plugins: [languagePlugin()],
      iconTheme: packs[pack.value].iconTheme,
      iconUrl: packs[pack.value].iconUrl,
      iconVariant: variant.value,
      compactFolders: true,
      multiSelect: true,
      actions: [{ id: "collapse", label: "Collapse all", run: () => tree?.collapseAll() }],
      onOpen: (event: unknown) => write(`open ${JSON.stringify(event)}`),
      onError: (error: Error) => write(`error ${error.message}`),
      ref: (instance: unknown) => {
        tree = (instance as { tree: Tree | null } | null)?.tree ?? tree;
      },
    }),
}).mount("#tree");

const folderButton = document.getElementById("folder") as HTMLButtonElement;
if (!("showDirectoryPicker" in window)) {
  folderButton.disabled = true;
  write("Open folder needs showDirectoryPicker, use Chrome, Edge or Arc");
}
folderButton.addEventListener("click", () => {
  const picker = (
    window as unknown as { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker;
  picker.call(window).then(
    (handle) => {
      source.value = openDirectory(handle);
      write(`opened ${handle.name}`);
    },
    (error: Error) => write(`error ${error.message}`),
  );
});
document.getElementById("pack")?.addEventListener("click", () => {
  pack.value = pack.value === "symbols" ? "material" : "symbols";
  write(`icons ${pack.value}`);
});
document.getElementById("theme")?.addEventListener("click", () => {
  variant.value = variant.value === "dark" ? "light" : "dark";
  document.documentElement.style.colorScheme = variant.value;
});
document.getElementById("burst")?.addEventListener("click", () => {
  const batch = Array.from({ length: 1000 }, (_, i) => `/p/burst-${i}.txt`);
  for (const path of batch) memory.add(path);
  memory.emit(batch.map((path) => ({ type: "add" as const, path, kind: "file" as const })));
});
document.getElementById("atomic")?.addEventListener("click", () => {
  const name = `/p/atomic-${Date.now()}.ts`;
  memory.add(name);
  memory.emit([
    { type: "add", path: "/p/.tmp", kind: "file" },
    { type: "rename", from: "/p/.tmp", to: name, kind: "file" },
  ]);
});
document.getElementById("reveal")?.addEventListener("click", () => {
  void tree?.reveal("/p/src/deep/er/b.ts", { scroll: "center" });
});
