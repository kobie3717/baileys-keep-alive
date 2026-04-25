import type { Logger, ReconnectConfig, ConnectionUpdate, WASocket } from './types.js';
import { DisconnectReason } from './types.js';

const DEFAULT_CONFIG: Required<ReconnectConfig> = {
  enabled: true,
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  factor: 2,
  jitterMs: 500,
  maxRetries: Infinity,
};

export class ReconnectManager {
  private config: Required<ReconnectConfig>;
  private logger: Logger;
  private attempts = 0;
  private reconnecting = false;

  public reconnects = 0;
  public lastReconnectAt: Date | null = null;

  constructor(config: ReconnectConfig | undefined, logger: Logger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  public async handleClose(
    update: ConnectionUpdate,
    reconnectFactory: (() => Promise<WASocket> | WASocket) | undefined,
    onReconnect?: (attempt: number, delayMs: number) => void | Promise<void>,
    onReconnectFailed?: (err: Error, attempt: number) => void | Promise<void>,
    onMaxRetries?: (totalAttempts: number) => void | Promise<void>,
    onLoggedOut?: () => void | Promise<void>
  ): Promise<WASocket | null> {
    if (!this.config.enabled) return null;
    if (this.reconnecting) return null;

    const statusCode = update.lastDisconnect?.error?.output?.statusCode;

    if (statusCode === DisconnectReason.loggedOut) {
      this.logger.warn('Connection closed: logged out (not reconnecting)');
      if (onLoggedOut) await onLoggedOut();
      return null;
    }

    if (!reconnectFactory) {
      this.logger.error('Connection closed but no reconnectFactory provided');
      return null;
    }

    this.reconnecting = true;
    this.attempts++;

    if (this.attempts > this.config.maxRetries) {
      this.logger.error(`Max retries (${this.config.maxRetries}) exceeded`);
      if (onMaxRetries) await onMaxRetries(this.attempts - 1);
      this.reconnecting = false;
      return null;
    }

    const delay = this.calculateDelay(this.attempts);
    this.logger.info(`Reconnecting (attempt ${this.attempts}) in ${delay}ms...`);

    if (onReconnect) await onReconnect(this.attempts, delay);

    await this.sleep(delay);

    try {
      const newSock = await reconnectFactory();
      this.reconnects++;
      this.lastReconnectAt = new Date();
      this.attempts = 0; // reset on success
      this.reconnecting = false;
      this.logger.info('Reconnected successfully');
      return newSock;
    } catch (err) {
      this.logger.error('Reconnect failed:', err);
      if (onReconnectFailed) await onReconnectFailed(err as Error, this.attempts);
      this.reconnecting = false;
      return null;
    }
  }

  public calculateDelay(attempt: number): number {
    const base = this.config.initialDelayMs * Math.pow(this.config.factor, attempt - 1);
    const jitter = Math.random() * this.config.jitterMs;
    return Math.min(base + jitter, this.config.maxDelayMs);
  }

  public reset(): void {
    this.attempts = 0;
    this.reconnecting = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
