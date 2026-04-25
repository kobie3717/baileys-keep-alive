import type { Logger } from './types.js';

export class NoopLogger implements Logger {
  info(_msg: string, ..._args: unknown[]): void {}
  warn(_msg: string, ..._args: unknown[]): void {}
  error(_msg: string, ..._args: unknown[]): void {}
}

export const defaultLogger = new NoopLogger();
