---
title: MCP Server
description: Connect AI assistants to your Megh app with @meghjs/mcp, the Megh Model Context Protocol server.
---

# MCP Server

`@meghjs/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
(MCP) server for Megh. MCP is an open standard for connecting AI assistants to
tools and data. With this server, assistants such as Claude Code, Claude
Desktop, Cursor and VS Code work from your real project and the real Megh docs
instead of guessing.

It gives an assistant:

- **The Megh docs.** They ship with the server and match its version, so the
  assistant searches and reads the right API instead of relying on memory.
- **A view of your project:** dependencies, source files by kind, routes,
  migration status, the `megh doctor` checks and type errors.
- **The `megh` generators and scaffolds,** run the same way the CLI runs them.
- **Migrations and seeders,** which it refuses to run against a production
  project.

It wraps the `megh` CLI. It uses the `@meghjs/cli` installed in your project
when there is one, so generated code matches your `@meghjs/core`, and falls
back to its own copy otherwise.

## Setup

The server runs with `npx`, so there is nothing to install in your project.

### Claude Code

From your project folder:

```sh
claude mcp add megh -- npx -y @meghjs/mcp
```

### VS Code

Add `.vscode/mcp.json` to your project:

```json [.vscode/mcp.json]
{
  "servers": {
    "megh": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@meghjs/mcp", "${workspaceFolder}"]
    }
  }
}
```

### Claude Desktop, Cursor and others

Any client that reads an `mcpServers` config:

```json
{
  "mcpServers": {
    "megh": {
      "command": "npx",
      "args": ["-y", "@meghjs/mcp", "/path/to/your/project"]
    }
  }
}
```

Then ask the assistant something like "review this Megh project" or "add a
products resource with a name and a price".

## Options

```sh
megh-mcp [project-dir] [--read-only]
```

| Option | Environment | Description |
| --- | --- | --- |
| `project-dir` | `MEGH_PROJECT_ROOT` | The project the tools work on. Defaults to the folder the server starts in. Every tool also takes an optional `cwd`. |
| `--read-only` | `MEGH_MCP_READ_ONLY=1` | Leave out every tool that writes files or changes the database, and the `megh-add-resource` prompt. |
| | `MEGH_DOCS_DIR` | Serve docs from this folder instead of the bundled ones. |

::: tip Read-only for reviews
Use `--read-only` when you only want the assistant to explain or review your
code. It can still read the docs and inspect the project, but it can't change
files or the database.
:::

## Tools

### Project

| Tool | What it does |
| --- | --- |
| `megh_project_info` | Project root, `@meghjs/*` dependencies (declared and installed), scripts, `megh` settings, and whether it runs in production |
| `megh_project_structure` | Source files grouped by kind (controllers, services, models, DTOs, migrations, seeders...), with counts and the entry file |
| `megh_doctor` | The `megh doctor` checks: Node.js, `@meghjs/core`, `reflect-metadata`, decorator settings |
| `megh_list_routes` | `megh route:list --json`. `static: true` reads the decorators without running your code |
| `megh_list_templates` | `megh template:list [domain] --json` |
| `megh_typecheck` | Runs the project's `tsc --noEmit` and returns the errors |
| `megh_migrate_status` | `megh migrate:status --json` |

### Docs

| Tool | What it does |
| --- | --- |
| `megh_search_docs` | Searches the Megh docs and returns the best-matching pages with snippets |
| `megh_read_doc` | Reads a page as markdown, e.g. `core-concept/controller`. With no page, lists them all |

### Code generation

| Tool | What it does |
| --- | --- |
| `megh_make` | `megh make:<kind> <name>` for model, controller, service, resource, dto, config, middleware, mail, event, listener, queue, worker, task, migration, seeder and factory |
| `megh_sync_model` | `megh sync:model`: updates a model after an alter-table migration. `dryRun` shows the changes first |
| `megh_scaffold_domain` | `megh scaffold:domain`: the tables (and models or resources) of a domain's templates |
| `megh_scaffold_auth` | `megh scaffold:auth`: sign-up and sign-in with JWTs, API keys or both, optionally with roles |
| `megh_scaffold_rbac` | `megh scaffold:rbac`: roles and permissions for an app that already has users |
| `megh_build` | `megh build`: compiles to the output folder and copies assets |

The generators never prompt, and they leave existing files alone unless `force`
is set.

### Database

| Tool | What it does |
| --- | --- |
| `megh_migrate` | Runs the pending migrations, optionally followed by the seeders |
| `megh_migrate_rollback` | Undoes the last migration, or the last `step` |
| `megh_db_seed` | Runs the seeders, or one `seeder` |

These refuse to run when `NODE_ENV` is `production`, whether it is set in the
server's environment or in the project's `.env`. `migrate:reset` and
`migrate:refresh` aren't exposed, because they drop every table. Run those
yourself.

## Resources and prompts

| Resource | Contents |
| --- | --- |
| `megh://docs/{page}` | A docs page as markdown, e.g. `megh://docs/advanced/orm` |
| `megh://project/info` | The project, as `megh_project_info` returns it |
| `megh://project/structure` | The project's files, as `megh_project_structure` returns them |

| Prompt | What it does |
| --- | --- |
| `megh-review-project` | Checks the setup, routes, structure and type errors, and points out problems |
| `megh-explain` | Explains a Megh feature (`topic`) from the docs, with an example that fits the project |
| `megh-add-resource` | Adds a table, model and CRUD API for `name` (with optional `fields`), migrates, and checks it compiles. Not offered in read-only mode |

## Use it as a library

```ts
import { createServer } from '@meghjs/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer({ projectRoot: '/path/to/app', readOnly: true });
await server.connect(new StdioServerTransport());
```
