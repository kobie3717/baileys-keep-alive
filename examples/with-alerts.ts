import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { keepAlive } from 'baileys-keep-alive';

// Sentry example (install @sentry/node yourself)
// import * as Sentry from '@sentry/node';

// Telegram example (install node-telegram-bot-api yourself)
// import TelegramBot from 'node-telegram-bot-api';
// const bot = new TelegramBot('YOUR_BOT_TOKEN', { polling: false });
// const CHAT_ID = 'YOUR_CHAT_ID';

async function main() {
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

    // Alert: Reconnect started
    onReconnect: async (attempt, delayMs) => {
      console.log(`🔄 Reconnect attempt ${attempt} in ${delayMs}ms`);

      // Sentry.captureMessage(`WhatsApp reconnecting (attempt ${attempt})`, 'warning');

      // await bot.sendMessage(CHAT_ID, `⚠️ WhatsApp reconnecting (attempt ${attempt}, delay ${delayMs}ms)`);
    },

    // Alert: Reconnect failed
    onReconnectFailed: async (err, attempt) => {
      console.error(`❌ Reconnect failed (attempt ${attempt}):`, err);

      // Sentry.captureException(err);

      // await bot.sendMessage(CHAT_ID, `❌ Reconnect failed (attempt ${attempt}): ${err.message}`);
    },

    // Alert: Max retries exceeded
    onMaxRetries: async (totalAttempts) => {
      console.error(`🚨 Max retries exceeded after ${totalAttempts} attempts!`);

      // Sentry.captureMessage(`WhatsApp max retries exceeded (${totalAttempts})`, 'error');

      // await bot.sendMessage(CHAT_ID, `🚨 WhatsApp max retries exceeded (${totalAttempts} attempts). Manual intervention needed.`);
    },

    // Alert: QR code stale
    onQRStale: async (ageMs) => {
      console.warn(`⏰ QR code stale (${ageMs}ms old). Generate a fresh QR.`);

      // await bot.sendMessage(CHAT_ID, `⏰ WhatsApp QR code stale (${ageMs}ms old). Please scan soon or generate fresh QR.`);
    },

    // Alert: Logged out
    onLoggedOut: async () => {
      console.error('🔐 Logged out. Delete auth_info and re-authenticate.');

      // Sentry.captureMessage('WhatsApp logged out (401)', 'critical');

      // await bot.sendMessage(CHAT_ID, '🔐 WhatsApp logged out (401). Delete auth_info and re-authenticate.');
    },

    // Telemetry: Heartbeat sent
    onHeartbeat: async () => {
      // Optional: log to metrics system
      // console.log('💓 Heartbeat sent');
    },

    // Custom logger (Winston, Pino, etc.)
    logger: {
      info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
      warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
      error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
    },
  });

  console.log('KeepAlive with alerts active. Press Ctrl+C to stop.');

  process.on('SIGINT', () => {
    console.log('Stopping...');
    ka.stop();
    sock.end(undefined);
    process.exit(0);
  });
}

main();
