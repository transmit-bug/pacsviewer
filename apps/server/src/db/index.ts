import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_URL || './data/pacsviewer.db');

// Enforce foreign keys (#118): bun:sqlite defaults to PRAGMA foreign_keys=OFF,
// which let FK-violating rows (e.g. audit user_id='anonymous') be written
// silently. Enabling it here covers production connections AND tests, so
// violations surface at write time instead of blocking later migrations.
sqlite.exec('PRAGMA foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export * from './schema';
