export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = '', level?: LogLevel) {
    this.prefix = prefix;
    // Default to SILENT in production, DEBUG in development
    this.level = level ?? (process.env.NODE_ENV === 'production' 
      ? LogLevel.SILENT 
      : LogLevel.DEBUG);
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private format(...args: any[]): any[] {
    return this.prefix ? [`[${this.prefix}]`, ...args] : args;
  }

  error(...args: any[]) {
    if (this.level >= LogLevel.ERROR) {
      console.error(...this.format(...args));
    }
  }

  warn(...args: any[]) {
    if (this.level >= LogLevel.WARN) {
      console.warn(...this.format(...args));
    }
  }

  info(...args: any[]) {
    if (this.level >= LogLevel.INFO) {
      console.log(...this.format(...args));
    }
  }

  log(...args: any[]) {
    this.info(...args);
  }

  debug(...args: any[]) {
    if (this.level >= LogLevel.DEBUG) {
      console.debug(...this.format(...args));
    }
  }
}
