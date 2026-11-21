---
title: WebSocket
description: Realtime communication with Socket.IO.
---

# WebSocket

Megh's realtime layer is built on [Socket.IO](https://socket.io). It and its
Fastify adapter are optional peer dependencies:

```sh
npm i socket.io fastify-socket.io
```

## Enabling websockets

Call `useSocketIo` during app setup. Options are passed straight through to the
Socket.IO server.

```ts [app.ts]
import { Megh } from '@meghjs/core';
import { ChatSubscriber } from './subscribers/chat.subscriber';

const app = Megh.createApplication();

app.useSocketIo({
  cors: { origin: '*' },
});

export default app;
```

The server is created when the app runs; connecting clients are wired to your
subscribers automatically.

## Subscribing to events

Mark any service method with `@Subscribe('event')` to handle an incoming
client event. The class must be registered with the container — `@AppService`
does that.

```ts [subscribers/chat.subscriber.ts]
import { AppService, Subscribe } from '@meghjs/core';

@AppService
export class ChatSubscriber {
  @Subscribe('message')
  onMessage(payload: { room: string; text: string }) {
    console.log(`[${payload.room}] ${payload.text}`);
  }

  @Subscribe('typing')
  onTyping(payload: { user: string }) {
    console.log(`${payload.user} is typing`);
  }
}
```

Handlers run inside a socket context, so the originating socket is available
through `SocketContextService` for the duration of the call.

## Emitting to clients

Inject `SocketEventDispatcher` to push events out:

```ts [services/chat.service.ts]
import { AppService, SocketEventDispatcher } from '@meghjs/core';

@AppService
export class ChatService {
  constructor(private readonly socket: SocketEventDispatcher) {}

  async announce(text: string) {
    await this.socket.dispatch('announcement', { text });
  }

  async toRoom(room: string, text: string) {
    await this.socket.dispatch('message', { text }, { room });
  }

  async toEveryoneElse(room: string, text: string) {
    // skips the socket that triggered the current handler
    await this.socket.dispatch('message', { text }, { room, broadcast: true });
  }
}
```

`dispatch` accepts:

| Option | Description |
|--------|-------------|
| `room` | Emit only to this room |
| `broadcast` | Exclude the current socket |
| `transports` | Defaults to `['socket']`, the only transport in 1.0. Any other value throws. |
| `retry` | Attempts on failure |
| `retryDelay` | Base delay in ms; backs off per attempt |

## Authentication

With `app.useAuthentication(Handler)` registered, the same handler runs once
on each Socket.IO handshake. What it returns becomes `socket.data.user`:

- a user: the socket is connected as that user;
- `null` or `undefined`: the socket connects as a guest, and
  `@PrivateChannel` listeners ignore it;
- a thrown error: the connection is refused, and the client's
  `connect_error` has the message `Unauthorized`.

The handler gets a request-shaped object: the handshake `headers`, `query`,
`auth` and `ip`. Browsers can't set headers on a WebSocket, so a token sent
as `auth.token` arrives as `authorization: Bearer <token>`, and a handler
that reads the HTTP header works unchanged:

```ts [client]
const socket = io('https://api.example.com', { auth: { token } });
```

## Private channels

`@PrivateChannel` restricts a subscriber method to a channel derived from the
connecting socket — use it for per-user streams. Its listeners only run for
sockets with a `socket.data.user`:

```ts
import { AppService, Subscribe, PrivateChannel } from '@meghjs/core';

@AppService
export class NotificationSubscriber {
  @PrivateChannel((socket) => `user:${socket.handshake.auth.userId}`)
  @Subscribe('notify')
  onNotify(payload: unknown) {
    // only reachable on the caller's own channel
  }
}
```

## Reaching the raw server

For anything the helpers do not cover, resolve the Socket.IO `Server` itself:

```ts
import { MeghContainer, SocketIoServer } from '@meghjs/core';

const io = MeghContainer.get(SocketIoServer);
io.emit('ping', Date.now());
```

::: warning
`SocketIoServer` is only registered once the app is running and websockets are
enabled. Resolving it during module load will fail.
:::

Resolve services through `MeghContainer`. Megh has its own container and no
longer installs `typedi`.

## Broadcasting events

The [event system](/advanced/events) can forward a dispatched event to Socket.IO,
which keeps domain events and realtime delivery in one place:

```ts
await dispatcher.dispatch(new UserCreatedEvent({ userId, name }), {
  broadcast: { type: 'socket', channel: 'user:create' },
});
```
