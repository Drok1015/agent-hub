import { createWriteStream } from 'fs';
import { join } from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

interface Logger {
  debug(msg: string, data?: any): void;
  info(msg: string, data?: any): void;
  warn(msg: string, data?: any): void;
  error(msg: string, data?: any): void;
}

export function createLogger(level: LogLevel): Logger {
  const currentLevelIndex = LOG_LEVELS.indexOf(level);
  
  function shouldLog(logLevel: LogLevel): boolean {
    return LOG_LEVELS.indexOf(logLevel) >= currentLevelIndex;
  }
  
  function formatLog(logLevel: LogLevel, msg: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: logLevel,
      message: msg,
      ...(data && { data }),
    };
    return JSON.stringify(logEntry);
  }
  
  function write(logLevel: LogLevel, msg: string, data?: any) {
    if (!shouldLog(logLevel)) return;
    
    const logLine = formatLog(logLevel, msg, data);
    console.log(logLine);
  }
  
  return {
    debug: (msg, data) => write('debug', msg, data),
    info: (msg, data) => write('info', msg, data),
    warn: (msg, data) => write('warn', msg, data),
    error: (msg, data) => write('error', msg, data),
  };
}
