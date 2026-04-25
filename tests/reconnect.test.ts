import { describe, it, expect } from 'vitest';
import { ReconnectManager } from '../src/reconnect.js';
import { NoopLogger } from '../src/logger.js';

describe('ReconnectManager - Backoff Math', () => {
  const logger = new NoopLogger();

  it('should calculate delay with formula: min(initial * factor^(attempt-1) + random(0..jitter), maxDelay)', () => {
    const config = {
      enabled: true,
      initialDelayMs: 1000,
      maxDelayMs: 60_000,
      factor: 2,
      jitterMs: 500,
      maxRetries: 10,
    };

    const mgr = new ReconnectManager(config, logger);

    // Attempt 1: 1000 * 2^0 + jitter = 1000 + [0..500] = [1000..1500]
    const delay1 = mgr.calculateDelay(1);
    expect(delay1).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeLessThanOrEqual(1500);

    // Attempt 2: 1000 * 2^1 + jitter = 2000 + [0..500] = [2000..2500]
    const delay2 = mgr.calculateDelay(2);
    expect(delay2).toBeGreaterThanOrEqual(2000);
    expect(delay2).toBeLessThanOrEqual(2500);

    // Attempt 3: 1000 * 2^2 + jitter = 4000 + [0..500] = [4000..4500]
    const delay3 = mgr.calculateDelay(3);
    expect(delay3).toBeGreaterThanOrEqual(4000);
    expect(delay3).toBeLessThanOrEqual(4500);

    // Attempt 4: 1000 * 2^3 + jitter = 8000 + [0..500] = [8000..8500]
    const delay4 = mgr.calculateDelay(4);
    expect(delay4).toBeGreaterThanOrEqual(8000);
    expect(delay4).toBeLessThanOrEqual(8500);

    // Attempt 5: 1000 * 2^4 + jitter = 16000 + [0..500] = [16000..16500]
    const delay5 = mgr.calculateDelay(5);
    expect(delay5).toBeGreaterThanOrEqual(16000);
    expect(delay5).toBeLessThanOrEqual(16500);
  });

  it('should cap delay at maxDelayMs', () => {
    const config = {
      enabled: true,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      factor: 2,
      jitterMs: 100,
      maxRetries: 10,
    };

    const mgr = new ReconnectManager(config, logger);

    // Attempt 10: 1000 * 2^9 = 512000 + jitter → should cap at 5000
    const delay10 = mgr.calculateDelay(10);
    expect(delay10).toBeLessThanOrEqual(5000);
    expect(delay10).toBeGreaterThanOrEqual(4900); // 5000 - jitter
  });

  it('should handle zero jitter', () => {
    const config = {
      enabled: true,
      initialDelayMs: 2000,
      maxDelayMs: 10_000,
      factor: 1.5,
      jitterMs: 0,
      maxRetries: 10,
    };

    const mgr = new ReconnectManager(config, logger);

    // Attempt 1: 2000 * 1.5^0 = 2000 (no jitter)
    const delay1 = mgr.calculateDelay(1);
    expect(delay1).toBe(2000);

    // Attempt 2: 2000 * 1.5^1 = 3000
    const delay2 = mgr.calculateDelay(2);
    expect(delay2).toBe(3000);
  });
});
