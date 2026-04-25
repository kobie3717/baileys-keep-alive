# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-25

### Added
- Initial release
- Auto-reconnect with exponential backoff + jitter
- Reason-aware disconnect handling (gives up on `loggedOut`, retries all else)
- Heartbeat manager with configurable presence updates
- QR-stale watchdog
- Alert hooks: `onReconnect`, `onReconnectFailed`, `onMaxRetries`, `onQRStale`, `onLoggedOut`, `onHeartbeat`
- Stats API: `getStats()` returns reconnect count, last reconnect timestamp, heartbeats sent
- Logger interface support (no hard deps)
- Unit tests for backoff formula
- Three usage examples (basic, with-alerts, multi-handler)
- Full TypeScript support with strict mode
