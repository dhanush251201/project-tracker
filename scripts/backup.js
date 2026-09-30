#!/usr/bin/env node
// Writes a timestamped JSON export to backups/. Safe to run while the app is
// open, and safe to put on a cron/launchd schedule.
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { exportAll } from '../src/store.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.TRACKER_BACKUP_DIR || join(ROOT, 'backups');
const KEEP = Number(process.env.TRACKER_BACKUP_KEEP || 20);

openDb();
mkdirSync(DIR, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = join(DIR, `tracker-${stamp}.json`);
const data = exportAll();
writeFileSync(file, JSON.stringify(data, null, 2));

// Keep the most recent KEEP files; drop the rest.
const olds = readdirSync(DIR)
  .filter((f) => f.startsWith('tracker-') && f.endsWith('.json'))
  .sort()
  .reverse()
  .slice(KEEP);
for (const f of olds) unlinkSync(join(DIR, f));

console.log(`\n  Backup written: ${file}`);
console.log(`  ${data.teams.length} teams · ${data.meetings.length} meetings · ${data.tasks.length} tasks`);
if (olds.length) console.log(`  Pruned ${olds.length} older backup${olds.length === 1 ? '' : 's'} (keeping ${KEEP}).`);
console.log();
