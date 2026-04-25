import type { Logger, HeartbeatConfig, WASocket } from './types.js';

const DEFAULT_CONFIG: Required<HeartbeatConfig> = {
  enabled: true,
  intervalMs: 30_000,
  presence: 'available',
};

export class HeartbeatManager {
  private config: Required<HeartbeatConfig>;
  private logger: Logger;
  private timer: NodeJS.Timeout | null = null;
  private sock: WASocket | null = null;
  private onHeartbeat?: () => void | Promise<void>;

  public heartbeatsSent = 0;

  constructor(config: HeartbeatConfig | undefined, logger: Logger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  public start(sock: WASocket, onHeartbeat?: () => void | Promise<void>): void {
    if (!this.config.enabled) return;

    this.stop();
    this.sock = sock;
    this.onHeartbeat = onHeartbeat;

    this.timer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.intervalMs);

    this.logger.info(`Heartbeat started (${this.config.intervalMs}ms interval)`);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.sock = null;
      this.logger.info('Heartbeat stopped');
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.sock) return;

    try {
      await this.sock.sendPresenceUpdate(this.config.presence);
      this.heartbeatsSent++;
      this.logger.info(`Heartbeat sent (${this.config.presence})`);
      if (this.onHeartbeat) await this.onHeartbeat();
    } catch (err) {
      this.logger.error('Heartbeat failed:', err);
    }
  }
}
