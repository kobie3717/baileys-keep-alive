import type { Logger, QRConfig, ConnectionUpdate } from './types.js';

const DEFAULT_CONFIG: Required<QRConfig> = {
  staleAfterMs: 60_000,
};

export class QRWatchdog {
  private config: Required<QRConfig>;
  private logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private qrReceivedAt: Date | null = null;
  private onQRStale?: (ageMs: number) => void | Promise<void>;

  constructor(config: QRConfig | undefined, logger: Logger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  public handleUpdate(update: ConnectionUpdate, onQRStale?: (ageMs: number) => void | Promise<void>): void {
    this.onQRStale = onQRStale;

    if (update.qr) {
      this.qrReceivedAt = new Date();
      this.logger.info('QR code received, starting stale watchdog');
      this.startWatchdog();
    }

    if (update.connection === 'open') {
      this.stop();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.qrReceivedAt = null;
      this.logger.info('QR watchdog stopped');
    }
  }

  private startWatchdog(): void {
    this.stop();

    this.timer = setTimeout(async () => {
      if (!this.qrReceivedAt) return;

      const ageMs = Date.now() - this.qrReceivedAt.getTime();
      this.logger.warn(`QR code is stale (${ageMs}ms old, threshold ${this.config.staleAfterMs}ms)`);

      if (this.onQRStale) {
        await this.onQRStale(ageMs);
      }
    }, this.config.staleAfterMs);
  }
}
