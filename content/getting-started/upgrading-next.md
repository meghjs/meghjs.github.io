---
title: Upcoming changes
description: Changes on main since 0.7.1 that can affect existing apps. This page becomes the upgrade guide for the next release.
---

# Upcoming changes

Changes on `main` since 0.7.1 are listed here as they land. They become the
upgrade guide for the next release.

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
