#!/usr/bin/env node
// Empties the workspace. Takes a backup first unless --no-backup is passed,
// so this is recoverable even when run by accident.
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { openDb, getDb } from '../src/db.js';
import { dashboard } from '../src/store.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipBackup = process.argv.includes('--no-backup');
const yes = process.argv.includes('--yes') || process.argv.includes('-y');

openDb();
const before = dashboard().counts;

if (before.teams === 0 && before.open_tasks === 0) {
  console.log('\n  Workspace is already empty.\n');
  process.exit(0);
}

console.log(`\n  This will delete ${before.teams} teams, ${before.members} students, `
  + `${before.meetings} meetings and every task, milestone and note.`);

if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('  Type "erase" to confirm: ');
  rl.close();
  if (answer.trim() !== 'erase') {
    console.log('  Cancelled — nothing was deleted.\n');
    process.exit(0);
  }
}

if (!skipBackup) {
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(ROOT, 'scripts', 'backup.js')], { stdio: 'inherit' });
}

const db = getDb();
db.exec('BEGIN');
for (const t of ['tag_links', 'tags', 'notes', 'milestones', 'tasks', 'attendance', 'meetings', 'members', 'teams']) {
  db.exec(`DELETE FROM ${t}`);
}
db.exec('COMMIT');

console.log('  Workspace cleared. Start fresh with:  npm start\n');
