import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { Config } from '../config';

let db: ReturnType<typeof drizzle> | null = null;

export function initDatabase(config: Config) {
  if (db) return db;
  
  const sqlite = new Database(config.dbPath);
  sqlite.pragma('journal_mode = WAL');
  
  db = drizzle(sqlite, { schema });
  return db;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

export { schema };
