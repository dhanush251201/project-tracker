# Project Tracker — a TA workspace for capstone teams

A local-first web app for supervising student project teams: meeting notes,
conversations, your own thoughts, the tasks you have given them, the tasks you
owe them, and a progress picture that keeps itself up to date.

Everything is stored in a single SQLite file on your machine. No account, no
sync, no telemetry.

---

## Running it

You need Node 22.5 or newer (`node --version`). There are **no dependencies to
install** — the app uses Node's built-in HTTP server and its built-in SQLite.

```bash
npm start
```

Then open **http://127.0.0.1:4321**.

To keep it running in the background across reboots and crashes, run it under
pm2 instead — see [Running under pm2](#running-under-pm2) below, which puts it
on **http://127.0.0.1:6970**.

To try it with a realistic half-semester of sample data first:

```bash
npm run seed
```

To empty it again and start on your real teams:

```bash
npm run reset
```

`reset` takes a backup before it deletes anything.

---

## What it does

### Teams and projects
Each team holds the project title, description, tech stack, repo/demo/spec links,
your meeting slot, and your own read on how it is going (*on track / needs
watching / at risk*). Add the students with their role, email, GitHub handle and
your private notes on each of them.

### Meetings
The core of the weekly cycle. Each entry records:

- **Agenda** — what you planned to cover
- **Notes** — what was actually said. Paste transcripts or conversation logs here
- **Decisions** — what was agreed
- **Blockers** — what is in their way
- **Private thoughts** — for you only; deliberately excluded from exported reports
- **Attendance** — present / late / absent / excused, per student
- **Room temperature** — great, fine, flat, tense

### Tasks, in two columns
The app keeps *what the team owes* and *what you owe them* separate, because
they are different jobs. Team tasks can be assigned to a specific student and
linked to the meeting where they were agreed. TA tasks are your own list
("chase facilities", "review the PR", "book the demo room").

Statuses are **to do / in progress / blocked / done**, with priority and a due
date. Click the tick box on any row to complete or reopen it.

### Milestones and progress
Milestones are the checkpoints from the syllabus — proposal, design review, MVP,
final demo. Give them a **weight** if some matter more than others, and the
progress bar computes itself: done counts fully, in-progress counts half.

Overall team progress blends milestones (70%) with task completion (30%).

### Meeting prep
The tab that earns its keep on a Thursday morning. It builds a suggested agenda
from what was still open after your last check-in — blocked work, things that
slipped past their due date, milestones coming up — and shows you what you owe
the team before you walk in. Copy the agenda, or start a meeting pre-filled with it.

### Notes and thoughts
Anything that is not a meeting or a task. Tag them *thought, observation,
concern, kudos, idea, grading*, attach them to a team or a specific student, and
pin the ones you want on the dashboard. This is where "Wen has been quiet three
weeks running" lives.

### Dashboard
What needs you today: overdue work, what is due this week, your own to-do list,
upcoming milestones, and automatic risk flags — a team you have not met in two
weeks, blocked tasks, milestones past their date, a team with no students added.

### Timeline
Every meeting, milestone and deadline across both teams on one line, split into
what is ahead and what is behind, grouped by month.

### Search
One box across meeting notes (including your private ones), decisions, blockers,
tasks, notes, student names and project text. Press `/` anywhere to jump to it.

### Reports and backup
Each team has a **Report** tab that renders the whole semester as Markdown —
project details, a per-student table with attendance and task counts, milestones,
open tasks and the full meeting log. Your private meeting notes are left out, so
it is safe to share or paste into an evaluation. Copy it or download the `.md`.

**Backup** exports every entity as one JSON file, and restores it either by
replacing everything or merging alongside what is there.

---

## Running under pm2

`ecosystem.config.cjs` defines the processes. Start everything with:

```bash
npm run pm2:start
```

The app is then at **http://127.0.0.1:6970** and stays up across crashes and
logouts.

Two processes are defined, both in the `project-tracker` namespace:

| Process | What it is |
| --- | --- |
| `project-tracker` | The app. One process serves the API *and* the frontend, so port 6970 is the whole thing — there is no separate frontend server to start. |
| `project-tracker-backup` | Not a server. A job pm2 runs every **Friday at 17:00** to write a JSON backup. It shows as `stopped` between runs, which is correct. |

| Command | Does |
| --- | --- |
| `npm run pm2:start` | Start both, and save the list so they come back on reboot |
| `npm run pm2:stop` | Stop both |
| `npm run pm2:restart` | Restart both (after changing code) |
| `npm run pm2:status` | Show just this project's processes |
| `npm run pm2:logs` | Follow the app log |
| `npm run pm2:delete` | Remove both from pm2 entirely |
| `npm run pm2:dev` | Start the app only, restarting on file changes |

These are scoped to this project — they will not touch anything else you have
under pm2. Logs are written to `logs/` rather than `~/.pm2/logs`.

**Changing the port.** Edit `PORT` in `ecosystem.config.cjs`, or override it
without editing the file:

```bash
TRACKER_PORT=7000 npm run pm2:restart
```

**Surviving a reboot.** `npm run pm2:start` already runs `pm2 save`. To make pm2
itself start at login, run this once — it needs your password, so run it
yourself:

```bash
pm2 startup
```

It prints a `sudo ...` line; copy and run that line, then `pm2 save` once more.

**Changing the backup schedule.** Edit `cron_restart` in
`ecosystem.config.cjs` — `'0 17 * * 5'` is Fridays at 5pm; `'0 17 * * *'` would
be daily. Then `npm run pm2:restart`.

### A note on the entry point

pm2 loads a script through its own wrapper rather than running it as the process
entry point. That means a module which only starts listening when it detects it
is "the main module" comes up **`online` in pm2 but never actually listens** —
a silent failure with no error in the log.

So the pm2 entry point is `bin/start.js`, which unconditionally calls
`startServer()`. `server.js` still starts if you run `node server.js` directly,
and still exports `createApp` for the tests. If you add another process to the
ecosystem file, point it at a script that starts its work on import.

---

## Keeping your data safe

Your workspace is the single file `data/tracker.db`. Copy it and you have copied
everything.

```bash
npm run backup     # timestamped JSON into backups/, keeps the last 20
```

Worth running weekly. To automate it on macOS, add a cron entry:

```bash
crontab -e
# then add — runs every Friday at 5pm:
0 17 * * 5 cd /path/to/projectTracker && /usr/local/bin/npm run backup
```

(Use `which npm` to confirm the path on your machine.)

If you run it under pm2, the backup is already scheduled for you — see
[Running under pm2](#running-under-pm2).

---

## Keyboard

| Key | Does |
| --- | --- |
| `/` | Focus the search box |
| `Esc` | Close the open panel |
| `⌘/Ctrl + Enter` | Save the form you are in |
| `Enter` | Save, from any single-line field |

---

## Commands

| Command | Does |
| --- | --- |
| `npm start` | Run the app on http://127.0.0.1:4321 |
| `npm run dev` | Same, restarting when a file changes |
| `npm test` | Run the API test suite |
| `npm run seed` | Load sample data (refuses if the workspace is not empty) |
| `npm run backup` | Write a timestamped JSON backup |
| `npm run reset` | Empty the workspace, backing up first |
| `npm run pm2:start` | Run it in the background under pm2, on port 6970 |

Change the port with `PORT=5000 npm start`, or the data file with
`TRACKER_DB=/path/to/file.db npm start`.

---

## How it is built

```
bin/start.js       Entry point for npm start and pm2
ecosystem.config.cjs  pm2 process definitions (.cjs — package.json is ESM)
server.js          HTTP server, static files, JSON API plumbing
src/db.js          SQLite connection and schema
src/store.js       All data access and the derived logic (progress, risks, prep, reports)
src/api.js         Route table
public/            The client — plain ES modules, no build step
  js/app.js        Hash router and app shell
  js/ui.js         Drawers, forms, toasts, date and display helpers
  js/views/        One module per screen
test/api.test.js   End-to-end tests against a real server and a throwaway database
```

No frameworks and no build step, so there is nothing to reinstall in six months
when you come back to it — `npm start` is the whole story.

The app binds to `127.0.0.1`, so it is reachable only from this machine. The one
outbound request the page makes is to Google Fonts for the typefaces; it falls
back to system fonts offline.

Student notes, private meeting thoughts and grading notes are personal data about
real people. They live only on your disk — keep the machine encrypted (FileVault)
and be deliberate about where backups go.
