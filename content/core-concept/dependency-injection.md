---
title: Dependency Injection
description: Registering services and injecting them with constructors, inject() and tokens.
---

# Dependency Injection

Megh builds your controllers, services and middleware for you, and gives each
one the services it needs. Every service is created once and shared.

## Registering a service

Mark a class with `@AppService` (or `@Injectable()`). Controllers, middleware,
config classes and queue workers are registered by their own decorators.

```ts [src/services/mailer.service.ts]
import { AppService } from '@meghjs/core';

@AppService
export class MailerService {
  send(to: string, body: string) {
    // ...
  }
}
```

## Injecting with `inject()`

Call `inject()` in a field initializer:

```ts [src/services/user.service.ts]
import { AppService, inject } from '@meghjs/core';
import { MailerService } from './mailer.service';
import { UserRepository } from './user.repository';

@AppService
export class UserService {
  private readonly users = inject(UserRepository);
  private readonly mailer = inject(MailerService);

  async register(email: string) {
    const user = await this.users.create({ email });
    this.mailer.send(email, 'Welcome!');
    return user;
  }
}
```

Unlike [constructor injection](#injecting-through-the-constructor),
`inject()` doesn't rely on `emitDecoratorMetadata`, so it also works with test
runners and bundlers that can't emit it, such as esbuild.

It works outside classes too, for example in a startup script:

```ts [serve.ts]
import { Environment, inject } from '@meghjs/core';
import app from './app';

async function serve() {
  const env = inject(Environment);
  await app.run(Number(env.get('PORT')) || 4000);
}

serve();
```

### Optional dependencies

Pass `{ optional: true }` to get `undefined` instead of an error when nothing
is registered:

```ts
private readonly analytics = inject(AnalyticsService, { optional: true });
// AnalyticsService | undefined
```

This only covers the service not being registered. If it's registered but
fails to build (one of its own dependencies is missing, or its constructor
throws), `inject()` still throws.

## Injecting through the constructor

Constructor parameters are injected from their types:

```ts
@AppService
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly mailer: MailerService,
  ) {}
}
```

This needs `experimentalDecorators` and `emitDecoratorMetadata` in
`tsconfig.json`, which `megh new` projects have.

Parameters typed as interfaces, unions or primitives (`string`, `number`)
have no runtime type to resolve: TypeScript emits `Object` or `String` for
them. Building such a class fails with a `ContainerError` that names the
parameter. Inject a [token](#tokens) with `@Inject`, or mark the parameter
`@Optional()` to get `undefined`:

```ts
import { AppService, Inject, Optional } from '@meghjs/core';
import { PAYMENTS, type PaymentGateway } from './tokens';

@AppService
export class OrderService {
  constructor(
    @Inject(PAYMENTS) private readonly gateway: PaymentGateway,
    @Optional() private readonly audit?: AuditLog, // undefined unless registered
  ) {}
}
```

`@Inject(id, { optional: true })` injects `undefined` when nothing is
registered for `id`. `@Optional()` on a class-typed parameter injects the
instance when the class is registered, and `undefined` when it isn't.

Both styles resolve the same shared instances, and you can mix them in a
class.

## Tokens

Use a `Token` for values that aren't classes, such as a client from another
library or a setting:

```ts [src/tokens.ts]
import { Token } from '@meghjs/core';
import type { Redis } from 'ioredis';

export const REDIS = new Token<Redis>('REDIS');
```

```ts [src/app.ts]
import { MeghContainer } from '@meghjs/core';
import Redis from 'ioredis';
import { REDIS } from './tokens';

MeghContainer.set(REDIS, new Redis(process.env.REDIS_URL));
```

```ts
@AppService
export class RateLimiter {
  private readonly redis = inject(REDIS); // typed as Redis
}
```

## `MeghContainer`

| Method | Use |
|--------|-----|
| `MeghContainer.get(id)` | Resolve a class, token or name. Same as `inject(id)` |
| `MeghContainer.set(id, value)` | Register a value, or replace a class with another implementation |
| `MeghContainer.has(id)` | Whether anything is registered for `id` |
| `MeghContainer.reset()` | Drop created class instances so they're built again. Token values are kept. For tests |

## Testing

Replace a dependency before the class that uses it is built, and reset after
each test:

```ts
import { MeghContainer } from '@meghjs/core';

afterEach(() => MeghContainer.reset());

it('sends a welcome email', async () => {
  const sent: string[] = [];
  MeghContainer.set(MailerService, { send: (to: string) => sent.push(to) });

  await MeghContainer.get(UserService).register('a@b.c');

  expect(sent).toEqual(['a@b.c']);
});
```

`MeghContainer.set(MailerService, fake)` works for both `inject()` and
constructor injection.

## Errors

Errors are `ContainerError`s and name the chain of classes being built:

```
Cannot construct UserService -> MailerService: SmtpClient is not registered.
Mark it with @Injectable() (or @AppService), or register an instance with
MeghContainer.set(SmtpClient, value).
```

A parameter with no type to resolve fails when the class is first built,
instead of injecting `undefined`:

```
Cannot resolve parameter 0 of OrderService: its type is an interface, union
or primitive (emitted as Object). Use @Inject(TOKEN) on the parameter or
inject(TOKEN) in a field, type it as a class, or mark it @Optional().
```

A class-typed parameter can also show up as `Object` when two files import
each other: the class isn't loaded yet when TypeScript emits the type.

Two services that need each other while being built are reported instead of
overflowing the stack:

```
Circular dependency: OrderService -> UserService -> OrderService.
```

To break a cycle, have one side call `inject()` inside the method that needs
it, not in a field initializer or constructor.
