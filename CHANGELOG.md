# Changelog

## 0.4.0

Visual changes, a read only mode and large tree performance.

- Rows are quieter. The indent is 8 px a level (was 16), folders draw no icon unless `folderIcons` is set, and the inherited status dot is gone: a folder is tinted by the strongest tone below it, from git or from `decorations` with a `tone`.
- The status letter sits in one fixed column at the right edge (`--jft-status-width`), and the `row` slot is laid out just left of it, so host columns align.
- `rowActions` draws plain icon buttons that are hidden at rest. On hover the status slides left to make room for them (`--jft-actions-width`, `--jft-slide`).
- `readOnly`, on the component, `createTree` and `tree.configure`, refuses create, rename, move and delete, ignores F2 and Delete, stops dragging and dropping, and hides row actions. `tree.isReadOnly()` reads it back.
- New `error` tone and `--jft-tone-error`. A decoration with the `error` tone beats git tones on the folders above it.
- Performance on a folder of 100,000 files: loading is about ten times faster, a burst of 1,000 adds went from minutes to tens of milliseconds, and moving focus or selection no longer rebuilds the rows. Sorting uses one shared `Intl.Collator`, new entries are placed by binary search, and `rowIndex` is a map lookup.
- `readDirPage` on a provider loads a big folder in pages. The first page shows at once, later pages are placed as they arrive and a stale entry is dropped when the last page lands.
- Fixes: a rescan that arrives while a read is running now triggers one more read, a watched delete that removes a selected path emits `select`, a rename into a folder that is not loaded keeps the node and reports an error instead of dropping it, and `*` expands only the siblings of the focused row.

## 0.3.0

- Trailing slashes are trimmed with a loop instead of a regular expression that backtracked quadratically on long runs of `/`.
- Git support. `tree.setGit` and `attachGit` from `@jensen-org/jft-29/git` take statuses from the host. Rows carry `status`, `staged`, `inherited` and `ignored`, folders take the worst status below them, and a rename or move carries the status along.
- `readDir` entries accept `ignored`. Ignored rows and everything under them are dimmed, and `hideIgnored` removes them.
- New tone variables `--jft-tone-untracked`, `--jft-tone-conflicted`, `--jft-tone-deleted`, `--jft-tone-renamed` and `--jft-ignored-opacity`. `--jft-tone-ignored` now follows the color scheme.
- The `badge` slot receives `status` and `staged`, and `decoration` is optional.
- A `watched` event after a batch of file events, and `tree.report` to emit a typed error from a host.
- Governance: code owners, a pull request template, an approval gate on pull requests and on releases, CodeQL, a dependency audit, dependency review, a workflow audit and a security policy. Dependabot is removed.
- Git hooks for commit messages, commits and pushes, and an `ocr` review script.
- Vitest 5, which clears an advisory in a development dependency.
- The publish job no longer restores build caches.

## 0.2.0

- Colors follow the host `color-scheme` through `light-dark()` instead of `prefers-color-scheme`, so a dark system with a light page no longer renders near white text on white.
- Icon theme variants overlay the base theme one entry at a time, so `light` no longer drops every name it does not list. Root folders resolve through `rootFolderNames` and `rootFolderNamesExpanded`.
- The language table is generated from GitHub Linguist data and resolves to VS Code language ids.
- Language lookups ignore inherited object keys, so a file named `constructor` has no language.
- `@jensen-org/jft-29/icons/material`, an opt in Material icon theme with its svg files, generated from `material-icon-theme`.
- `@jensen-org/jft-29/icons/symbols`, an opt in minimal icon theme with its svg files, generated from `vscode-symbols`.

## 0.1.2

- A full README, and a release guard that only publishes tags on commits that are on `main`.

## 0.1.1

- `selectPaths`, a `leading` row slot and a `focus()` handle on the component.
- The watcher is subscribed before the first read, so no event is lost during start.
- The `edit-input` slot now covers rename as well as create, with `blurCommit` and `renaming`.

## 0.1.0

- The core tree model, provider interface, coalescer and reveal.
- The Vue component, icon theme resolver, language plugin and editor helpers.
