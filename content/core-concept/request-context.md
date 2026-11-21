---
title: Request Context
description: Per-request values (the user, a tenant, a transaction) readable anywhere in the request, without passing them through every call.
---

# Request Context

Services are singletons, so a service deep in the call chain can't see the
request it's working for. `requestContext` holds values for the request being
handled and makes them readable anywhere in its async call chain, such as
services, repositories and event listeners, without passing `req` through
every call. Each request gets its own values.

```ts
import { createContextKey, requestContext } from '@meghjs/core';

export const TENANT = createContextKey<string>('tenant');
```

Set a value early in the request, for example in middleware or an
authenticator:

```ts
@AppMiddleware
export class TenantMiddleware extends MeghMiddleware {
  invoke(req: IRequest) {
    requestContext.set(TENANT, String(req.headers['x-tenant']));
    return req;
  }
}
```

Read it wherever you need it:

```ts
@AppService
export class InvoiceService {
  list() {
    const tenant = requestContext.get(TENANT); // string | undefined
    // ...
  }
}
```

## The current user

After `useAuthentication()` resolves a user, it is on `requestContext.user`
as well as `req.user`. Use `getUser<T>()` for a typed value:

```ts
const user = requestContext.getUser<User>(); // User | undefined
```

It is `undefined` for anonymous requests, before authentication runs (in
middleware), and outside a request.

## API

| | |
|---|---|
| `createContextKey<T>(name)` | A typed key. Two keys with the same name are still different keys, so libraries can't clash. Plain strings work too, typed as you pass them. |
| `get(key)` | The value, or `undefined`. |
| `getOrThrow(key)` | The value; throws when it isn't set or outside a request. |
| `has(key)`, `delete(key)` | Check for or remove a value. |
| `set(key, value)` | Set a value for the rest of this request. Throws outside a request. |
| `user`, `getUser<T>()` | The authenticated user. |
| `requestId` | Same as `getRequestId()`. `undefined` when request IDs are off. |
| `active` | `true` inside a request or `run()`. |
| `run(fn, init?)` | Run `fn` in a fresh context, with optional `{ requestId, user, values }`. |

## What keeps the context

The context follows the request's async chain:

- awaited calls, promises and timers started in the request;
- event listeners, including `dispatch(event, { queue: true })` and delayed
  dispatches on the in-memory queue. Each queued event runs in the context it
  was dispatched in.

It does **not** cross process boundaries. BullMQ jobs run in a worker, so put
what the job needs (a tenant ID, a user ID) in the job data, and use `run()`
in the worker if the code you call reads the context:

```ts
@MeghWorker({ queue: 'invoices' })
export class InvoiceWorker extends MeghWorkerBase<{ tenant: string }> {
  private readonly invoices = inject(InvoiceService);

  process(job: Job<{ tenant: string }>) {
    return requestContext.run(() => this.invoices.generate(), {
      values: [[TENANT, job.data.tenant]],
    });
  }
}
```

Socket.IO handlers aren't requests either. They have their own context (see
[WebSocket](/microservices/websocket)).

## Tests and scripts

Code that reads the context works outside a request too: `get` returns
`undefined`. To give it values, wrap the call in `run()`:

```ts
const invoices = await requestContext.run(() => service.list(), {
  values: [[TENANT, 'acme']],
  user: { id: 1 },
});
```
