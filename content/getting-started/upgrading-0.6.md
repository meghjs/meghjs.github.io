---
title: Upgrading to 0.6
description: "What changes in Megh 0.6: removed no-op APIs, run() reading PORT, framework logs through the logger and a safer scaffolded .env in 0.6.0; mail, security headers and rate limiting in 0.6.1; module-first generators, event, queue and task generators and change review in 0.6.3; generated tests, make:test, make:class, make:model --orm/--typeorm, compression, versioning and env schemas in 0.6.5."
---

# Upgrading to 0.6

0.6.0 removes APIs that did nothing, makes `app.run()` read `PORT`, and sends
framework messages through the logger. Most apps only need to delete a call
or two. Read [Breaking in 0.6.0](#breaking-in-0-6-0) before upgrading.

0.6.1 and 0.6.3 add features and fixes with no breaking changes. See
[New in 0.6.3](#new-in-0-6-3) and [New in 0.6.1](#new-in-0-6-1). 0.6.2 was
tagged but never published to npm; its changes ship in 0.6.3.

0.6.5 adds features and fixes, and changes some CLI generator flags
(`make:model` writes a plain class unless you pass `--orm`). Apps don't
need code changes. See [New in 0.6.5](#new-in-0-6-5).

A `0.x` minor release can contain breaking changes; patch releases such as
0.6.1 don't. See the [versioning policy](/reference/versioning).

```sh
npm i @meghjs/core@^0.6.5
npm i -D @meghjs/cli@^0.6.5
```

## New in 0.6.5

There is no 0.6.4: the changes on `main` after 0.6.3 ship in 0.6.5.

### Changes to the CLI generators

0.6.5 changes what some generator flags mean. Your app's code is not
affected, only what the `make:*` commands write from now on. Check any
scripts that run them:

- **`make:model` writes a plain class by default.** For a Megh ORM model
  (columns read from its migration), add `--orm`:
  `megh make:model user --orm`. `--template` and `--fields` still build a
  Megh ORM model without it.
- **`--orm` now means Megh ORM; TypeORM is `--typeorm`.** On `make:model`,
  `make:controller -m` and `make:service -m`, replace `--orm` with
  `--typeorm` where you generate TypeORM entities or repository services.
  With `-m`, Megh ORM stays the default.
- **A resource can't be built on a plain class.** `make:resource`,
  `make:controller -m` and `make:factory` stop with a message if the model
  file is a plain class; regenerate it with `make:model <name> --orm --force`.
- **`megh -v` prints the logo, then `Megh v<version>`**, instead of the bare
  version. A script that reads it should match `v(\d+\.\d+\.\d+)` on the
  last line, or use `npm ls @meghjs/cli`. `megh --help` and `megh new` no
  longer print the logo.

### New

- **Generators write unit tests.** `make:service user` also writes
  `src/services/user.service.spec.ts`, and so do the other generators except
  `make:model` and the database ones. `make:resource` tests every service
  method and route without a database. Pass `--notest` (or `-nt`) to skip
  them. See [CLI: Tests](/cli/generators#tests).
- **`make:test` (`m:t`)** writes a test for a file you already have:
  `megh make:test user.service`.
- **`make:class` (`m:cls`)** writes a plain class in `src/classes/`.
- **`megh --info`** prints the CLI, Node.js and OS versions and the project's
  Megh packages, for bug reports. See [Version and info](/cli/basic#version-and-info).
- **Compression.** `app.useCompression()`, over `@fastify/compress`. See
  [Compression](/getting-started/application#compression).
- **Global prefix and versioning.** `app.setGlobalPrefix('api', { exclude })`
  and `app.useVersioning({ type: 'uri' | 'header' })` with `@Version()`. See
  [Global prefix and versioning](/core-concept/controller#global-prefix-and-versioning).
- **Redirects and response headers.** `@Redirect(url, status)`,
  `Results.Redirect(url, status)` and `@ResponseHeader(name, value)`. See
  [Redirects and headers](/getting-started/usage#redirects-and-headers).
- **Validated environment and config.** `app.useEnvSchema(EnvDto)` and
  `@AppConfig({ schema })` check values at boot and list every problem in a
  `ConfigValidationError`. See [Validating at boot](/core-concept/configuration#validating-at-boot).
- **Socket.IO authentication.** The `useAuthentication` handler runs on the
  handshake and sets `socket.data.user`. See
  [WebSocket: Authentication](/microservices/websocket#authentication).
- **`megh migrate --compiled`** (and `db:seed --compiled`) runs the built
  `.js` migrations, for production images without `src/`. It is picked
  automatically when there is no `src/` folder. See
  [Database Commands](/cli/database).

### Fixes

- The CLI's generated files load when a name matches a Megh decorator:
  `make:config app` (`AppConfig`) and a `Post`, `Get` or `Query` model in
  `make:resource`.
- `MeghTest.getController` / `getProvider` stand-ins are no longer written to
  the shared container, and requests wait for the routes to be mapped. See
  [Testing](/advanced/testing#replacing-dependencies).
- `PartialType`, `PickType` and `OmitType` copy class-validator,
  class-transformer, Megh and OpenAPI metadata.
- `MEGH_DOTENV=false` stops `Environment` from reading `.env`;
  `GetConfig` passes on errors from `config()` and caches until
  `Environment.reload()`.
- Controller auto-discovery reads the tsconfig `rootDir`/`outDir`, detects
  tsx and other TypeScript runtimes, and fails on a file it can't import.
- Scheduler: tasks stop when startup fails, `close()` waits for running jobs,
  and `useScheduler({})` scans `src/tasks`.
- `useControllers()` adds to earlier lists; a clear boot error for
  `@Body()` / `@Query()` without decorator metadata; Scalar serves the
  generated spec; `FileStorage` confines saves after following symlinks; the
  error logger logs the path without the query string.
- `megh doctor` requires Node.js 22, like the packages.

## New in 0.6.3

- **Generators for events, queues and scheduled tasks.** `make:event`,
  `make:listener` (`--event` to type it), `make:queue`, `make:worker` and
  `make:task` (`--cron`, `--interval`). See [Events](/advanced/events),
  [Queue](/advanced/queue) and [Scheduler](/advanced/scheduler).
- **`make:*` puts the module folder first.** `megh make:model users/user`
  now writes `src/users/models/user.model.ts`, not
  `src/models/users/user.model.ts`. The same goes for controllers, services,
  DTOs, middleware, config and mail. Existing files stay where they are, and
  `make:resource`, `make:factory` and `sync:model` still find models in
  the old place. See [Folders](/cli/generators#folders).
- **Auto-discovered controllers.** `useControllers({ auto: true })` without
  a `path` now scans every `controllers/` folder under `src/`, so module
  controllers are found. With a `path`, nothing changes.
- **`megh new` offers OpenAPI, CORS and MeghORM only.** Mail, Scalar UI,
  TypeORM and Knex are no longer set up by `megh new`; asking for them with
  `--features` prints how to add them. Existing projects are not affected.
  See [Mail: Setting it up](/advanced/mail#setting-it-up).
- **Generated models put each decorator on its own line**, with a blank
  line between columns. `sync:model` still reads models in the one-line
  style, and keeps hand-written fields as they are.

- **`update:model` is now `sync:model`** (alias `s:m`). The old name and
  `u:m` still work.
- **Generators review changes to existing files.** `sync:model` and any
  `make:*` run with `-f` show a diff of each file they would change, the
  files that import it and the lines that use removed or retyped members,
  then ask before writing. Declining puts everything back. Pass `-y` to skip
  the question; scripts and CI aren't asked. See
  [Reviewing changes](/cli/generators#reviewing-changes).
- **A smaller Megh logo** above `megh --help`.

## New in 0.6.1

No code changes needed. Everything here is opt-in.

- **Mail.** Inject `Mailer` and send `Mailable` classes over SMTP, or over
  SendGrid, Mailgun, Postmark or Resend's HTTP APIs. A failover mailer tries
  each in turn. `queue()` and `later()` send through the queue. Turn it on
  with `app.useMail()`, configured from `MEGH_MAIL_*` in `.env`; options
  passed to `useMail()` override them. See [Mail](/advanced/mail).
- **Security headers.** `app.useSecurityHeaders()` sends a Content Security
  Policy, HSTS, `X-Frame-Options`, `nosniff` and the other usual headers. It
  is built in, so `@fastify/helmet` is no longer needed. See
  [Security Hardening](/production/security#add-security-headers).
- **Rate limiting.** `app.useRateLimit()` limits requests per client and
  answers 429. `@RateLimit()` gives a route its own limit, and
  `RedisRateLimitStore` shares counts between replicas. It is built in, so
  `@fastify/rate-limit` is no longer needed. See
  [Security Hardening](/production/security#add-rate-limits).
- **CLI:**
  - `megh make:mail <Name>` creates a Mailable.
  - `megh new` offers a Mail feature.
  - `megh new` runs `git init` (skip it with `--skip-git` or
    `MEGH_SKIP_GIT=1`).
  - Generated resource services have JSDoc.
- **Fixes:**
  - `megh new` now installs the OpenAPI packages when you pick OpenAPI or
    Scalar, so the generated app starts.
  - The "No mailer is set" error lists every configured mailer.

If you registered `@fastify/helmet` or `@fastify/rate-limit` yourself in an
`onInit` hook, as the 0.6.0 docs suggested, that keeps working. To switch,
remove the `app.app.register(...)` calls, uninstall the two packages, and
call `app.useSecurityHeaders()` and `app.useRateLimit()` instead.

## Breaking in 0.6.0

### Removed APIs

These did nothing, or were a second name for another API. Delete the calls,
or switch to the replacement:

| Removed | Use instead |
|---------|-------------|
| `app.useHttps()` | Nothing: it was a no-op. For HTTPS, pass `server: { https: { key, cert } }` to `Megh.createApplication()`, or terminate TLS at a proxy |
| `app.useSerialization()` | Nothing: it was a no-op |
| `app.mapFeatures()` | Nothing: it was a no-op |
| `MeghSocketIo` | Get the server with `MeghContainer.get(SocketIoServer)`. See [WebSocket](/microservices/websocket) |
| `DuplicateRouteException` | Nothing. Fastify already refuses duplicate routes at startup |
| `MeghRouter.mapRoute()`, `MeghRouter.registerMiddleware()` | `app.mapGet()` and the other `map*` methods, and `app.useMiddlewares()` |
| `CreateSwaggerObjectSchema`, `GetObjectSchema` | `generateClassSchema` |

Your type checker finds every call that needs changing.

### `app.run()` reads `PORT`

`app.run()` without a port now listens on the `PORT` environment variable,
like it already read `HOST`, and falls back to `4000`. A port passed to
`run()` still wins:

```ts
app.run();      // PORT, else 4000
app.run(3000);  // 3000, whatever PORT says
```

An app that calls `app.run()` without a port and has `PORT` set to something
else, for example by the hosting platform, now listens on `PORT`. That's
usually what you want. To keep the old behaviour, pass the port explicitly.

An invalid `PORT`, such as `abc`, now stops startup with an error.

Apps created by the CLI read `PORT` themselves in `serve.ts` and keep working.
You can simplify `serve.ts` to `app.run()`.

### Framework logs go through the logger

Framework messages that went to `console` now go through the
[logger](/advanced/logging). That includes the startup line
`Application running on <address>`, and warnings such as a route using
`@Authorized` with no authorization handler registered. In production they're
JSON lines like every other log entry.

If a test spied on `console.warn` or `console.error` to check one of these
messages, spy on the logger instead. See [Testing](/advanced/testing).

## Other changes

- **New projects leave `NODE_ENV` out of `.env`.** `megh serve` already runs
  the app in development and `megh start` in production. The old line turned
  on development mode, with error details in responses, when a project's
  `.env` was deployed and the app started with `node dist/serve.js`. In an
  existing project, remove `NODE_ENV=development` from `.env` if you deploy
  that file. See [Deployment](/production/deployment#environment).
- **`MeghScheduler` is exported**, for running scheduled tasks in a process
  without the HTTP app. See [Scheduler](/advanced/scheduler).
- **New docs:** [Application](/getting-started/application),
  [Configuration](/core-concept/configuration),
  [Scheduler](/advanced/scheduler), [Testing](/advanced/testing),
  [Deployment](/production/deployment),
  [Security Hardening](/production/security),
  [API Reference](/reference/api),
  [Versioning Policy](/reference/versioning) and
  [FAQ](/reference/faq).
- **Doc fixes:** `useStaticFiles` takes `root`, not `path`. `useMultipart`
  limits files to 10 MB unless you pass `limits`, on top of `FileStorage`'s
  50 MB.

## Coming from older versions

On 0.5.0 to 0.5.4, read [Upgrading to 0.5.5](/getting-started/upgrading-0.5)
first.
