# jft-29

**Jensen file tree 29.** A small, event driven file tree for the web, with a Vue 3 component on top of a
framework agnostic core. The name is a nod to TF-29 from Deus Ex.

jft-29 started inside the [Jensen](https://github.com/jensen-org) code editor, where the explorer had to stay
correct while agents, formatters and git rewrote files underneath it. It is now its own library, built so that
anyone can drop a fast, accessible tree next to CodeMirror, Monaco or any other editor.

## Why another file tree

Most tree components render a nested structure from data you already hold. A file tree is different: the data
lives on disk, changes without asking, and is far larger than what is on screen. jft-29 is built around that.

- **It listens, it does not poll.** You hand it a provider that can list a folder and emit change events. The
  tree coalesces bursts, applies them once per frame, and ignores folders you never opened.
- **Created files just appear.** A file written by a script, an agent or an atomic save shows up without a manual
  refresh. A rename that only reports one path is resolved against the real file system.
- **It follows your editor.** Open a file anywhere and the tree expands its parent folders and selects the row,
  like Always Select Opened File in JetBrains or `explorer.autoReveal` in VS Code, without stealing focus.
- **Writes are optimistic and honest.** Create, rename, move and delete update the tree at once, then roll back
  and report a typed error if the provider fails. Nothing fails silently.
- **No dependencies.** The core has no runtime dependencies and knows nothing about your editor, your file system
  or your UI kit. Vue is the only peer, and only the `/vue` entry needs it.
- **Dynamic, not bloated.** Icons, languages, decorations, menus, settings and the edit input all come from the
  parent through props, slots and plugins. Anything you do not use costs nothing.

## Features

| Area | What you get |
|---|---|
| Loading | Lazy folders, one read per folder, refreshes that keep expansion, selection and focus |
| Events | Provider `watch`, VS Code style coalescing, per frame batching, held back while you type a name |
| Following | `reveal(path)`, `followActivePath`, `followMonaco`, `followActive` on the component |
| Writes | Create, rename, move, delete with rollback, cancel support and typed errors |
| Structure | Compact folders, file nesting hook, sort, filter, selection with ranges |
| Icons | Any VS Code file icon theme manifest, resolved the way VS Code resolves it |
| Languages | Optional plugin that gives each file a language id from its name and extension |
| Accessibility | Roles, levels, set sizes, `aria-activedescendant`, full keyboard, reduced motion |
| Scale | A virtualized flat list, so thousands of rows stay smooth |
| Theming | CSS variables only, light and dark, no framework styles |

## Install

```sh
npm install @jensen-org/jft-29
```

`vue` 3.4 or newer is an optional peer dependency, needed only for `@jensen-org/jft-29/vue`.

| Entry | Contents |
|---|---|
| `@jensen-org/jft-29` | The core: `createTree`, the provider types, the icon resolver, a memory provider for tests |
| `@jensen-org/jft-29/vue` | The `FileTree` component |
| `@jensen-org/jft-29/editor` | `followActivePath` and `followMonaco`, with no editor import |
| `@jensen-org/jft-29/languages` | The optional language plugin |
| `@jensen-org/jft-29/style.css` | The stylesheet for the component |

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

Without Vue, use the core directly:

```ts
import { createTree } from "@jensen-org/jft-29";

const tree = createTree({ provider, root: "/project" });
tree.on("change", () => render(tree.rows()));
tree.on("error", (error) => report(error.code, error.path));
await tree.start();
await tree.reveal("/project/src/index.ts");
```

## The provider

The provider is the only thing that touches your file system. Paths are absolute and use `/`.

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

- A write the provider does not implement hides its UI and reports an `unsupported` error if called anyway.
- Throw `TreeCancel` from a write to roll back without an error, for example when the user declines a
  confirmation.
- Events are coalesced: a create followed by a delete cancels out, a delete followed by a create becomes a
  change, and deletes under a deleted folder are dropped. Events for folders that were never loaded are ignored.
- `watch` is subscribed before the first read, so no event is lost while the root loads.

## Following the editor

Pass `:active-path` and `follow-active` to the component, or use the helpers:

```ts
import { followActivePath, followMonaco } from "@jensen-org/jft-29/editor";

const stop = followActivePath(tree, (listener) => editorStore.subscribeActivePath(listener));
const stopMonaco = followMonaco(monacoEditor, tree);
```

`follow-active="focusNoScroll"` moves the selection without scrolling. A file opened from the tree itself is not
revealed a second time, and a path outside the root is ignored. The helpers describe an editor by its shape, so
there is no import of Monaco or CodeMirror. CodeMirror 6 has no notion of a document path, so give
`followActivePath` whatever path your app keeps for the open file.

## Icons

Pass any VS Code file icon theme manifest and a function that turns a definition id into a URL. The library never
injects markup and ships no icons.

```ts
import { generateManifest } from "material-icon-theme";

<FileTree :icon-theme="generateManifest()" :icon-url="(id) => `/icons/${id}.svg`" />
```

Resolution follows VS Code: file name, then the longest extension (`d.ts` before `ts`), then the language id, then
the default icon. Folders use their name and expansion state. A `light` block in the manifest applies with
`icon-variant="light"`. For full control, fill the `icon` slot.

## Languages

```ts
import { languagePlugin } from "@jensen-org/jft-29/languages";

createTree({ provider, root, plugins: [languagePlugin({ extensions: { foo: "foolang" } })] });
```

Files get a `languageId`, and the `open` event carries it, so an editor can pick a mode with no lookup of its
own. Nothing is loaded unless you import it.

## Component reference

**Props:** `tree`, `provider`, `root`, `iconTheme`, `iconUrl`, `iconVariant`, `decorations`, `filter`, `sort`,
`nest`, `plugins`, `compactFolders`, `multiSelect`, `followActive`, `activePath`, `actions`, `menu`, `rowHeight`,
`indent`, `label`.

**Events:** `open`, `select`, `contextmenu`, `error`, `dragstart`, `drop`, `created`, `renamed`, `moved`,
`removed`, `deleteRequest`, `changed`.

**Slots:** `toolbar`, `leading`, `icon`, `badge`, `row`, `edit-input`, `empty`, `error`.

**Exposed:** `tree`, `scrollToPath`, `focus`.

`decorations` is a `Map<path, { badge, tone, hint }>`, for git status, problems or anything else. A decorated file
puts a dot on every folder above it. The library sets no native `title` attributes, so you attach tooltips from
the `badge` slot. `contextmenu` hands you the event and the selected paths, and you render the menu. Deleting is a
request: confirm it, then call `tree.remove(path)`. The toolbar renders only when you pass `actions`, `menu` or a
`toolbar` slot, and there is no built in title.

Theme with CSS variables: `--jft-fg`, `--jft-fg-muted`, `--jft-hover`, `--jft-selected`, `--jft-focus`,
`--jft-border`, `--jft-font` and the `--jft-tone-*` set.

## Keyboard

| Key | Action |
|---|---|
| Up, Down, Home, End | Move focus, selection follows, Shift extends a range |
| Right, Left | Open or close a folder, step into or out of it |
| Enter, Space | Open a file, toggle a folder, toggle selection in multi select |
| F2 | Rename |
| Delete | Ask to delete |
| `*` | Open all sibling folders |
| Letters | Jump to the next name that starts with what you typed |

## Not included

Bundled icons, a git or problems source, a context menu, search, a gitignore parser, multi root workspaces and
variable row heights. They are inputs or events, so you stay in control.

## Develop

```sh
bun install
bun run dev      # playground with an in memory provider
bun run check    # typecheck, lint, test, build, dependency guard, package lint
```

`develop` is the working branch. Changes reach `main` by pull request, and a release is a `v*` tag on a commit that
is already on `main`. The release workflow refuses any other tag, runs the full check, and publishes to npm through
trusted publishing, with no token stored in the repository.

## License

MIT, see [LICENSE](LICENSE).
