# jft-29

A small, event driven file tree. The core has no runtime dependencies and knows nothing about your
editor, your file system or your UI toolkit. A Vue 3 component sits on top of it.

- Lazy loading with one read per folder, and refreshes that keep expansion, selection and focus.
- A provider interface with batched watcher events, coalesced the way VS Code does it.
- Optimistic create, rename, move and delete that roll back and report a typed error on failure.
- `reveal(path)` expands the ancestors of a file, so the tree can follow the file open in your editor.
- Icon packs through any VS Code icon theme manifest, and an optional language plugin.
- A virtualized, accessible tree: roles, levels, set sizes, `aria-activedescendant`, full keyboard.
- Settings, actions, menus and icons come from the parent through props and slots.

```sh
bun add @jensen-org/jft-29
```

`vue` (3.4 or newer) is the only peer dependency, and only the `/vue` entry needs it.

## Quick start

```vue
<script setup lang="ts">
import { FileTree } from "@jensen-org/jft-29/vue";
import "@jensen-org/jft-29/style.css";
import { languagePlugin } from "@jensen-org/jft-29/languages";

const provider = {
  readDir: (path) => api.list(path),
  watch: (emit) => api.onChange((events) => emit(events)),
  create: (parent, name, kind) => api.create(parent, name, kind),
  rename: (from, to) => api.rename(from, to),
  remove: (path) => api.remove(path),
};
</script>

<template>
  <FileTree
    :provider="provider"
    root="/project"
    :plugins="[languagePlugin()]"
    :active-path="activeFile"
    follow-active
    @open="({ path }) => editor.open(path)"
  />
</template>
```

## The provider

```ts
interface TreeProvider {
  readDir(path: string): Promise<{ name: string; kind: "file" | "dir" }[]>;
  watch?(emit: (batch: FsEvent[]) => void): { dispose(): void };
  create?(parent: string, name: string, kind: "file" | "dir"): Promise<void>;
  rename?(from: string, to: string): Promise<void>;
  move?(from: string, toDir: string): Promise<void>;
  remove?(path: string): Promise<void>;
}

type FsEvent =
  | { type: "add"; path: string; kind: "file" | "dir" }
  | { type: "change"; path: string }
  | { type: "delete"; path: string }
  | { type: "rename"; from: string; to: string; kind?: "file" | "dir" }
  | { type: "rescan"; path: string };
```

Paths are absolute and use `/`. A write that the provider does not implement hides its UI and reports
an `unsupported` error if it is called anyway. Throw `TreeCancel` from a write to roll back without
an error, for example when the user declines a confirmation.

Events are coalesced (a create followed by a delete cancels out, a delete followed by a create becomes
a change, deletes under a deleted folder are dropped) and applied once per frame. Events for folders
that were never loaded are ignored. While an inline edit box is open, events are held back.

## Following the editor

```ts
import { followActivePath } from "@jensen-org/jft-29/editor";

const stop = followActivePath(tree, (listener) => editorStore.subscribeActivePath(listener));
```

Or pass `:active-path` and `follow-active` to the component. `follow-active="focusNoScroll"` moves the
selection without scrolling. A file opened from the tree itself is not revealed again.

Monaco works through its structure alone, with no import of Monaco:

```ts
import { followMonaco } from "@jensen-org/jft-29/editor";
const stop = followMonaco(monacoEditor, tree);
```

CodeMirror 6 has no notion of a document path, so give `followActivePath` whatever path your app keeps
for the open file.

## Icons

Pass any VS Code file icon theme manifest and a function that turns a definition id into a URL. The
library never injects markup and ships no icons.

```ts
import { generateManifest } from "material-icon-theme";

<FileTree :icon-theme="generateManifest()" :icon-url="(id) => `/icons/${id}.svg`" />
```

Resolution order follows VS Code: file name, then the longest extension (`d.ts` before `ts`), then the
language id, then the default icon. Folders use their name and expansion state. A `light` block in the
manifest is applied with `icon-variant="light"`.

## Language plugin

```ts
import { languagePlugin } from "@jensen-org/jft-29/languages";
createTree({ provider, root, plugins: [languagePlugin({ extensions: { foo: "foolang" } })] });
```

Files get a `languageId` and the `open` event carries it. Nothing is loaded unless you import it.

## Component reference

Props: `tree`, `provider`, `root`, `iconTheme`, `iconUrl`, `iconVariant`, `decorations`, `filter`,
`sort`, `nest`, `plugins`, `compactFolders`, `multiSelect`, `followActive`, `activePath`, `actions`,
`menu`, `rowHeight`, `indent`, `label`.

Events: `open`, `select`, `contextmenu`, `error`, `dragstart`, `drop`, `created`, `renamed`, `moved`,
`removed`, `deleteRequest`, `changed`.

Slots: `toolbar`, `row`, `icon`, `badge`, `edit-input`, `empty`, `error`.

`decorations` is a `Map<path, { badge, tone, hint }>`. A decorated file puts a dot on every folder above
it. The library sets no native `title` attributes, so you can attach your own tooltips from the `badge`
slot. `contextmenu` hands you the event and the selected paths. Deleting is a request: confirm it, then
call `tree.remove(path)`.

Theme with CSS variables: `--jft-fg`, `--jft-fg-muted`, `--jft-hover`, `--jft-selected`, `--jft-focus`,
`--jft-border`, `--jft-font` and the `--jft-tone-*` set.

## Keyboard

Arrows move, Right and Left open and close or step in and out, Home and End jump, Enter opens, F2
renames, Delete asks to delete, `*` opens siblings, and typing jumps to a name.

## Not included

Bundled icons, a git or problems source, a context menu, search, a gitignore parser, multi root
workspaces and variable row heights. They are inputs or events instead.

## Develop

```sh
bun install
bun run dev      # playground
bun run check    # typecheck, lint, test, build, dependency guard, package lint
```
