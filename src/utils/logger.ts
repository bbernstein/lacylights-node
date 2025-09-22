/**
 * Simple logging utility for LacyLights
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const envLevel = process.env.LOG_LEVEL;
    const level: LogLevel = envLevel && LOG_LEVELS.includes(envLevel as LogLevel) ? (envLevel as LogLevel) : 'INFO';
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const currentLevelIndex = LOG_LEVELS.indexOf(this.logLevel);
    const messageLevelIndex = LOG_LEVELS.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private serializeMeta(meta: Record<string, unknown>): Record<string, unknown> {
    const serialized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(meta)) {
      if (value instanceof Error) {
        // Convert Error objects to plain objects with all relevant properties
        serialized[key] = {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...(Object.prototype.hasOwnProperty.call(value, 'cause') ? { cause: value.cause } : {}),
        };
      } else {
        serialized[key] = value;
      }
    }

    return serialized;
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] ${level}: ${message}`;

    if (meta) {
      const serializedMeta = this.serializeMeta(meta);
      return `${baseMessage} ${JSON.stringify(serializedMeta)}`;
    }

    return baseMessage;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('DEBUG')) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('DEBUG', message, meta));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('INFO')) {
      // eslint-disable-next-line no-console
      console.log(this.formatMessage('INFO', message, meta));
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('WARN')) {
      // eslint-disable-next-line no-console
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('ERROR')) {
      // eslint-disable-next-line no-console
      console.error(this.formatMessage('ERROR', message, meta));
    }
  }
}

export const logger = new Logger();