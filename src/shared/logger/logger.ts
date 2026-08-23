import pino from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

let loggerInstance: pino.Logger | null = null;

export function getLogger(level: LogLevel = 'info'): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = pino({
      level,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    });
  }
  return loggerInstance;
}

export function setLogLevel(level: LogLevel): void {
  getLogger(level);
  loggerInstance!.level = level;
}

export const log = {
  trace: (msg: string, meta?: object) => getLogger().trace(meta ?? {}, msg),
  debug: (msg: string, meta?: object) => getLogger().debug(meta ?? {}, msg),
  info: (msg: string, meta?: object) => getLogger().info(meta ?? {}, msg),
  warn: (msg: string, meta?: object) => getLogger().warn(meta ?? {}, msg),
  error: (msg: string, meta?: object) => getLogger().error(meta ?? {}, msg),
};
