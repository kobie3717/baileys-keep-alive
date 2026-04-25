import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { keepAlive } from 'baileys-keep-alive';

async function main() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  // One-line drop-in
  const ka = keepAlive(sock, {
    reconnectFactory: async () => {
      // Return a fresh socket when reconnect is needed
      return makeWASocket({
        auth: state,
        printQRInTerminal: true,
      });
    },
  });

  console.log('KeepAlive active. Press Ctrl+C to stop.');

  process.on('SIGINT', () => {
    console.log('Stopping...');
    ka.stop();
    sock.end(undefined);
    process.exit(0);
  });
}

main();
