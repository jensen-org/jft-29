# Changelog

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
