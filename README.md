# baileys-keep-alive

[![npm](https://img.shields.io/npm/v/baileys-keep-alive)](https://www.npmjs.com/package/baileys-keep-alive)
[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Sister: baileys-antiban](https://img.shields.io/badge/sister-baileys--antiban-25D366)](https://github.com/kobie3717/baileys-antiban)

Automatic reconnect, heartbeat, and QR-stale detection for [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) connections. Sister library to [baileys-antiban](https://github.com/kobie3717/baileys-antiban).

## What it does

Drop-in connection lifecycle manager for Baileys:

- **Auto-reconnect** on close with exponential backoff + jitter
- **Reason-aware** — gives up on `loggedOut`, retries everything else
- **Heartbeat** — keeps session warm with periodic presence updates
- **QR-stale detection** — alerts when QR sits unscanned beyond threshold
- **Alert hooks** — wire into Sentry, Telegram, Discord (no hard deps)

## What it doesn't do

- Not anti-ban (that's [baileys-antiban](https://github.com/kobie3717/baileys-antiban)'s job)
- Not session storage (use [WaSP](https://github.com/kobie3717/wasp-protocol) or `useMultiFileAuthState`)
- Not multi-tenant orchestration (deliberately scoped to ONE socket)
- Not opinionated about logger (accepts any `{ info, warn, error }`)

## Install

```bash
npm install baileys-keep-alive @whiskeysockets/baileys
```

## Quick Start

```ts
import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { keepAlive } from 'baileys-keep-alive';

const { state, saveCreds } = await useMultiFileAuthState('auth_info');

const sock = makeWASocket({
  auth: state,
  printQRInTerminal: true,
});

sock.ev.on('creds.update', saveCreds);

const ka = keepAlive(sock, {
  reconnectFactory: async () => {
    return makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });
  },
});

// ka.stop() to dispose
```

## Options

```ts
keepAlive(sock, {
  // Reconnect config
  reconnect?: {
    enabled?: boolean;          // default: true
    initialDelayMs?: number;    // default: 1000
    maxDelayMs?: number;        // default: 60_000
    factor?: number;            // default: 2
    jitterMs?: number;          // default: 500
    maxRetries?: number;        // default: Infinity
  };

  // Heartbeat config
  heartbeat?: {
    enabled?: boolean;          // default: true
    intervalMs?: number;        // default: 30_000
    presence?: 'available' | 'unavailable'; // default: 'available'
  };

  // QR-stale config
  qr?: {
    staleAfterMs?: number;      // default: 60_000
  };

  // Alert hooks (all optional, sync or async)
  onReconnect?: (attempt: number, delayMs: number) => void | Promise<void>;
  onReconnectFailed?: (err: Error, attempt: number) => void | Promise<void>;
  onMaxRetries?: (totalAttempts: number) => void | Promise<void>;
  onQRStale?: (ageMs: number) => void | Promise<void>;
  onLoggedOut?: () => void | Promise<void>;
  onHeartbeat?: () => void | Promise<void>;

  // Required for reconnect
  reconnectFactory?: () => Promise<WASocket> | WASocket;

  // Logger (default: NoopLogger)
  logger?: { info, warn, error };
});
```

## Handle API

```ts
const ka = keepAlive(sock, { ... });

ka.stop();            // dispose timers + listeners
ka.isActive();        // boolean
ka.getStats();        // { reconnects, lastReconnectAt, heartbeatsSent }
```

## Backoff Formula

```
delay = min(initial * factor^(attempt-1) + random(0..jitter), maxDelay)
```

Example with defaults (`initial=1s`, `factor=2`, `jitter=500ms`, `max=60s`):

- Attempt 1: 1s + [0..500ms]
- Attempt 2: 2s + [0..500ms]
- Attempt 3: 4s + [0..500ms]
- Attempt 4: 8s + [0..500ms]
- Attempt 5: 16s + [0..500ms]
- ...caps at 60s

## Important: Socket Replacement

When reconnect succeeds, `keepAlive` **switches to the new socket** internally. If you need the new socket reference in your code, wrap it or re-import from your factory:

```ts
let currentSock = makeWASocket({ ... });

const ka = keepAlive(currentSock, {
  reconnectFactory: async () => {
    const newSock = makeWASocket({ ... });
    currentSock = newSock; // update your reference
    return newSock;
  },
});

// Use currentSock in your app
```

## Examples

See `examples/`:

- `basic.ts` — minimal usage
- `with-alerts.ts` — Sentry + Telegram hooks (commented)
- `multi-handler.ts` — all hooks + custom config

## Philosophy

Built for production WhatsApp bots that need to stay online. No magic, no bloat. You provide the socket factory, we handle the retry loop. Pairs with:

- [baileys-antiban](https://github.com/kobie3717/baileys-antiban) — rate limiting + ban prevention
- [WaSP](https://github.com/kobie3717/wasp-protocol) — session persistence + multi-device

## License

MIT © Hannes (Kobus) Wentzel
