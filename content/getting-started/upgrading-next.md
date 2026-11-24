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

## New package: `@meghjs/ai`

Nothing to change in your app. [`@meghjs/ai`](/ai/tools) is a new plugin:

- `@Tool()` exposes a route to LLMs as a tool. Calls go through the route's
  authentication, `@Authorized`, validation and rate limits.
- `app.tools()` (or an injected `ToolSet`) gives the tools in Anthropic,
  OpenAI or MCP format and runs a model's tool calls as the signed-in user.
- `app.useMcp()` serves the tools as an MCP server over Streamable HTTP.

Related changes elsewhere:

- `megh route:list` shows a **TOOL** column when the app has `@Tool` routes,
  and `--json` adds a `tool` field to those routes.
- `@meghjs/mcp` adds `megh_list_ai_tools` and the `megh-add-ai-tools` prompt.
- Plugins can read each controller route's handler and input schema in
  Fastify's `onRoute` hook with `getRouteDescriptor(route)` from
  `@meghjs/core`.
- A route handler that sends the reply itself (for example after
  `reply.hijack()`) no longer logs "Reply was already sent".
