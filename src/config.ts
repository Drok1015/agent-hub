import { z } from 'zod';

const configSchema = z.object({
  PORT: z.string().default('3000'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('365d'),
  DB_PATH: z.string().default('./data/hub.db'),
  HEARTBEAT_TIMEOUT: z.string().default('90000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = {
  port: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  dbPath: string;
  heartbeatTimeout: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

export function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('Invalid configuration:');
    const errors = result.error.flatten().fieldErrors;
    for (const [key, value] of Object.entries(errors)) {
      console.error(`  ${key}: ${value.join(', ')}`);
    }
    process.exit(1);
  }
  
  return {
    port: result.data.PORT,
    jwtSecret: result.data.JWT_SECRET,
    jwtExpiresIn: result.data.JWT_EXPIRES_IN,
    dbPath: result.data.DB_PATH,
    heartbeatTimeout: result.data.HEARTBEAT_TIMEOUT,
    logLevel: result.data.LOG_LEVEL,
  };
}
