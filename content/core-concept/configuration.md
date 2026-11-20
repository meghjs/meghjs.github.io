---
title: Configuration and Environment
description: Reading environment variables, loading .env, and typed config classes with @AppConfig and GetConfig.
---

# Configuration and Environment

Megh reads settings from environment variables and a `.env` file. Read them
directly with `Environment`, or group them into typed config classes.

## The `.env` file

Megh loads `.env` from the current working directory (`process.cwd()`) into
`process.env` when `@meghjs/core` is first imported. Module-level code can
read `process.env` straight away.

```sh [.env]
PORT=4000
MAIL_HOST=smtp.example.com
MAIL_PORT=587
```

- Only `.env` is read. There is no `.env.local` or `.env.production`.
- A missing `.env` is fine. Nothing is loaded and no error is raised.
- Real environment variables win. A variable already set in the shell, in
  Docker or by your host is never overwritten by `.env`.
- Run the app from the project root, or the file won't be found.

### `MEGH_DOTENV`

Set `MEGH_DOTENV=false` to stop Megh loading `.env` into `process.env`, for
example when your platform injects the environment itself:

```sh
MEGH_DOTENV=false node dist/serve.js
```

It is checked before `.env` is read, so set it in the real environment, not in
`.env`.

With `MEGH_DOTENV=false`, `Environment` doesn't read `.env` either: `get()`,
`getOrThrow()` and `getAll()` only see `process.env`. It is checked on every
read.

## `Environment`

`Environment` is an injectable service for reading variables:

```ts [src/services/mailer.service.ts]
import { AppService, Environment, inject } from '@meghjs/core';

@AppService
export class MailerService {
  private readonly env = inject(Environment);

  host() {
    return this.env.get<string>('MAIL_HOST') ?? 'localhost';
  }
}
```

| Method | Returns |
|--------|---------|
| `get<T>(key)` | The value, or `undefined` when it isn't set |
| `getOrThrow<T>(key)` | The value. Throws `EnvironmentVariableNotFound` (`"<KEY> not found in environment variables."`, with the name in `error.key`) when it isn't set |
| `getAll<T>()` | Every variable, `.env` merged with `process.env` |
| `Environment.reload()` | Static. Forget the cached `.env` so the next read loads it again |

Values from `process.env` take precedence over the `.env` file in all three
methods.

::: tip Values are strings
The type parameter is only a cast. `env.get<number>('PORT')` still returns the
string `"4000"`. Convert it yourself: `Number(env.get('PORT'))`.
:::

`getOrThrow` treats an empty value (`KEY=`) as set and returns `""`.

### Caching

`Environment` parses `.env` once and keeps the result. `process.env` is read on
every call, so changes to it at runtime show up straight away. Edits to the
`.env` file do not, until you call `Environment.reload()` or restart.

If `.env` exists but can't be read, the error is logged and `Environment`
returns only the `process.env` values until `Environment.reload()`.

### Outside classes

`inject()` works anywhere, for example in the startup script:

```ts [src/serve.ts]
import { Environment, inject } from '@meghjs/core';
import app from './app';

async function serve() {
  const env = inject(Environment);
  if (env.get('MAINTENANCE') === 'true') return;
  await app.run();
}

serve();
```

## Config classes

A config class turns variables into one typed settings object. Extend
`MeghConfig<T>`, implement `config(env)`, and mark the class with
`@AppConfig`:

```ts [src/config/mail.config.ts]
import { AppConfig, Environment, MeghConfig } from '@meghjs/core';

export type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  from: string;
};

@AppConfig
export class MailConfig extends MeghConfig<MailSettings> {
  config(env: Environment): MailSettings {
    return {
      host: env.get('MAIL_HOST') ?? 'localhost',
      port: Number(env.get('MAIL_PORT')) || 1025,
      secure: env.get('MAIL_SECURE') === 'true',
      from: env.getOrThrow('MAIL_FROM'),
    };
  }
}
```

`npx megh make:config mail` generates this file for you.

`@AppConfig` registers the class with [dependency injection](/core-concept/dependency-injection).
It takes no arguments, so write `@AppConfig`, not `@AppConfig()`.

### Reading a config with `GetConfig`

`GetConfig(ConfigClass)` returns the object built by `config()`, typed from the
class:

```ts [src/services/mailer.service.ts]
import { AppService, GetConfig } from '@meghjs/core';
import { MailConfig } from '../config/mail.config';

@AppService
export class MailerService {
  private readonly mail = GetConfig(MailConfig); // MailSettings

  connect() {
    return createTransport({ host: this.mail.host, port: this.mail.port });
  }
}
```

`config()` runs on the first `GetConfig` call and the result is cached, so
later calls return the same object. `Environment.reload()` clears the cache,
and the next `GetConfig` call runs `config()` again.

If the class isn't registered, `GetConfig` throws
`Config class "MailConfig" is not registered. Did you forget to apply the @AppConfig decorator?`.

An error thrown inside `config()`, for example `EnvironmentVariableNotFound`
from `getOrThrow`, reaches you as it is.

### Validating at boot

Describe the environment as a DTO class, with the same validation
decorators as request DTOs, and let the app check it when it starts:

```ts [src/config/env.ts]
import { IsIn, IsInt, IsString, Min } from '@meghjs/core';

export class Env {
  @IsInt()
  @Min(1)
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string;
}
```

```ts [src/app.ts]
app.useEnvSchema(Env);
```

`run()` then fails before anything starts, listing every problem:

```txt
ConfigValidationError: [Megh] Invalid environment:
  PORT: PORT must not be less than 1
  DATABASE_URL: DATABASE_URL must be a string
```

Only the variables the DTO declares are checked. Properties typed `number`
or `boolean` are converted first (`"4000"` → `4000`, `"true"`/`"1"` →
`true`). `validateEnv(Env)` does the same anywhere and returns the converted
values.

A config class can declare the shape of what `config()` returns:

```ts
@AppConfig({ schema: MailSettingsDto })
export class MailConfig extends MeghConfig<MailSettings> { ... }
```

The result is checked on the first `GetConfig(MailConfig)` and, for every
class with a schema, when the app starts. Properties the schema doesn't
declare are not checked. Both throw `ConfigValidationError`, whose `issues`
list each failing property.

### Reading a token

`GetConfig` also accepts a token or string name and returns whatever is
registered for it in the container:

```ts
import { GetConfig, MeghContainer } from '@meghjs/core';

MeghContainer.set('FEATURE_FLAGS', { newCheckout: true });

const flags = GetConfig<{ newCheckout: boolean }>('FEATURE_FLAGS');
```

It throws `Config token "FEATURE_FLAGS" is not registered in the container.`
when nothing is set.

### Passing a config class to the app

Some `use*` methods take a config class in place of options and call
`config()` for you:

```ts [src/app.ts]
import { Megh } from '@meghjs/core';
import { OpenApiConfig } from './config/openapi.config';
import { DatabaseConfig } from './config/database.config';

const app = Megh.createApplication();

app.useMeghORM(DatabaseConfig);   // MeghConfig<DatabaseOptions>
app.useOpenApi(OpenApiConfig);    // MeghConfig<OpenApiUiOptions>
```

`useMeghORM` only recognises a class that extends `MeghConfig`, so always
extend it. The config is read once, when the method is called.

## Summary

| API | Use |
|-----|-----|
| `Environment` | Injectable service: `get`, `getOrThrow`, `getAll`, `Environment.reload()` |
| `EnvironmentVariableNotFound` | Error thrown by `getOrThrow()`; check it with `instanceof` |
| `MeghConfig<T>` | Base class for config classes. Implement `config(env): T` |
| `@AppConfig` | Registers a config class for injection |
| `GetConfig(ConfigClass)` | Builds and returns the typed settings |
| `GetConfig(token)` | Returns the value registered for a token or string |
| `MEGH_DOTENV=false` | Don't read `.env` at all: only `process.env` is used |

See also [Application](/getting-started/application) for `NODE_ENV`, `HOST`
and other variables the app reads, and
[Deployment](/production/deployment) for setting the environment in
production.
