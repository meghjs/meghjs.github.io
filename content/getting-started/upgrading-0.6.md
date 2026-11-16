---
title: Upgrading to 0.6
description: "What changes in Megh 0.6: removed no-op APIs, run() reading PORT, framework logs through the logger and a safer scaffolded .env in 0.6.0; mail, security headers and rate limiting in 0.6.1."
---

# Upgrading to 0.6

0.6.0 removes APIs that did nothing, makes `app.run()` read `PORT`, and sends
framework messages through the logger. Most apps only need to delete a call
or two. Read [Breaking in 0.6.0](#breaking-in-0-6-0) before upgrading.

0.6.1 adds features and fixes with no breaking changes. See
[New in 0.6.1](#new-in-0-6-1).

A `0.x` minor release can contain breaking changes; patch releases such as
0.6.1 don't. See the [versioning policy](/reference/versioning).

```sh
npm i @meghjs/core@^0.6.1
npm i -D @meghjs/cli@^0.6.1
```

## New in 0.6.2

- **`make:*` puts the module folder first.** `megh make:model users/user`
  now writes `src/users/models/user.model.ts`, not
  `src/models/users/user.model.ts`. The same goes for controllers, services,
  DTOs, middleware, config and mail. Existing files stay where they are, and
  `make:resource`, `make:factory` and `update:model` still find models in
  the old place. See [Folders](/cli/generators#folders).
- **Auto-discovered controllers.** `useControllers({ auto: true })` without
  a `path` now scans every `controllers/` folder under `src/`, so module
  controllers are found. With a `path`, nothing changes.
- **`megh new` offers OpenAPI, CORS and MeghORM only.** Mail, Scalar UI,
  TypeORM and Knex are no longer set up by `megh new`; asking for them with
  `--features` prints how to add them. Existing projects are not affected.
  See [Mail: Setting it up](/advanced/mail#setting-it-up).
- **Generated models put each decorator on its own line**, with a blank
  line between columns. `update:model` still reads models in the one-line
  style, and keeps hand-written fields as they are.

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
