---
title: Query Builder
description: The DB query builder and raw SQL in MeghORM, for queries that don't map to a model.
---

# Query Builder

For queries that don't fit a model, such as reports, bulk updates, or tables
without a model, use `DB.table()`:

```ts
import { DB } from '@meghjs/core';

const top = await DB.table('orders')
  .select('customer_id')
  .selectRaw('sum(total) as revenue')
  .where('status', 'paid')
  .whereBetween('created_at', [from, to])
  .groupBy('customer_id')
  .orderBy('revenue', 'desc')
  .limit(10)
  .get();
```

Rows are plain objects. Type them with `DB.table<{ id: number; email: string }>('users')`.
Values are always sent as parameters, never written into the SQL.

**Conditions**

| | |
|---|---|
| `where('status', 'paid')`, `where('total', '>', 100)` | Operators: `=`, `!=`, `<>`, `<`, `<=`, `>`, `>=`, `like`, `not like`, `ilike`, `in`, `not in`, `is`, `is not` |
| `where({ status: 'paid', currency: 'EUR' })` | Every column equal |
| `where((q) => q.where('a', 1).orWhere('b', 2))` | A group in parentheses |
| `orWhere(...)` | Same forms, joined with `or` |
| `whereIn`, `whereNotIn`, `orWhereIn` | A list, or a subquery: `whereIn('id', DB.table('bans').select('user_id'))`. An empty list matches nothing (`whereIn`) or everything (`whereNotIn`) |
| `whereExists(query)`, `whereNotExists(query)` | `whereExists(DB.table('bans').whereColumn('bans.user_id', '=', 'users.id'))` |
| `whereNull`, `whereNotNull`, `orWhereNull`, `orWhereNotNull` | |
| `whereBetween`, `whereNotBetween` | `whereBetween('age', [18, 65])` |
| `whereColumn('updated_at', '>', 'created_at')` | Compare two columns |
| `whereRaw('lower(email) = ?', [email])`, `orWhereRaw` | SQL with `?` placeholders |
| `when(value, (q, value) => …, otherwise?)` | Apply a part of the query only when `value` is set |

`where('x', null)` becomes `x is null`. As in SQL, `and` binds tighter than
`or`: `.where(a).orWhere(b).where(c)` means `a or (b and c)`.

**Shaping the result**

| | |
|---|---|
| `select('id', 'users.email as contact', 'orders.*')`, `selectRaw(sql, bindings?)`, `distinct()`, `distinctOn(...columns)` | Columns. All columns by default. `distinctOn` is PostgreSQL only |
| `join(table, left, right)`, `join(table, left, op, right)`, `leftJoin`, `rightJoin` | `join('users', 'users.id', 'orders.user_id')` |
| `orderBy(column, 'asc' \| 'desc', nulls?)`, `orderByDesc`, `orderByRaw`, `latest(column = 'created_at')`, `oldest` | `nulls`: `'first'` or `'last'`, on every database |
| `union(query)`, `unionAll(query)` | Add another query's rows |
| `withExpression(name, query)`, `withRecursiveExpression(name, anchor, recursive)` | Common table expressions, see **Trees and CTEs** below |
| `lockForUpdate()`, `sharedLock()`, `skipLocked()`, `noWait()` | Row locks, as on [model queries](/advanced/orm/queries#locking-rows) |
| `abortSignal(signal, strategy?)` | Stop when `signal` aborts, as on [model queries](/advanced/orm/queries#cancelling-queries) |
| `groupBy(...columns)`, `having(column, op, value)`, `havingRaw` | |
| `limit` / `take`, `offset` / `skip`, `forPage(page, perPage)` | |

**Reading**

| | |
|---|---|
| `get()` | Every row |
| `first()`, `firstOrFail()` | The first row, `undefined` or a 404 `NotFoundException` |
| `value(column)`, `pluck(column)` | One column of the first row, or of every row |
| `exists()`, `doesntExist()` | |
| `count(column?)`, `sum`, `avg`, `min`, `max` | Grouped and distinct queries count their rows |
| `paginate({ page, perPage })` | `{ data, meta: { total, page, perPage, lastPage, next, prev } }` |
| `chunkById(size, fn, column = 'id')` | `size` rows at a time, paged by a unique column; `fn` returns `false` to stop |
| `stream(chunkSize?)` | `for await (const row of query.stream())`: rows as the database sends them |

**Writing**

```ts
await DB.table('tags').insert([{ name: 'ts' }, { name: 'node' }]);
const id = await DB.table('tags').insertGetId({ name: 'orm' });
const updated = await DB.table('orders').where('status', 'new').update({ status: 'paid' }); // rows changed
await DB.table('posts').where('id', 1).increment('views');
await DB.table('carts').where('updated_at', '<', cutoff).delete();
```

Objects are stored as JSON. A column a row leaves out gets its database
default, even in a multi-row insert.

`upsert(rows, uniqueBy, update?)` inserts rows, or updates those whose
`uniqueBy` columns match an existing row. It runs as `ON CONFLICT`,
`ON DUPLICATE KEY UPDATE` or `MERGE`, depending on the database. See
[Many rows](/advanced/orm/queries#many-rows).

```ts
await DB.table('stock').upsert([{ sku: 'A1', qty: 5 }], 'sku', ['qty']);
```

**Trees and CTEs**

`withRecursiveExpression()` walks trees and graphs in one query. The anchor
query picks the starting rows, and the recursive one joins the expression's
own name to find the next level:

```ts
const subtree = await DB.table('tree')
  .withRecursiveExpression(
    'tree',
    DB.table('categories').where('id', rootId),
    DB.table('categories')
      .select('categories.*')
      .join('tree', 'tree.id', 'categories.parent_id'),
  )
  .get();

// as a subquery for models
const ids = DB.table('tree').withRecursiveExpression('tree', anchor, recursive).select('id');
const categories = await Category.query().whereIn('id', ids).get();
```

`withExpression(name, query)` adds a plain `with name as (…)`. On SQL Server,
whose expressions recurse without the keyword, `WITH RECURSIVE` is written as
`WITH`.

**Raw SQL and transactions**

```ts
const rows = await DB.select('select * from users where email = ?', [email]);
const changed = await DB.statement('update users set active = ? where last_seen < ?', [false, cutoff]);

await DB.transaction(async () => {
  await DB.table('accounts').where('id', from).decrement('balance', amount);
  await DB.table('accounts').where('id', to).increment('balance', amount);
});
```

`DB.transaction()` is the same transaction as `Model.transaction()`: model
queries and `DB` queries inside it share it, and nested calls run in a
savepoint. `toSQL()` on a query returns the SQL and parameters it would run,
and `clone()` copies a query so you can build on it.

## Raw queries

For full control, `Model.db()` returns the Kysely instance underneath (the
transaction, inside `Model.transaction()`). Type it from your models with
`DatabaseOf`:

```ts
import { Model, type DatabaseOf } from '@meghjs/core';

type DB = DatabaseOf<typeof User | typeof Post>;

const rows = await Model.db<DB>()
  .selectFrom('posts')
  .innerJoin('users', 'users.id', 'posts.user_id')
  .select(['posts.title', 'users.email'])
  .execute(); // { title: string; email: string }[]
```

The connection is also registered in the container under `ORM_CONNECTION`:

```ts
import { MeghContainer, ORM_CONNECTION } from '@meghjs/core';

const db = MeghContainer.get(ORM_CONNECTION); // Kysely<any>
```
