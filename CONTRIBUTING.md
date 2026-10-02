# Contributing

## Setup

```sh
bun install
```

`bun install` points git at `.githooks`, so the hooks below run on your machine.

## Branches and pull requests

Work on a topic branch or on `develop`. Changes reach `main` by pull request only. A pull request needs green checks and an approval: the `approve` job waits in the `pr-review` environment until a code owner opens the run and chooses Review deployments. A release is a `v*` tag on a commit already on `main`, approved in the `release` environment.

## Hooks

| Hook | What it runs |
|---|---|
| `commit-msg` | Conventional Commits header, a known scope, at most 100 characters |
| `pre-commit` | Biome on staged files, typecheck, generated data check, dependency guard |
| `pre-push` | The full `bun run check`, and a refusal to push `main` |

## Review

Run `bun run review` before a commit and `bun run review:branch` before a pull request. They list the files to review and the rules that apply, through `ocr` in delegate mode, so no source goes to an outside model. The reviewing agent or person reads each listed file, reports findings by severity and states coverage.

## Quality bar

- `bun run check` is the gate: typecheck, lint, tests, generated data, build, dependency guard, package lint.
- A fix comes with a test that fails without it.
- The package keeps zero runtime dependencies and `vue` as its only peer.
- A failure is loud: no swallowed errors, no silent defaults.
- Generated files are never edited by hand, run `bun run gen`.
