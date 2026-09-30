/**
 * pm2 process definitions for the TA Project Tracker.
 *
 * This file is .cjs on purpose: package.json declares "type": "module", so a
 * plain .js config would be loaded as an ES module and pm2 would fail to read it.
 *
 *   pm2 start ecosystem.config.cjs      start everything
 *   pm2 stop  ecosystem.config.cjs      stop everything in this file
 *   pm2 logs  project-tracker           follow the web service log
 *
 * Both apps are namespaced under "project-tracker", so you can act on this
 * project alone without touching anything else you run under pm2:
 *
 *   pm2 restart /project-tracker/       (namespace selector)
 */
const { resolve } = require('node:path');

const ROOT = __dirname;

// The app serves the API and the frontend from the same process, so this one
// port is the whole address — http://127.0.0.1:6970 is the app.
const PORT = process.env.TRACKER_PORT || 6970;
const HOST = process.env.TRACKER_HOST || '127.0.0.1';

// node:sqlite is still flagged experimental; silence that one warning only.
const NODE_ARGS = ['--disable-warning=ExperimentalWarning'];

module.exports = {
  apps: [
    {
      name: 'project-tracker',
      namespace: 'project-tracker',
      // bin/start.js, not server.js: pm2 loads a script through its own wrapper,
      // so server.js's "run directly?" guard never fires here and it would come
      // up "online" without ever listening.
      script: resolve(ROOT, 'bin', 'start.js'),
      cwd: ROOT,
      node_args: NODE_ARGS,

      // Fork mode with a single instance, deliberately. The workspace is one
      // SQLite file; a cluster of writers would buy nothing here and risks
      // lock contention. One TA, two teams — this is not a throughput problem.
      exec_mode: 'fork',
      instances: 1,

      env: {
        NODE_ENV: 'production',
        PORT,
        HOST,
        // TRACKER_DB: '/path/to/tracker.db',   // defaults to ./data/tracker.db
      },

      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '256M',

      // Don't watch by default: an editor writing a file should not restart
      // the app under someone's fingers. Use `npm run pm2:dev` for that.
      watch: false,

      out_file: resolve(ROOT, 'logs', 'tracker-out.log'),
      error_file: resolve(ROOT, 'logs', 'tracker-error.log'),
      merge_logs: true,
      time: true,
    },

    {
      // Not a server — a scheduled job. pm2 runs it once at startup, it exits,
      // and cron_restart runs it again on the schedule below.
      name: 'project-tracker-backup',
      namespace: 'project-tracker',
      script: resolve(ROOT, 'scripts', 'backup.js'),
      cwd: ROOT,
      node_args: NODE_ARGS,

      exec_mode: 'fork',
      instances: 1,

      // Fridays at 17:00. Change to '0 17 * * *' for every day.
      cron_restart: '0 17 * * 5',
      autorestart: false,

      env: {
        NODE_ENV: 'production',
        TRACKER_BACKUP_KEEP: '20',
        // TRACKER_BACKUP_DIR: '/path/to/backups',  // defaults to ./backups
      },

      out_file: resolve(ROOT, 'logs', 'backup-out.log'),
      error_file: resolve(ROOT, 'logs', 'backup-error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
