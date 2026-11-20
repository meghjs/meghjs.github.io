---
title: Generators
description: Generating resources, controllers, services, models, classes, middleware, config classes and their unit tests with the Megh CLI.
---

# Generators

The `make:*` commands write new files from templates. Models are read from your migrations, and `make:resource` writes a complete REST API for a model. Most generators also write a unit test next to the file (see [Tests](#tests)). Every `make:*` command takes `-f` / `--force` to overwrite an existing file.

## Folders

A plain name goes in the folder for its type. A name with a folder in front
is a module: the module folder comes first, then the type folder.

| Command | Writes |
|---|---|
| `make:model user` | `src/models/user.model.ts` |
| `make:model users/user` | `src/users/models/user.model.ts` |
| `make:controller users/user` | `src/users/controllers/user.controller.ts` |
| `make:service users/user` | `src/users/services/user.service.ts` |
| `make:resource users/user` | `src/users/{models,dtos,services,controllers}/user.*.ts` |

`--root <dir>` replaces the type folder: `make:model users/user --root domain`
writes `src/users/domain/user.model.ts`.

`useControllers({ auto: true })` finds controllers in every `controllers/`
folder under `src/`, so module controllers are registered too.

::: info Before 0.6.3
Nested names wrote `src/models/users/user.model.ts`. Files already there keep
working: `make:resource`, `make:factory` and `sync:model` look there when
the new location has no file.
:::

## Reviewing changes

A generator that would change a file that already exists (with `-f`, or
`sync:model`) shows what it is about to do and asks first:

```txt
Changes
  ~ changed  src/blog/models/post.model.ts

src/blog/models/post.model.ts
      title!: string;

  -   @Column({ nullable: true, type: "text" })
  -   body!: string | null;

      @Column()
  Can affect:
    src/blog/services/post.service.ts imports it
      line 5 uses .body, which is removed

? Apply these changes to 1 existing file? (y/N)
```

- **Changes** lists new files (`+ new`) and changed ones (`~ changed`), with a
  diff of each changed file.
- **Can affect** lists the files that import a changed file, and the lines
  that use a property or method the change removes or retypes.
- Answering no puts everything back, including the new files the command
  made along the way.

A command that only creates new files doesn't ask. `-y` / `--yes` applies
without asking; so does running outside a terminal (scripts and CI), which
still prints the review.

## Resource

```sh
npx megh make:resource user
# shorthand
npx megh m:r user
```

Generates a complete REST resource for a [Megh ORM](/advanced/orm) model:

| File | Contents |
|------|----------|
| `src/models/user.model.ts` | Reused if it exists; otherwise built from the migration that creates `users` (as `make:model` does) |
| `src/dtos/user.dto.ts` | `CreateUserDto`, `UpdateUserDto` (every field optional) and `ListUsersQuery` (`page`, `perPage`) |
| `src/services/user.service.ts` | `findAll`, `paginate`, `find`, `findOrFail`, `create`, `update`, `delete` |
| `src/controllers/user.controller.ts` | `GET /users`, `GET /users/:id`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id` |
| `src/services/user.service.spec.ts` | A test for each service method, with the model's queries replaced by spies |
| `src/controllers/user.controller.spec.ts` | A test for each route, with a stand-in service |

The DTO validators come from the model's fields and the migration's column
types: `varchar(255)` gets `@MaxLength(255)`, an `email` column `@IsEmail()`,
nullable columns and columns with a default are optional, and the generated
primary key and timestamps are left out. A missing row gives a 404.

If there is neither a model nor a migration for the table, nothing is
written; create the migration first (`megh make:migration create_users_table`).
Use `--table <name>` when the table name isn't the plural snake_case name, and
`-f` to overwrite existing DTO, service and controller files. Nested names
work too: `megh m:r admin/user` writes to `src/admin/` and serves
`/admin/users`. See [Folders](#folders).

If the model is a [TypeORM](/advanced/database) entity instead, the service
uses its repository and no DTOs are generated. A model that is a plain class
(`make:model` without `--orm`) has no table, so the command stops and says to
regenerate it with `make:model user --orm --force`.

Register the controller in your app:

```ts
app.useControllers([UserController]);
```

## Controller

```sh
npx megh make:controller user
# shorthand
npx megh m:c user
```

Pass `-r` for a full REST skeleton, and `-m <model>` to bind it to a model:

```sh
npx megh m:c user -m user -r
```

With `-m`, the controller is generated like [`make:resource`](#resource): the model's
DTOs, service and model (from its migration) are created if missing, and the
controller delegates to the service, which queries the [MeghORM](/advanced/orm)
model (`--orm` says so explicitly). To use a [TypeORM](/advanced/database)
repository instead, add `--typeorm`.

Use `-rt <dir>` to place the file under a different directory, and `--base-path`
to emit `@ApiController` without a route prefix.

## Service

```sh
npx megh make:service user
```

A resource service uses the [Megh ORM](/advanced/orm) model (generated from its
migration if it doesn't exist yet):

```sh
npx megh make:service user -m user -r
```

To use a [TypeORM](/advanced/database) repository instead, add `--typeorm`:

```sh
npx megh make:service user -m user -r --typeorm
```

## Model

```sh
# Plain class
npx megh make:model user

# Megh ORM model
npx megh make:model user --orm
npx megh make:model user --orm --table app_users   # table name other than "users"

# TypeORM entity (with @meghjs/data)
npx megh m:m user --typeorm
```

Without a flag, `make:model` writes a plain class, not mapped to a table:

```ts [src/models/user.model.ts]
export class User {
  // Add the fields a User has, e.g.
  // id!: number;
  // name!: string;

  constructor(values: Partial<User> = {}) {
    Object.assign(this, values);
  }
}
```

If a migration already creates the table, the command says so and suggests
`--orm`.

::: warning Before 0.6.5
`make:model user` wrote a Megh ORM model, and `--orm` made a TypeORM entity.
Now `--orm` means Megh ORM and `--typeorm` means TypeORM, on `make:model`,
`make:controller` and `make:service`.
:::

With `--orm`, `make:model` writes a [Megh ORM](/advanced/orm) model. It looks for the
model's table (by default the plural snake_case name: `User` → `users`,
`BlogPost` → `blog_posts`) in your migrations. If one creates it, the model
gets a decorated field for every column, with its type, nullability and
value conversion. The primary key, auto-increment, timestamp and soft-delete
columns get their own decorators. Later migrations that add, drop or rename
columns are taken into account:

```ts
// Columns read from the migrations (the table is created in 20260101000000_create_users_table.ts).
@Table("users")
export class User extends Model {
  @PrimaryKey()
  @AutoIncrement()
  id?: number;

  @Column()
  email!: string;

  @Column({ nullable: true, type: "string" })
  name!: string | null;

  @Column({ type: "boolean" })
  is_admin?: boolean;

  @CreatedAt()
  created_at?: Date;

  @UpdatedAt()
  updated_at?: Date;
}
```

Columns the database fills in (auto-increment, defaults, timestamps) are
declared with `?`, so `create()` can leave them out. Nullable columns name
their type (`type: "string"`), since a `string | null` field's type isn't
visible at runtime; [OpenAPI](/microservices/openapi#responses) uses it to
document the model. If no migration creates
the table, you get a model with an `id` and commented examples to fill in. The migrations are read, not run, so no database is needed.
Relations aren't generated; add them yourself.

To write the migration too, start from a template or a list of fields (these
always build a Megh ORM model, so `--orm` isn't needed); see
[Templates and Fields](/cli/scaffold/templates):

```sh
npx megh make:model Product --template ecommerce/product
npx megh make:resource Ticket --fields "title,body,status:in(open|closed),user_id:cascade"
```

### Syncing a model

After a migration alters the table, bring the model up to date without
regenerating it:

```sh
npx megh sync:model user
npx megh s:m user --dry-run   # show the review, write nothing
npx megh s:m user --dto       # also rewrite src/dtos/user.dto.ts
npx megh s:m user --yes       # apply without asking
```

It shows the changes and what they affect, and asks before writing (see
[Reviewing changes](#reviewing-changes)). It was called `update:model` before
0.6.3; that name (and `u:m`) still works.

For a migration such as:

```ts
await schema.table("users", (table) => {
  table.string("phone", 20).nullable();
  table.dropColumn("age");
});
```

`sync:model` adds `@Column({ nullable: true, type: "string" }) phone!: string | null;` after the
model's existing columns, removes the `age` field (with its doc comment), and
rewrites any field still in the shape `make:model` writes when its type or
nullability changed. Only column fields are touched: relations, methods,
getters and comments stay as they are. A field you customized (a `name:`
mapping, a custom cast, extra options) is kept as written and reported so you
can check it. A renamed column shows up as one field removed and one added.

The model must be a decorated (`@Table`) model; for an older model with
`static table` and `static casts`, regenerate it with `make:model --orm --force`.
Without `--dto`, a DTO from `make:resource` is not changed, and the command
reminds you it may be out of date.

## Middleware

```sh
npx megh make:middleware auth
```

Generates a class extending `MeghMiddleware`:

```ts [src/middlewares/auth.middleware.ts]
import { AppMiddleware, MeghMiddleware, IRequest, IResponse } from '@meghjs/core';

@AppMiddleware
export class AuthMiddleware extends MeghMiddleware {
  async invoke(req: IRequest, res?: IResponse) {
    // your logic goes here
    return req;
  }
}
```

## Mail

```sh
npx megh make:mail OrderShipped
```

Generates a `Mailable` in `src/mail`, with `envelope()`, `content()` and
`attachments()` to fill in. The `Mail` suffix is added for you, and a name like
`admin/Invoice` writes to `src/admin/mail/invoice.mail.ts`:

```ts [src/mail/order-shipped.mail.ts]
import { Mailable } from '@meghjs/core';

export class OrderShippedMail extends Mailable {
  envelope() {
    return { subject: 'Order Shipped' };
  }

  content() {
    return {
      html: '<p>Order Shipped</p>',
      text: 'Order Shipped',
    };
  }

  attachments() {
    return [];
  }
}
```

If `src/app.ts` doesn't call `app.useMail()` yet, the command says so. See
[Mail](/advanced/mail).

## Events

```sh
npx megh make:event UserCreated
npx megh make:listener SendWelcomeEmail --event UserCreated
```

`make:event` writes `src/events/user-created.event.ts`: a `UserCreatedEvent`
extending `MeghEvent`, with a `UserCreatedPayload` type to fill in.

`make:listener` writes `src/listeners/send-welcome-email.listener.ts`: a
`SendWelcomeEmailListener` typed to the event, marked `@AppService` so it can
inject services. With `--event` (`-e`), the event is created too if it doesn't
exist yet; without it, the listener takes any `MeghEvent`.

```ts [src/listeners/send-welcome-email.listener.ts]
import { AppService, MeghEventListener } from '@meghjs/core';
import { UserCreatedEvent } from '../events/user-created.event';

@AppService
export class SendWelcomeEmailListener extends MeghEventListener<UserCreatedEvent> {
  async handler(event: UserCreatedEvent): Promise<void> {
    // event.payload is the data; event.name and event.timestamp are set for you.
  }
}
```

Listeners are registered by hand, once at startup. The command prints the line
to add to `src/app.ts`:

```ts
EventRegistry.getInstance().register(UserCreatedEvent, MeghContainer.get(SendWelcomeEmailListener));
```

See [Events](/advanced/events).

## Queues and workers

```sh
npx megh make:queue OrderExport                  # queue "order-export"
npx megh make:worker Report --queue reports      # consumes "reports"
```

`make:queue` writes `src/queues/order-export.queue.ts`: an `OrderExportQueue`
that both adds jobs and handles them, with a payload type and one
`@JobHandler('process')` method. `--queue` (`-q`) sets the queue name in Redis;
it defaults to the kebab-case name.

```ts [src/queues/order-export.queue.ts]
import { Job, JobHandler, MeghQueue, Queue } from '@meghjs/core';

export type OrderExportPayload = {
  id: number; // replace with what the job needs
};

@Queue({ name: 'order-export' })
export class OrderExportQueue extends MeghQueue<OrderExportPayload> {
  constructor() {
    super();
  }

  @JobHandler('process')
  async handleProcess(job: Job<OrderExportPayload>) {
    // job.data is the payload
  }
}
```

`make:worker` writes a `MeghWorkerBase` with `process()`, `onCompleted()` and
`onFailed()`, for a queue another part of the system fills.

Both print `app.useWorker([...])` if `src/app.ts` doesn't register the class,
and `npm i bullmq ioredis` if the project doesn't depend on BullMQ. Redis
defaults to `127.0.0.1:6379`; set `MEGH_QUEUE_DRIVER=memory` to run jobs
without it. See [Queue](/advanced/queue).

## Scheduled tasks

```sh
npx megh make:task CleanupTokens                    # hourly
npx megh make:task NightlyReport --cron "0 3 * * *" # 03:00 every day
npx megh make:task PollPayments --interval 30000    # every 30 seconds
```

Writes `src/tasks/cleanup-tokens.task.ts`: a `@ScheduledTask()` class with one
`@Cron` (or, with `--interval`, `@Interval`) method. `make:scheduler` is an
alias.

```ts [src/tasks/cleanup-tokens.task.ts]
import { Cron, ScheduledTask } from '@meghjs/core';

@ScheduledTask()
export class CleanupTokensTask {
  @Cron('0 * * * *') // every hour, on the hour
  async run() {
    // your logic goes here
  }
}
```

`--cron` takes 5 fields, or 6 with seconds first. The command prints
`app.useScheduler([...])` unless `src/app.ts` already lists the class or scans a
folder with `useScheduler({ path })`. See [Scheduler](/advanced/scheduler).

## Config

```sh
npx megh make:config jwt
```

Generates a class extending `MeghConfig` and registered with `@AppConfig`:

```ts [src/config/jwt.config.ts]
import { AppConfig, MeghConfig, Environment } from '@meghjs/core';

@AppConfig
export class JwtConfig extends MeghConfig {
  config(env: Environment) {
    return {};
  }
}
```

## DTO

```sh
npx megh make:dto CreatePost
```

Writes `src/dtos/create-post.dto.ts`: a `CreatePostDto` with class-validator
rules for a `name` and an optional `description`, to replace with your fields.
Its test checks that a valid body passes and that `name` is required.

## Class

```sh
npx megh make:class Money
# shorthand
npx megh m:cls billing/Money
```

Writes a plain class (no decorators, nothing to register) in
`src/classes/money.ts`, or `src/billing/classes/money.ts` for the nested
name, with a test that creates it. `--root <dir>` picks another folder, e.g.
`make:class Money --root utils` writes `src/utils/money.ts`.

## Tests

Every generator except `make:model` and the database ones (`make:migration`,
`make:seeder`, `make:factory`) writes a [Vitest](/advanced/testing) unit test
next to the file it creates. The app's `vitest.config.mts` runs every
`src/**/*.spec.ts`, so `npm test` picks them up:

| Command | Also writes |
|---|---|
| `make:service user` | `src/services/user.service.spec.ts` |
| `make:resource user` | `src/services/user.service.spec.ts`, `src/controllers/user.controller.spec.ts` |
| `make:controller user -m user` | `src/controllers/user.controller.spec.ts` (and the service's, when it creates the service) |
| `make:class Money` | `src/classes/money.spec.ts` |

Each test matches what was generated:

- **Resource services** (`make:resource`, `make:service -m`) get a test for
  every method: `findAll`, `paginate`, `find`, `findOrFail`, `create`,
  `update` (it checks that fields sent as `undefined` are skipped) and
  `delete`, including the 404 cases. The model's queries are replaced with
  `vi.spyOn`, so no database is needed. `create` and `update` use sample values
  for the model's columns (`email` gets `user@example.com`, a boolean `true`).
  With `--typeorm`, the repository is a stand-in.
- **Resource controllers** get a test for every route, with a stand-in
  service passed to `MeghTest.getController`.
- **Other files** (a basic service or controller, config, middleware, mail,
  event, listener, queue, worker, task, DTO, class) get a test of what the
  template does. Replace it as you write the real code.

```ts [src/services/user.service.spec.ts]
describe('delete', () => {
  it('deletes the user', async () => {
    const existing = row();
    vi.spyOn(User, 'findOrFail').mockResolvedValue(existing as never);
    const remove = vi.spyOn(existing, 'delete').mockResolvedValue();

    await service.delete(1);
    expect(remove).toHaveBeenCalled();
  });
});
```

Skip the test with `--notest` (or `-nt`):

```sh
npx megh make:service user -nt
npx megh make:resource user --notest
npx megh scaffold:domain ecommerce --resource --notest
```

Running a generator again with `-f` keeps an existing test, unless it is
overwritten too (the review shows it first).

### make:test

`make:test` writes the test for a file that already exists, next to it:

```sh
npx megh make:test user.service        # src/services/user.service.spec.ts
npx megh make:test UserController      # src/controllers/user.controller.spec.ts
npx megh make:test user --type service # the same as user.service
npx megh m:t price-calculator          # finds src/**/price-calculator.ts
npx megh m:t checkout                  # nothing matches: src/tests/checkout.spec.ts
```

The kind comes from the name (`user.service`, `UserService`) or `--type`
(`service`, `controller`, `config`, `middleware`, `mail`, `event`, `listener`,
`queue`, `worker`, `task`, `dto`, `model` or `class`). Without one, it looks
for a file of that name anywhere under `src/`, and asks you to be more specific
when several match.

A resource service or controller is recognised and gets the full tests above.
Any other class gets a test that creates it (through the container for
services, controllers, middleware and the like) and a `it.todo()` for each of
its public methods:

```ts [src/utils/price-calculator.spec.ts]
import { describe, expect, it } from 'vitest';
import { PriceCalculator } from './price-calculator';

describe('PriceCalculator', () => {
  const priceCalculator = new PriceCalculator();

  it('should be defined', () => {
    expect(priceCalculator).toBeDefined();
  });

  it.todo('total()');

  it.todo('refresh()');
});
```

A name that matches no file gets a starter spec in `src/tests/`. An existing
spec is not replaced without `-f`.
