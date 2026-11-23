---
title: Relations
description: "MeghORM relations: hasMany, hasOne, belongsTo, belongsToMany, has-many-through and polymorphic relations, eager loading, relation queries and aggregates."
---

# Relations

Relations connect models. Declare them with decorators, then load them with `with()`, filter by them with `whereHas()` and count them with `withCount()`.

```ts
@Table()
class User extends Model {
  @PrimaryKey()
  @AutoIncrement()
  id?: number;

  @HasMany(() => Post)
  posts?: Post[]; // posts.user_id → users.id

  @HasOne(() => Profile)
  profile?: Profile | null; // profiles.user_id → users.id
}

@Table()
class Post extends Model {
  @PrimaryKey()
  @AutoIncrement()
  id?: number;

  @Column()
  user_id!: number;

  @BelongsTo(() => User, { foreignKey: 'user_id' })
  author?: User | null;
}
```

Type a relation field with the model it loads: `Post[]` for `@HasMany`,
`Profile | null` for `@HasOne` and `@BelongsTo`. The field is `undefined`
until the relation is loaded, so declare it with `?`. A field typed with a
model, or an array of models, is a relation rather than a column:
`create()` and `where()` leave it out, and `with('posts')` type-checks and
returns `Post[]`. The related class is passed as a function, so models can
refer to each other in any order, even from files that import each other.

::: warning Circular imports in ES module builds
Keep the `| null` on `@HasOne` and `@BelongsTo` fields, or use the
`HasOne<Profile>` / `BelongsTo<User>` types. A field typed with the bare model
(`author?: User`) makes TypeScript's decorator metadata read `User` while its
file is still loading. When two models import each other, an app compiled to
ES modules then fails on startup with
`ReferenceError: Cannot access 'User' before initialization`. CommonJS builds
are not affected, and `Post[]` fields are always fine.
:::

Each decorator also has a field type of the same name (`posts?: HasMany<Post>`,
`author?: BelongsTo<User>`), which works the same way. Many-to-many keeps
its `BelongsToMany<Role, Pivot>` type, because a plain `Role[]` can't carry the
pivot columns or `attach()` / `detach()` ([below](#many-to-many)).

Key defaults:

| Relation | Foreign key default | Options |
|---|---|---|
| `@HasMany(() => Post)` | `<owner class>_id` on the related table, e.g. `user_id` | `foreignKey`, `localKey` |
| `@HasOne(() => Profile)` | same as `HasMany` | `foreignKey`, `localKey` |
| `@BelongsTo(() => User)` | `<field name>_id` on this table, e.g. `author_id` | `foreignKey`, `ownerKey` |

## Eager loading

Load relations with `with()`. Use dots for nested relations:

```ts
const users = await User.with('posts.comments', 'profile').get();

users[0].posts;          // Post[]
users[0].profile;        // Profile | null
users[0].posts[0].author; // compile error: not loaded
```

Each relation level is one query, however many rows there are:

```sql
select * from users
select * from posts where user_id in (?, ?)
select * from comments where post_id in (?, ?, ?)
select * from profiles where user_id in (?, ?)
```

### Constraining eager loads

Pass a callback to shape a relation's query. It gets the related model's
query, so `select()`, `where()`, `orderBy()`, `limit()`, `withTrashed()`,
`whereHas()`, `withCount()` and nested `with()` all work:

```ts
const todos = await Todo.with('user', (q) => q.select('name', 'role')).paginate();

todos.data[0].title;          // every todo column
todos.data[0].user?.name;     // string
todos.data[0].user?.password; // compile error: not selected
```

```sql
select * from todos limit ? offset ?
select name, role, id from users where id in (?, ?)
```

`select()` adds the keys the loader matches rows by, here `users.id`. A
`hasMany` relation keeps its foreign key the same way.

`limit()` and `offset()` apply to each parent's rows, not to the total. This
loads the three latest published posts of every user:

```ts
await User.with('posts', (q) =>
  q.where('published', true).orderBy('created_at', 'desc').limit(3),
).get();
```

It runs as one query, numbering each user's posts with
`row_number() over (partition by user_id order by created_at desc)`. That
needs window functions: SQLite 3.25+, MySQL 8+, PostgreSQL or SQL Server.

A dotted path constrains its last relation. The relations before it load in
full:

```ts
// Every post, each with only its approved comments.
await User.with('posts.comments', (q) => q.where('approved', true)).get();
```

To constrain several relations, pass an object:

```ts
await User.with({
  posts: (q) => q.select('id', 'title').orderBy('id', 'desc'),
  profile: (q) => q.select('avatar'),
}).get();
```

## Querying by relation

`whereHas()` keeps rows that have a related row; `whereDoesntHave()` keeps
those that don't. Narrow the related rows with a callback, and follow nested
relations with dots:

```ts
await User.whereHas('posts').get();
await User.whereHas('posts', (q) => q.where('published', true)).get();
await User.whereHas('posts.comments', (q) => q.where('body', 'like', '%megh%')).get();
await User.whereDoesntHave('roles').delete();
await User.whereHas('posts').orWhereHas('comments').get(); // either one
```

Each one runs as an `EXISTS` subquery, so it works with `count()`,
`paginate()`, `update()` and `delete()` too. Soft-deleted related rows don't
count.

## Counting related rows

`withCount()` adds a `<relation>_count` number to each result, without loading
the rows:

```ts
const users = await User.withCount('posts', 'roles').get();
users[0].posts_count; // number

await User.query().withCount('posts', (q) => q.where('published', true)).get();
```

Sums, averages, minimums, maximums and existence work the same way. Each
takes a constraint as its last argument:

```ts
const users = await User.query()
  .withSum('orders', 'total')     // orders_sum_total: number | null
  .withAvg('orders', 'total')     // orders_avg_total
  .withMin('orders', 'placed_at') // orders_min_placed_at, typed like the column
  .withMax('orders', 'placed_at')
  .withExists('subscription')     // subscription_exists: boolean
  .get();

await User.query().withSum('orders', 'total', (q) => q.where('status', 'paid')).get();
```

A sum, average, minimum or maximum is `null` when there are no related rows.

Counts and aggregates appear in JSON but are never written back by `save()`.

## Creating related rows

`related()` on a `hasMany`, `hasOne`, `morphMany` or `morphOne` relation
creates rows with the foreign key (and type) already set. On a `belongsTo` it
throws, since this row holds the key:

```ts
const post = await user.related('posts').create({ title: 'Hello' }); // user_id set
await user.related('posts').createMany([{ title: 'A' }, { title: 'B' }]);
await user.related('posts').save(existingPost);  // moves it to this user
await user.related('posts').query().where('published', true).get();
const profile = await user.related('profile').get(); // Profile | null
```

`related('posts').query()` keeps its link to the user apart from your
conditions, so an `orWhere()` there can't reach other users' posts.

## Has many through

A relation through an intermediate model. A country has many posts through
its users:

```ts
class Country extends Model {
  static readonly table = 'countries';
  id: number;

  // countries.id → users.country_id, users.id → posts.user_id
  posts = hasManyThrough(() => Post, () => User);
  latestPost = hasOneThrough(() => Post, () => User);
}

const countries = await Country.with('posts', (q) => q.orderBy('id', 'desc').limit(5)).get();
await Country.whereHas('posts', (q) => q.where('published', true)).get();
await Country.query().withCount('posts').get();
```

The keys default to `<this class>_id` on the intermediate table and
`<intermediate class>_id` on the related one. Override them with
`{ firstKey, secondKey, localKey, secondLocalKey }`. Soft-deleted intermediate
rows don't link anything. With decorators, use `@HasManyThrough(() => Post, () => User)`
and `@HasOneThrough`.

## Polymorphic relations

One table can belong to several others. Comments on both posts and videos
hold the owner's key and its type:

```ts
class Post extends Model {
  static readonly table = 'posts';
  id: number;
  comments = morphMany(() => Comment, 'commentable');
}

class Video extends Model {
  static readonly table = 'videos';
  static readonly morphType = 'video'; // stored type; defaults to the table name
  id: number;
  comments = morphMany(() => Comment, 'commentable');
  thumbnail = morphOne(() => Image, 'imageable');
}

class Comment extends Model {
  static readonly table = 'comments';
  id: number;
  commentable_id: number;
  commentable_type: string; // 'posts' or 'video'
  body: string;

  commentable = morphTo(() => [Post, Video]); // Post | Video | null
}
```

```ts
await Post.with('comments').withCount('comments').get();
await Post.whereHas('comments', (q) => q.where('body', 'like', '%megh%')).get();
await post.related('comments').create({ body: 'Nice' }); // id and type set

const comments = await Comment.with('commentable').get(); // one query per type
if (comments[0].commentable instanceof Video) {
  // …
}
```

The columns are `<name>_id` and `<name>_type`. `morphTo` loads each owner
type in one query. A type that none of its targets has throws. `whereHas()`
and the aggregates don't support `morphTo`. Filter on `<name>_type` and
`<name>_id` instead. With decorators, use `@MorphMany(() => Comment, 'commentable')`,
`@MorphOne` and `@MorphTo(() => [Post, Video])`.

## Many-to-many

```ts
@Table()
class User extends Model {
  @PrimaryKey()
  @AutoIncrement()
  id?: number;

  @BelongsToMany(() => Role, { pivotColumns: ['granted_by'] })
  roles?: BelongsToMany<Role, { granted_by: string | null }>;
}
```

Type many-to-many fields with `BelongsToMany<Role, Pivot>`, not `Role[]`: the
second argument types each loaded role's `pivot`, and the type tells
`related('roles')` to offer `attach()`, `detach()` and `sync()`.

The pivot table defaults to both snake_case class names, sorted and joined:
`role_user`, with the columns `user_id` and `role_id`. Override any of these
with options:

```ts
@BelongsToMany(() => Role, {
  table: 'user_roles',
  foreignPivotKey: 'member_id',
  relatedPivotKey: 'role_id',
})
roles!: BelongsToMany<Role>;
```

Loaded models carry their pivot row in `pivot`, which also appears in JSON:

```ts
const user = await User.with('roles').firstOrFail();
user.roles[0].pivot.granted_by; // string | null
```

Change the links through `related()`:

```ts
await user.related('roles').attach([adminRole, 3], { granted_by: 'root' }); // models or keys
await user.related('roles').detach(adminRole);  // or detach() for all
await user.related('roles').sync([1, 2]);       // → { attached, detached }, in one transaction
const roles = await user.related('roles').get();
```
