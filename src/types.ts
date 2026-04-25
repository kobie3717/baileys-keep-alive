export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface WASocket {
  ev: {
    on(event: 'connection.update', handler: (update: ConnectionUpdate) => void): void;
    on(event: 'creds.update', handler: () => void): void;
    off(event: string, handler: (...args: any[]) => void): void;
  };
  sendPresenceUpdate(presence: 'available' | 'unavailable'): Promise<void>;
  end(error?: Error): void;
}

export interface ConnectionUpdate {
  connection?: 'close' | 'open' | 'connecting';
  lastDisconnect?: {
    error?: {
      output?: {
        statusCode?: number;
      };
    };
  };
  qr?: string;
}

export interface ReconnectConfig {
  enabled?: boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitterMs?: number;
  maxRetries?: number;
}

export interface HeartbeatConfig {
  enabled?: boolean;
  intervalMs?: number;
  presence?: 'available' | 'unavailable';
}

export interface QRConfig {
  staleAfterMs?: number;
}

export interface KeepAliveOptions {
  reconnect?: ReconnectConfig;
  heartbeat?: HeartbeatConfig;
  qr?: QRConfig;
  onReconnect?: (attempt: number, delayMs: number) => void | Promise<void>;
  onReconnectFailed?: (err: Error, attempt: number) => void | Promise<void>;
  onMaxRetries?: (totalAttempts: number) => void | Promise<void>;
  onQRStale?: (ageMs: number) => void | Promise<void>;
  onLoggedOut?: () => void | Promise<void>;
  onHeartbeat?: () => void | Promise<void>;
  reconnectFactory?: () => Promise<WASocket> | WASocket;
  logger?: Logger;
}

export interface KeepAliveStats {
  reconnects: number;
  lastReconnectAt: Date | null;
  heartbeatsSent: number;
}

export interface KeepAliveHandle {
  stop(): void;
  isActive(): boolean;
  getStats(): KeepAliveStats;
}

export enum DisconnectReason {
  connectionClosed = 428,
  connectionLost = 408,
  connectionReplaced = 440,
  timedOut = 408,
  loggedOut = 401,
  badSession = 500,
  restartRequired = 515,
}
