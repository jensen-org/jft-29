# Security

## Reporting a vulnerability

Use GitHub private vulnerability reporting: open the Security tab of this repository and choose Report a vulnerability. Do not open a public issue for a security problem. You will get a first answer within five working days.

## What this package is

`@jensen-org/jft-29` is a browser side file tree with a Vue layer. It has no runtime dependencies, makes no network request, reads no files itself, and injects no markup of its own. Everything it shows comes from a provider the host supplies.

## How the project is protected

- Every change reaches `main` through a pull request. Required checks are the full check, CodeQL, the dependency audit, dependency review, the workflow audit and a reviewer approval.
- A release is a `v*` tag on a commit that is already on `main`. The publish job waits for a reviewer to approve the `release` environment, then publishes through npm trusted publishing with provenance. No npm token is stored anywhere.
- Every GitHub Action is pinned to a full commit SHA and every workflow runs with read only permissions unless a job needs more.
- Secret scanning and push protection are on.
- A commit hook and a push hook run the same quality checks locally before code leaves a machine.
