import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DB_PATH || './data/hub.db';
const migrationsFolder = join(__dirname, '../../drizzle');

console.log(`Using database: ${dbPath}`);
console.log(`Migrations folder: ${migrationsFolder}`);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

const db = drizzle(sqlite);

try {
  console.log('Running migrations...');
  migrate(db, { migrationsFolder });
  console.log('Migrations completed successfully!');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
} finally {
  sqlite.close();
}
