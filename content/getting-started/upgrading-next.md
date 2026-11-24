---
title: Upcoming changes
description: Changes on main since 0.7.1 that can affect existing apps. This page becomes the upgrade guide for the next release.
---

# Upcoming changes

Changes on `main` since 0.7.1 are listed here as they land. They become the
upgrade guide for the next release.

## Docs for coding agents

Nothing to change in your app. What's new:

- `megh new` writes an `AGENTS.md` with the project's commands, layout and
  the Megh rules that TypeScript can't check, and a `CLAUDE.md` that imports
  it. Add them to an existing project with `npx megh make:agents`. See
  [Application](/cli/basic#application).
- The docs site publishes [`/llms.txt`](https://meghjs.github.io/llms.txt),
  an index of every page for agents, and
  [`/llms-full.txt`](https://meghjs.github.io/llms-full.txt), every page in one
  file. Each page is also available as markdown: add `.md` to its URL.
