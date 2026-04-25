import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { keepAlive } from 'baileys-keep-alive';

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  const ka = keepAlive(sock, {
    reconnect: {
      initialDelayMs: 2000,
      maxDelayMs: 120_000, // 2 minutes max
      factor: 2.5,
      jitterMs: 1000,
      maxRetries: 5,
    },

    heartbeat: {
      intervalMs: 20_000, // 20 seconds
      presence: 'available',
    },

    qr: {
      staleAfterMs: 90_000, // 90 seconds
    },

    reconnectFactory: async () => {
      console.log('🏭 Creating fresh socket...');
      return makeWASocket({
        auth: state,
        printQRInTerminal: true,
      });
    },

    onReconnect: (attempt, delayMs) => {
      console.log(`🔄 [${new Date().toISOString()}] Reconnecting (attempt ${attempt}, delay ${delayMs}ms)`);
    },

    onReconnectFailed: (err, attempt) => {
      console.error(`❌ [${new Date().toISOString()}] Reconnect failed (attempt ${attempt}):`, err.message);
    },

    onMaxRetries: (totalAttempts) => {
      console.error(`🚨 [${new Date().toISOString()}] Max retries hit after ${totalAttempts} attempts. Giving up.`);
      // You could restart the whole process here, send alerts, etc.
    },

    onQRStale: (ageMs) => {
      console.warn(`⏰ [${new Date().toISOString()}] QR stale (${ageMs}ms). Consider re-generating.`);
    },

    onLoggedOut: () => {
      console.error(`🔐 [${new Date().toISOString()}] Logged out (401). Manual re-auth required.`);
      // Clean up auth_info, notify admin, etc.
    },

    onHeartbeat: () => {
      const stats = ka.getStats();
      console.log(`💓 Heartbeat #${stats.heartbeatsSent} sent (${stats.reconnects} reconnects so far)`);
    },

    logger: {
      info: (msg, ...args) => console.log(`[KeepAlive] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[KeepAlive] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[KeepAlive] ${msg}`, ...args),
    },
  });

  console.log('KeepAlive with all handlers active. Press Ctrl+C to stop.');

  // Periodically log stats
  setInterval(() => {
    const stats = ka.getStats();
    console.log('📊 Stats:', stats);
  }, 60_000); // every minute

  process.on('SIGINT', () => {
    console.log('Stopping...');
    const finalStats = ka.getStats();
    console.log('📊 Final stats:', finalStats);
    ka.stop();
    sock.end(undefined);
    process.exit(0);
  });
}

main();
