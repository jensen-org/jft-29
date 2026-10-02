# Changelog

## Unreleased

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
