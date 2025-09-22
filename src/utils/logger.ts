/**
 * Simple logging utility for LacyLights
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const level = process.env.LOG_LEVEL as LogLevel || 'INFO';
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `[${timestamp}] ${level}: ${message}`;

    if (meta) {
      return `${baseMessage} ${JSON.stringify(meta)}`;
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