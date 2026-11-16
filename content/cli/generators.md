---
title: Generators
description: Generating resources, controllers, services, models, middleware and config classes with the Megh CLI.
---

# Generators

The `make:*` commands write new files from templates. Models are read from your migrations, and `make:resource` writes a complete REST API for a model. Every `make:*` command takes `-f` / `--force` to overwrite an existing file.

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

::: info Before 0.6.2
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
uses its repository and no DTOs are generated.

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
model. To use a [TypeORM](/advanced/database) repository instead, add `--orm`.

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

To use a [TypeORM](/advanced/database) repository instead, add `--orm`:

```sh
npx megh make:service user -m user -r --orm
```

## Model

```sh
# Megh ORM model
npx megh make:model user
npx megh make:model user --table app_users   # table name other than "users"

# TypeORM entity (with @meghjs/data)
npx megh m:m user --orm
```

`make:model` writes a [Megh ORM](/advanced/orm) model. It looks for the
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

To write the migration too, start from a template or a list of fields; see
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
0.6.2; that name (and `u:m`) still works.

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
`static table` and `static casts`, regenerate it with `make:model --force`.
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
