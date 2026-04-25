import type {
  KeepAliveOptions,
  KeepAliveHandle,
  KeepAliveStats,
  WASocket,
  ConnectionUpdate,
  Logger,
} from './types.js';
import { defaultLogger } from './logger.js';
import { ReconnectManager } from './reconnect.js';
import { HeartbeatManager } from './heartbeat.js';
import { QRWatchdog } from './qr.js';

export * from './types.js';
export { NoopLogger } from './logger.js';

export function keepAlive(initialSock: WASocket, opts: KeepAliveOptions = {}): KeepAliveHandle {
  const logger: Logger = opts.logger ?? defaultLogger;
  const reconnectMgr = new ReconnectManager(opts.reconnect, logger);
  const heartbeatMgr = new HeartbeatManager(opts.heartbeat, logger);
  const qrWatchdog = new QRWatchdog(opts.qr, logger);

  let currentSock = initialSock;
  let active = true;

  const connectionHandler = async (update: ConnectionUpdate): Promise<void> => {
    if (!active) return;

    qrWatchdog.handleUpdate(update, opts.onQRStale);

    if (update.connection === 'open') {
      reconnectMgr.reset();
      heartbeatMgr.start(currentSock, opts.onHeartbeat);
      logger.info('Connection opened, heartbeat started');
    }

    if (update.connection === 'close') {
      heartbeatMgr.stop();
      qrWatchdog.stop();

      const newSock = await reconnectMgr.handleClose(
        update,
        opts.reconnectFactory,
        opts.onReconnect,
        opts.onReconnectFailed,
        opts.onMaxRetries,
        opts.onLoggedOut
      );

      if (newSock) {
        // Detach from old socket
        currentSock.ev.off('connection.update', connectionHandler);

        // Switch to new socket
        currentSock = newSock;
        currentSock.ev.on('connection.update', connectionHandler);
        logger.info('Switched to new socket after reconnect');
      }
    }
  };

  currentSock.ev.on('connection.update', connectionHandler);

  // Start heartbeat if already connected
  heartbeatMgr.start(currentSock, opts.onHeartbeat);

  const handle: KeepAliveHandle = {
    stop(): void {
      if (!active) return;
      active = false;
      heartbeatMgr.stop();
      qrWatchdog.stop();
      currentSock.ev.off('connection.update', connectionHandler);
      logger.info('KeepAlive stopped');
    },

    isActive(): boolean {
      return active;
    },

    getStats(): KeepAliveStats {
      return {
        reconnects: reconnectMgr.reconnects,
        lastReconnectAt: reconnectMgr.lastReconnectAt,
        heartbeatsSent: heartbeatMgr.heartbeatsSent,
      };
    },
  };

  return handle;
}
