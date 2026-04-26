import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { keepAlive } from '../src/index.js';
import type { WASocket, ConnectionUpdate, KeepAliveOptions } from '../src/types.js';
import { DisconnectReason } from '../src/types.js';

/**
 * Mock WASocket using EventEmitter-like pattern
 */
function createMockSocket(): WASocket {
  const handlers: Map<string, Set<(...args: any[]) => void>> = new Map();

  return {
    ev: {
      on(event: string, handler: (...args: any[]) => void): void {
        if (!handlers.has(event)) {
          handlers.set(event, new Set());
        }
        handlers.get(event)!.add(handler);
      },
      off(event: string, handler: (...args: any[]) => void): void {
        handlers.get(event)?.delete(handler);
      },
      // Helper to emit events (not part of WASocket interface, but useful for testing)
      emit(event: string, ...args: any[]): void {
        handlers.get(event)?.forEach((h) => h(...args));
      },
    } as any,
    sendPresenceUpdate: vi.fn().mockResolvedValue(undefined),
    end: vi.fn(),
  };
}

describe('baileys-keep-alive Integration Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('0. Mock socket event emitter works', () => {
    const mockSock = createMockSocket();
    const handler = vi.fn();

    mockSock.ev.on('connection.update', handler);
    (mockSock.ev as any).emit('connection.update', { connection: 'open' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ connection: 'open' });
  });

  it('1. Reconnect on connection.close (non-loggedOut reason)', async () => {
    const mockSock = createMockSocket();
    const mockNewSock = createMockSocket();

    const onReconnect = vi.fn();
    const reconnectFactory = vi.fn().mockResolvedValue(mockNewSock);

    const handle = keepAlive(mockSock, {
      reconnect: {
        enabled: true,
        initialDelayMs: 2000,
        maxDelayMs: 10000,
        factor: 2,
        jitterMs: 0, // No jitter for predictable timing
      },
      onReconnect,
      reconnectFactory,
      heartbeat: { enabled: false }, // Disable heartbeat to isolate test
    });

    // Fire connection.close with timeout statusCode (408)
    const closeUpdate: ConnectionUpdate = {
      connection: 'close',
      lastDisconnect: {
        error: {
          output: {
            statusCode: DisconnectReason.timedOut, // 408
          },
        },
      },
    };

    (mockSock.ev as any).emit('connection.update', closeUpdate);

    // Advance timers to trigger reconnect
    await vi.advanceTimersByTimeAsync(2000);

    // Assert reconnectFactory was called
    expect(reconnectFactory).toHaveBeenCalledTimes(1);

    // Assert onReconnect callback fired with correct parameters
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onReconnect).toHaveBeenCalledWith(1, 2000);

    // Assert stats.reconnects incremented
    const stats = handle.getStats();
    expect(stats.reconnects).toBe(1);
    expect(stats.lastReconnectAt).toBeInstanceOf(Date);

    handle.stop();
  });

  it('2. Give up on loggedOut', async () => {
    const mockSock = createMockSocket();

    const onLoggedOut = vi.fn();
    const reconnectFactory = vi.fn();

    const handle = keepAlive(mockSock, {
      reconnect: {
        enabled: true,
        initialDelayMs: 1000,
      },
      onLoggedOut,
      reconnectFactory,
      heartbeat: { enabled: false },
    });

    // Fire connection.close with loggedOut statusCode (401)
    const closeUpdate: ConnectionUpdate = {
      connection: 'close',
      lastDisconnect: {
        error: {
          output: {
            statusCode: DisconnectReason.loggedOut, // 401
          },
        },
      },
    };

    (mockSock.ev as any).emit('connection.update', closeUpdate);

    // Advance timers
    await vi.advanceTimersByTimeAsync(5000);

    // Assert reconnectFactory NOT called
    expect(reconnectFactory).not.toHaveBeenCalled();

    // Assert onLoggedOut callback fired exactly once
    expect(onLoggedOut).toHaveBeenCalledTimes(1);

    // Assert handle is still technically active (doesn't auto-stop on loggedOut)
    // but reconnect won't happen
    expect(handle.isActive()).toBe(true);

    handle.stop();
  });

  it('3. Heartbeat interval', async () => {
    const mockSock = createMockSocket();

    const onHeartbeat = vi.fn();

    const handle = keepAlive(mockSock, {
      heartbeat: {
        enabled: true,
        intervalMs: 5000,
        presence: 'available',
      },
      onHeartbeat,
      reconnect: { enabled: false },
    });

    // Advance time by 3× heartbeat interval
    await vi.advanceTimersByTimeAsync(5000); // 1st heartbeat
    await vi.advanceTimersByTimeAsync(5000); // 2nd heartbeat
    await vi.advanceTimersByTimeAsync(5000); // 3rd heartbeat

    // Assert sendPresenceUpdate called 3 times
    expect(mockSock.sendPresenceUpdate).toHaveBeenCalledTimes(3);
    expect(mockSock.sendPresenceUpdate).toHaveBeenCalledWith('available');

    // Assert onHeartbeat callback fired 3 times
    expect(onHeartbeat).toHaveBeenCalledTimes(3);

    // Assert stats.heartbeatsSent === 3
    const stats = handle.getStats();
    expect(stats.heartbeatsSent).toBe(3);

    handle.stop();
  });

  it('4. QR-stale watchdog', async () => {
    const mockSock = createMockSocket();

    const onQRStale = vi.fn();

    const handle = keepAlive(mockSock, {
      qr: {
        staleAfterMs: 1000, // Use shorter time for test
      },
      onQRStale,
      heartbeat: { enabled: false },
      reconnect: { enabled: false },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    });

    // Fire connection.update with QR code
    const qrUpdate: ConnectionUpdate = {
      qr: 'mock-qr-code-string',
    };

    (mockSock.ev as any).emit('connection.update', qrUpdate);

    // Run all pending timers
    await vi.runOnlyPendingTimersAsync();

    // Assert onQRStale called with ageMs >= staleAfterMs
    expect(onQRStale).toHaveBeenCalledTimes(1);
    const callArg = onQRStale.mock.calls[0][0];
    expect(callArg).toBeGreaterThanOrEqual(1000);

    handle.stop();
  });

  it('5. Exponential backoff math', async () => {
    const mockSock = createMockSocket();

    const onReconnect = vi.fn();
    const delays: number[] = [];

    // Factory always throws to keep it in retry loop
    const reconnectFactory = vi.fn().mockRejectedValue(new Error('mock failure'));

    const handle = keepAlive(mockSock, {
      reconnect: {
        enabled: true,
        initialDelayMs: 1000,
        maxDelayMs: 20000,
        factor: 2,
        jitterMs: 0, // Zero jitter for clean assertion
        maxRetries: 6, // Allow 5 attempts
      },
      onReconnect: (attempt, delayMs) => {
        onReconnect(attempt, delayMs);
        delays.push(delayMs);
      },
      reconnectFactory,
      heartbeat: { enabled: false },
    });

    // Fire 5 sequential close events
    for (let i = 0; i < 5; i++) {
      const closeUpdate: ConnectionUpdate = {
        connection: 'close',
        lastDisconnect: {
          error: {
            output: {
              statusCode: DisconnectReason.connectionLost, // 408
            },
          },
        },
      };

      (mockSock.ev as any).emit('connection.update', closeUpdate);

      // Advance time to let the reconnect attempt fail
      await vi.advanceTimersByTimeAsync(30000);
    }

    // Verify delays match formula: initial * factor^(attempt-1)
    // Attempt 1: 1000 * 2^0 = 1000
    // Attempt 2: 1000 * 2^1 = 2000
    // Attempt 3: 1000 * 2^2 = 4000
    // Attempt 4: 1000 * 2^3 = 8000
    // Attempt 5: 1000 * 2^4 = 16000
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);

    handle.stop();
  });

  it('6. handle.stop() cleans everything', async () => {
    const mockSock = createMockSocket();
    const mockNewSock = createMockSocket();

    const reconnectFactory = vi.fn().mockResolvedValue(mockNewSock);

    const handle = keepAlive(mockSock, {
      reconnect: {
        enabled: true,
        initialDelayMs: 1000,
      },
      reconnectFactory,
      heartbeat: {
        enabled: true,
        intervalMs: 5000,
      },
    });

    // Start keepAlive, then call handle.stop()
    handle.stop();

    // Fire connection.update close → assert NO reconnect attempt
    const closeUpdate: ConnectionUpdate = {
      connection: 'close',
      lastDisconnect: {
        error: {
          output: {
            statusCode: DisconnectReason.timedOut,
          },
        },
      },
    };

    (mockSock.ev as any).emit('connection.update', closeUpdate);

    await vi.advanceTimersByTimeAsync(5000);

    expect(reconnectFactory).not.toHaveBeenCalled();

    // Advance fake timers past heartbeat interval → assert NO presence-update sent
    await vi.advanceTimersByTimeAsync(10000);

    expect(mockSock.sendPresenceUpdate).not.toHaveBeenCalled();

    // Assert handle.isActive() === false
    expect(handle.isActive()).toBe(false);
  });

  it('7. maxRetries cap', async () => {
    const mockSock = createMockSocket();

    const onMaxRetries = vi.fn();
    const reconnectFactory = vi.fn().mockRejectedValue(new Error('always fails'));

    const handle = keepAlive(mockSock, {
      reconnect: {
        enabled: true,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        factor: 2,
        jitterMs: 0,
        maxRetries: 3,
      },
      onMaxRetries,
      reconnectFactory,
      heartbeat: { enabled: false },
    });

    // Fire close events and advance through all retries
    for (let i = 0; i < 4; i++) { // Attempt 4 closes to exceed maxRetries of 3
      const closeUpdate: ConnectionUpdate = {
        connection: 'close',
        lastDisconnect: {
          error: {
            output: {
              statusCode: DisconnectReason.connectionLost,
            },
          },
        },
      };

      (mockSock.ev as any).emit('connection.update', closeUpdate);

      await vi.advanceTimersByTimeAsync(10000);
    }

    // Assert onMaxRetries called once with totalAttempts === 3
    expect(onMaxRetries).toHaveBeenCalledTimes(1);
    expect(onMaxRetries).toHaveBeenCalledWith(3);

    // Assert reconnectFactory called exactly 3 times (not 4)
    expect(reconnectFactory).toHaveBeenCalledTimes(3);

    handle.stop();
  });
});
