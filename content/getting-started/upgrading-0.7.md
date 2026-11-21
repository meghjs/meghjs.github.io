---
title: Upgrading to 0.7
description: "What changes in Megh 0.7.0: server-rendered views, the @meghjs/mcp server for AI assistants, deny-by-default authorization, the request context API, megh new --mvc and make:view; plus stricter dependency injection, mail address and attachment checks, and rate limiting."
---

# Upgrading to 0.7

0.7.0 adds server-rendered [views](/advanced/views), an
[MCP server](/ai/mcp) for AI assistants, opt-in
[deny-by-default authorization](/core-concept/authentication#deny-by-default)
and a [request context](/core-concept/request-context) API.

It also makes a few checks stricter, so code that used to run with a hidden
problem now fails early. Most apps need no changes. Read
[Breaking in 0.7.0](#breaking-in-0-7-0) before upgrading: each item says how to
tell whether it affects you.

`@meghjs/core`, `@meghjs/cli` and the new `@meghjs/mcp` share one version
number. Upgrade them together:

```sh
npm i @meghjs/core@~0.7.0
npm i -D @meghjs/cli@~0.7.0
```

0.7.0 is the last minor release before 1.0. See the
[versioning policy](/reference/versioning).

## Breaking in 0.7.0

### Unresolvable constructor parameters throw

A constructor parameter typed as an interface, a union or a primitive has no
runtime type, so it used to be injected as `undefined`. The service then
failed later, far from the cause. Now the class fails when it is first built,
with a `ContainerError` that names the class and the parameter:

```
Cannot resolve parameter 0 of OrderService: its type is an interface, union
or primitive (emitted as Object). Use @Inject(TOKEN) on the parameter or
inject(TOKEN) in a field, type it as a class, or mark it @Optional().
```

**Affects you if** the app now fails at boot with this error. Fix the
parameter it names in one of these ways:

```ts
constructor(
  @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway, // a token
  @Optional() private readonly tracer?: Tracer,                        // undefined on purpose
) {}
```

`@Inject(token, { optional: true })` injects `undefined` when the token isn't
registered. Overrides and inject handlers still take precedence. See
[Dependency Injection: Errors](/core-concept/dependency-injection#errors).

### Mail addresses must be single addresses

A string such as `'ann@example.com, bob@example.com'` used to pass as one
address. The HTTP mailers (SendGrid, Mailgun, Postmark and Resend) sent it on
as is, so it reached every address in it. If the string came from user input,
an attacker could add themselves.

Each address must now be a single `local@domain` with no spaces, `,`, `;`,
`<`, `>` or quotes. A display name that contains a comma must be quoted:
`'"Lee, Ann" <ann@example.com>'`.

**Affects you if** you pass several recipients in one string. Pass an array
instead:

```ts
await mailer.to(['ann@example.com', 'bob@example.com']).send(new InvoiceMail());
```

### Attachment URLs are refused by default

Every mailer now checks attachment `path`s when the message is built. Local
files are allowed. `http(s)://` URLs are refused unless you turn them on,
because a URL built from input could fetch cloud metadata or internal
services and mail the response out.

**Affects you if** an attachment's `path` is a URL. Allow URLs only if every
URL is yours, and consider confining local files to one folder:

```ts
app.useMail({
  allowUrlAccess: true,               // default false
  attachmentRoot: 'storage/invoices', // optional: only read files in here
});
```

See [Mail: Attachment paths](/advanced/mail#attachment-paths).

### Rate limits are stricter

- **One counter per route across URI versions.** A route served at `/v1/...`
  and `/v2/...` by `@Version(['1', '2'])` used to get a separate limit per
  version. Now the versions share one counter.
- **IPv6 clients are grouped by `/64`.** A client rotating addresses within
  its `/64` used to get a fresh counter for every address. Change the prefix
  with `useRateLimit({ ipv6Subnet })`. IPv4-mapped IPv6 addresses count as
  IPv4.
- **The memory store holds at most 100,000 keys** and drops the oldest
  windows first, so random keys can't grow the heap without limit. Change it
  with `new MemoryRateLimitStore({ maxKeys })`.

**Affects you if** you rely on per-version limits, or many of your users share
an IPv6 `/64`. See [Security: Add rate limits](/production/security#add-rate-limits).

### `transports` only accepts `'socket'`

`SocketEventDispatcher.dispatch(event, data, { transports })` accepted
`'kafka'` and `'rabbitmq'` but ignored them. Any value other than `'socket'`
now throws before the event is sent.

**Affects you if** you pass `transports`. Remove the option, or use
`['socket']`. See [WebSocket: Emitting to clients](/microservices/websocket#emitting-to-clients).

### `megh -v` prints only the version

`megh -v` and `megh --version` print just the number, for example `0.7.0`. In
0.6.5 they printed the logo and `Megh v<version>`. The logo now appears only
with `megh --info`, which also has a short form, `megh -i`.

**Affects you if** a script parses `megh -v`. Read the whole output as the
version.

## New in 0.7.0

### Views

Megh renders HTML on the server with a Blade-style template engine:
`{{ }}` echoes, `@if` / `@foreach`, layouts with `@extends` and `@section`,
`@include`, stacks, and `<x-component>` tags with slots. Templates compile to
JavaScript once and are cached.

```ts
app.useViews(); // views/**/*.megh.html

@Get('/')
home() {
  return Results.View('pages.home', { user });
}
```

- **`@react` islands** mount a React component in the browser from inside a
  view. Compiling JSX needs `@swc/core`.
- **`app.useMethodOverride()`** lets HTML forms reach `PUT`, `PATCH` and
  `DELETE` routes with `@method('DELETE')`, and parses urlencoded bodies for
  `@Body()`.

See [Views](/advanced/views).

### MCP server for AI assistants

[`@meghjs/mcp`](/ai/mcp) is a new package: a Model Context Protocol server
that lets assistants such as Claude Code, Cursor and VS Code read the Megh
docs, inspect your project (routes, structure, migrations, type errors) and
run the `megh` generators. In Claude Code:

```sh
claude mcp add megh -- npx -y @meghjs/mcp
```

It has a `--read-only` mode, and it refuses to run migrations against a
production project. See [MCP Server](/ai/mcp).

### Deny-by-default authorization

A route without `@Authorized` is public, so forgetting it on one handler leaves
that endpoint open. You can now protect every route by default and mark the
open ones with `@Public()`:

```ts
app.useAuthorization(JwtAuthorization, { default: 'authenticated' });
```

It's off unless you set `default`, so existing apps behave as before.
`megh route:list` shows each route's protection in a new `AUTH` column. See
[Deny by default](/core-concept/authentication#deny-by-default).

### Request context

`requestContext` holds values for the current request, so code deep in a
service can read the current user or tenant without passing it through every
call:

```ts
import { requestContext } from '@meghjs/core';

const user = requestContext.getUser<User>();
```

Authentication sets `requestContext.user`. `requestContext.run(fn, init)`
gives workers, scripts and tests a context of their own. See
[Request Context](/core-concept/request-context).

### CLI

- **`megh new <name> --mvc`** creates a server-rendered app: `useViews()` and
  `useMethodOverride()` in `src/app.ts`, a layout, a home page, and a
  controller that renders it. See [CLI: Application](/cli/basic#application).
- **`megh make:view <name>`** (`m:v`) writes `views/<name>.megh.html`. Pages
  extend `layouts.app` when it exists; `--layout` picks another layout,
  `--no-layout` writes a standalone page, and `-c` writes an `<x-name>`
  component. See [Generators: View](/cli/generators#view).
- **A new logo** for `megh --info`, and `megh -i` as its short form.

## Fixes

- **Rate limiting warns when `trustProxy: true`.** With it, the client controls
  `X-Forwarded-For` and can get a fresh counter on every request. Use the
  number of proxy hops or the proxy's address instead. See
  [Terminate HTTPS at a proxy](/production/security#terminate-https-at-a-proxy).
- `rateLimitIpKey()` and `MemoryRateLimitStoreOptions` are exported.
- `setGlobalPrefix(prefix, { exclude })` matches inline routes whose path has
  no leading slash.
- In-memory queued events run in the request context they were dispatched in.
  They used to all run in the context of the first one.

## Coming from older versions

On 0.5.x or earlier, read [Upgrading to 0.6](/getting-started/upgrading-0.6)
first.
