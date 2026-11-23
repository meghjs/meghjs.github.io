---
title: Queries
description: "Reading and writing rows with MeghORM models: where clauses, joins, aggregates, scopes, pagination, large results, locks, upserts, writes and transactions."
---

# Queries

Models read and write rows through typed queries. Column names and values are checked against the model, and results are model instances.

## Querying

```ts
await User.all();
await User.find(1);              // User | undefined
await User.findOrFail(1);        // throws a 404 NotFoundException if missing
await User.findBy('email', 'ann@acme.io');       // first match, or undefined
await User.findBy({ email: 'ann@acme.io', active: true });
await User.findByOrFail('email', 'ann@acme.io'); // or a 404

await User.where('email', 'ann@acme.io').first();
await User.where('id', '>', 10).orderBy('name', 'desc').limit(10).offset(20).get();
await User.where('name', null).get();          // IS NULL
await User.query().whereIn('id', [1, 2, 3]).get();
await User.query().whereNotNull('name').count();
await User.where('email', 'ann@acme.io').exists();
```

`User.where()`, `User.with()`, `User.whereHas()`, `User.withCount()` and
`User.scope()` start a query; `User.query()` starts an empty one. Nothing runs
until `get()`, `first()`, `firstOrFail()`, `count()`, `exists()`, an aggregate,
a paginate method, `update()` or `delete()` is called.

### Conditions

| | |
|---|---|
| `where('role', 'admin')`, `where('age', '>=', 18)` | `null` becomes `IS NULL` |
| `orWhere(...)` | Same forms, joined with `or` |
| `whereIn`, `whereNotIn`, `orWhereIn` | A list, or a subquery ([below](#subqueries)) |
| `whereNull`, `whereNotNull`, `orWhereNull`, `orWhereNotNull` | |
| `whereBetween('age', [18, 65])`, `whereNotBetween` | Both ends included |
| `whereColumn('updated_at', '>', 'created_at')` | Compare two columns |
| `whereRaw('lower(email) = ?', [email])`, `orWhereRaw` | SQL with `?` placeholders |
| `whereExists(query)`, `whereNotExists(query)` | |
| `whereHas`, `orWhereHas`, `whereDoesntHave` | By relation, see [Relations](/advanced/orm/relations#querying-by-relation) |

As in SQL, `and` binds tighter than `or`: `.where(a).orWhere(b).where(c)`
means `a or (b and c)`. A query's own conditions are kept in one group, so
an `orWhere()` never widens the soft-delete scope, a
[global scope](#global-scopes) or a relation query's link to its parent:

```ts
await User.where('role', 'admin').orWhere('role', 'owner').get();
// where (role = ? or role = ?) and deleted_at is null
```

Pass a callback for anything else Kysely can express:

```ts
await User.where((eb) => eb.or([eb('role', '=', 'admin'), eb('id', '=', 1)])).get();
```

`when()` applies a part of the query only when a value is set, such as an
optional filter from a request:

```ts
await Post.query()
  .when(search, (q, term) => q.where('title', 'like', `%${term}%`))
  .when(authorId, (q, id) => q.where('user_id', id))
  .get();
```

### Subqueries

`whereIn()` and `whereExists()` take a model query or a
[`DB.table()`](/advanced/orm/query-builder) query:

```ts
const authors = DB.table('posts').select('user_id').where('views', '>', 1000);
await User.query().whereIn('id', authors).get();

await User.query()
  .whereExists(DB.table('bans').whereColumn('bans.user_id', '=', 'users.id'))
  .count();
```

### Ordering

```ts
await Post.query().orderBy('published_on', 'desc').get();
await Post.query().orderBy('published_on', 'desc', 'last').get(); // NULLs last
await Post.query().latest().get();   // created_at desc
await Post.query().oldest('id').get();
```

The third argument puts NULLs `'first'` or `'last'` on every database. It is
written as `case when … is null`, because MySQL and SQL Server have no
`NULLS FIRST` / `NULLS LAST`.

### Selecting, grouping and joining

`select()` fetches only some columns, and the result type narrows to them:

```ts
const rows = await User.query().select('id', 'email').get();
rows[0].email; // string
rows[0].name;  // compile error
```

`selectRaw()` adds an expression, named with `as`. Type it with a generic.
It appears on each result and in JSON, but `save()` never writes it:

```ts
const lines = await OrderLine.query()
  .selectRaw<{ total: number }>('price * quantity as total')
  .get();
lines[0].total; // number
```

```ts
// one column, cast, of every row or of the first
const emails = await User.query().orderBy('id').pluck('email'); // string[]
const name = await User.where('id', 1).value('name');           // string | null | undefined

// grouping: results are models holding the selected columns
const totals = await Post.query()
  .select('user_id')
  .selectRaw<{ views: number }>('sum(views) as views')
  .groupBy('user_id')
  .having('user_id', '<', 100)
  .get();

await Post.query().select('user_id').distinct().count(); // counts the distinct rows
await Post.query().distinctOn('user_id').orderBy('user_id').get(); // PostgreSQL only

// rows of two queries on the same model
await User.where('role', 'admin').union(User.where('score', '>', 90)).orderBy('name').get();
```

`join()`, `leftJoin()` and `rightJoin()` filter or sort by another table.
Results are still this model's rows, with only its columns. Name other
tables' columns in full:

```ts
await Post.query()
  .join('users', 'users.id', 'posts.user_id')
  .where('users.active', true)
  .orderBy('users.name')
  .get();
```

A query with joins can't `update()` or `delete()`. Filter those with
`whereHas()` or `whereIn()` instead.

`toSQL()` returns the SQL and parameters `get()` would run.

### Aggregates

```ts
await Post.count();
await Post.sum('views');                         // 0 when no rows match
await Post.where('user_id', 1).avg('views');     // null when no rows match
await Post.min('published_on');                  // casts apply: a Date here
await Post.max('views');
```

Aggregates respect filters and soft deletes, like every other query.

### Scopes

A scope is a reusable piece of a query, typed for its model:

```ts
import type { Scope } from '@meghjs/core';

const published: Scope<Post> = (q) => q.whereNotNull('published_on');
const byAuthor: Scope<Post, [number]> = (q, userId) => q.where('user_id', userId);

await Post.scope(published).scope(byAuthor, 1).orderBy('id').get();
```

### Global scopes

A global scope filters every query on its model: `find()`, counts,
updates, and relation queries such as `with()`, `whereHas()` and
`withCount()`. Declare them by name:

```ts
import { Model, type ModelQuery } from '@meghjs/core';

class Post extends Model {
  static readonly table = 'posts';
  static readonly globalScopes = {
    published: (q: ModelQuery<Post>) => q.whereNotNull('published_on'),
    tenant: (q: ModelQuery<Post>) => q.where('tenant_id', currentTenant()),
  };
  // …
}

await Post.count();                                  // published, this tenant
await Post.withoutGlobalScope('published').count();  // drafts too
await Post.withoutGlobalScopes().count();            // every row
await Post.query().withoutGlobalScopes(['tenant']).get();
```

Only a scope's `where` conditions apply. They run each time a query is built,
so `currentTenant()` above can read the current request.

### Pagination

`paginate()` returns the same `{ data, meta }` shape as the rest of Megh:

```ts
const page = await Post.query().orderBy('id').paginate({ page: 2, perPage: 20 });
// page.meta → { total, page, perPage, lastPage, next, prev }
await Post.paginate({ page: 1 }); // every row
```

`simplePaginate()` skips the `count(*)` query, which is costly on large
tables. It fetches one extra row to tell whether another page follows:

```ts
const page = await Post.query().simplePaginate({ page: 2, perPage: 20 });
// page.meta → { page, perPage, hasMore, next, prev }
```

`cursorPaginate()` pages by key instead of by offset. Pages stay stable when
rows are inserted, and deep pages are as fast as the first. Pass the returned
`nextCursor` back to get the next page:

```ts
const first = await Post.where('published', true).cursorPaginate({ perPage: 20 });
const next = await Post.where('published', true).cursorPaginate({
  perPage: 20,
  cursor: first.meta.nextCursor, // null on the last page
});
// meta → { perPage, hasMore, nextCursor }
```

It orders by the primary key by default; pass `column` (it must be unique)
and `direction: 'desc'` to change that. An invalid cursor throws a 400
`BadRequestException`.

### Large results

`get()` loads every matching row into memory. For big tables, read them a
part at a time:

```ts
// 500 at a time, by primary key; return false to stop
await User.where('active', true).chunk(500, async (users, page) => {
  for (const user of users) await mailer.send(user);
});

// one at a time, fetched 1000 at a time, relations included
for await (const user of User.with('posts').lazy()) {
  // …
}

// rows as the database sends them
for await (const user of User.query().stream()) {
  // …
}
```

`chunk()` and `lazy()` page by primary key (`where id > last`), so they stay
correct when the callback updates or deletes the rows it reads. They don't
take an `orderBy()`; use `cursorPaginate()` to page in another order.
`stream()` holds a connection while it runs and can't eager-load relations
(use `lazy()` for that).

### Cancelling queries

`abortSignal()` stops a query when its signal aborts, for example after a
timeout or when the client disconnects. Eager loads under it stop too:

```ts
await Report.query().abortSignal(AbortSignal.timeout(5_000)).get();

const controller = new AbortController();
await Report.query().abortSignal(controller.signal, 'cancel query').get();
```

By default (`'ignore query'`) the query stops being waited for, but the
database finishes it. `'cancel query'` also cancels it on the database
(PostgreSQL, MySQL and SQL Server).

### Locking rows

Inside a transaction, `lockForUpdate()` locks the selected rows until the
transaction ends, so no one else can change them in between:

```ts
await Model.transaction(async () => {
  const account = await Account.where('id', id).lockForUpdate().firstOrFail();
  account.balance -= amount;
  await account.save();
});

// a job queue: take the next free job, skipping those other workers hold
const job = await Job.where('status', 'pending')
  .orderBy('id')
  .lockForUpdate()
  .skipLocked()
  .first();
```

`sharedLock()` (`FOR SHARE`) lets others read the rows but not change them.
`noWait()` fails at once instead of waiting for a locked row. `skipLocked()`
and `noWait()` need PostgreSQL or MySQL 8. On SQLite, which locks the whole
database for a write, locks do nothing. SQL Server isn't supported and
throws.

### Paging on SQL Server

SQL Server has no `LIMIT`, so on SQL Server `limit()` becomes `select top(n)`
and `offset()` becomes `offset … rows fetch next … rows only`. SQL Server only
allows an offset after an `ORDER BY`, so a query with an offset but no
`orderBy()` gets `order by (select null)`, and its row order is not
guaranteed. Add an `orderBy()` when paging so pages stay stable.

## Creating, updating and deleting

```ts
// insert and return the stored row (generated columns included)
const user = await User.create({ email: 'ann@acme.io' }); // id generated, name nullable → optional

// or build an instance and save it
const bob = new User().fill({ email: 'bob@acme.io', name: 'Bob' });
await bob.save();

// save() updates only the columns that changed, and does nothing if none did
bob.name = 'Robert';
await bob.save(); // UPDATE users SET name = ? WHERE id = ?

await bob.delete();

// many rows at once; both return the number of rows affected
await Post.where('user_id', 1).update({ published: true });
await Post.where('published', false).delete();
```

`create()`'s argument is typed from the model: required columns must be
present, and generated, nullable and timestamp columns may be left out.

### Finding or creating

```ts
// the first match, or a new unsaved instance
const user = await User.firstOrNew({ email }, { name: 'Ann' });

// the first match, or a new saved row
const tag = await Tag.firstOrCreate({ slug: 'orm' }, { name: 'ORM' });

// update the first match, or create one (in a transaction)
await Setting.updateOrCreate({ key: 'theme' }, { value: 'dark' });
```

### Many rows

```ts
// one create() per row, in a transaction: events fire, rows come back
const posts = await Post.createMany([{ title: 'A' }, { title: 'B' }]);

// as few statements as possible: casts and timestamps, no events, no rows back
await Post.insert(rows);

// insert, or update the rows whose sku already exists
await Price.upsert(
  [{ sku: 'A1', amount: 10 }, { sku: 'B2', amount: 20 }],
  'sku',                 // unique column(s) to match by
  ['amount'],            // columns to update; default: every given column but the keys
);
```

`upsert()` runs as `ON CONFLICT … DO UPDATE` on PostgreSQL and SQLite,
`ON DUPLICATE KEY UPDATE` on MySQL and `MERGE` on SQL Server. The match
columns need a unique index, except on SQL Server. MySQL matches on any of the
table's unique indexes, whatever `uniqueBy` says. `created_at` is set on
insert and kept on update. It returns the database's count of affected rows,
in which MySQL counts an update as 2.

### Increments

`increment()` and `decrement()` change a number in one statement
(`set views = views + 1`), so concurrent requests don't overwrite each other:

```ts
await Post.where('id', 1).increment('views');
await Product.where('sku', 'A1').decrement('stock', 3, { restocked: false });
await post.increment('views');  // the row and the instance
```

## Transactions

```ts
await Model.transaction(async () => {
  const user = await User.create({ email: 'ann@acme.io' });
  await Profile.create({ user_id: user.id, bio: '' });
});
```

Every model query inside the callback uses the transaction, even in functions
it calls. The transaction commits when the callback resolves and rolls back if
it throws.

A nested `Model.transaction()` runs in a savepoint. If it throws, only its own
work is rolled back, and the error still reaches the caller:

```ts
await Model.transaction(async () => {
  await Order.create({ total: 10 });
  try {
    await Model.transaction(async () => {
      await Invoice.create({ order_id: 1 });
      throw new Error('mailer down');
    });
  } catch {
    // the invoice is gone, the order is kept
  }
});
```

If the outer transaction rolls back, so does everything nested inside it.
