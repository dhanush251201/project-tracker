import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the store at a throwaway database before anything imports it.
const dir = mkdtempSync(join(tmpdir(), 'tracker-test-'));
process.env.TRACKER_DB = join(dir, 'test.db');

const { openDb, closeDb } = await import('../src/db.js');
const { createApp } = await import('../server.js');

openDb(process.env.TRACKER_DB);
const server = createApp();
await new Promise((res) => server.listen(0, '127.0.0.1', res));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => {
  server.close();
  closeDb();
  rmSync(dir, { recursive: true, force: true });
});

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* plain text (markdown report) */ }
  return { status: res.status, data, contentType: res.headers.get('content-type') };
}

const get = (p) => call('GET', p);
const post = (p, b) => call('POST', p, b);
const put = (p, b) => call('PUT', p, b);
const del = (p) => call('DELETE', p);

const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const TODAY = dayOffset(0);

// Ids shared across the ordered tests below.
const ctx = {};

// ---------------------------------------------------------------- basics

test('health and meta respond', async () => {
  const h = await get('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.ok, true);

  const m = await get('/api/meta');
  assert.deepEqual(m.data.task_statuses, ['todo', 'in_progress', 'blocked', 'done']);
});

test('serves the app shell for unknown non-api paths', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Project Tracker/);

  const deep = await fetch(`${base}/teams/1`);
  assert.equal(deep.status, 200);
  assert.match(await deep.text(), /<div class="app">/);
});

test('static assets are served with the right content type', async () => {
  const css = await fetch(`${base}/css/theme.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);

  const js = await fetch(`${base}/js/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('path traversal is refused', async () => {
  const res = await fetch(`${base}/../package.json`, { redirect: 'manual' });
  // Either normalised away or blocked — never the real file.
  const body = res.status === 200 ? await res.text() : '';
  assert.ok(!body.includes('"ta-project-tracker"'), 'must not serve files outside public/');
});

// ---------------------------------------------------------------- teams

test('creates a team and validates input', async () => {
  const bad = await post('/api/teams', { name: '' });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /name is required/i);

  const res = await post('/api/teams', {
    name: 'Team Atlas',
    course: 'CIS 4000',
    semester: 'Fall 2026',
    project_title: 'Campus wayfinding for low-vision students',
    project_description: 'An indoor navigation app using BLE beacons.',
    tech_stack: 'React Native · FastAPI',
    repo_url: 'https://github.com/example/atlas',
    meeting_schedule: 'Thursdays 3pm',
    color: '#2F5D8C',
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.name, 'Team Atlas');
  assert.equal(res.data.progress, null, 'no milestones yet means no progress figure');
  assert.equal(res.data.member_count, 0);
  ctx.teamA = res.data.id;

  const second = await post('/api/teams', { name: 'Team Borealis', course: 'CIS 4000', color: '#D96518' });
  ctx.teamB = second.data.id;
});

test('lists, reads and updates a team', async () => {
  const list = await get('/api/teams');
  assert.equal(list.data.length, 2);

  const one = await get(`/api/teams/${ctx.teamA}`);
  assert.equal(one.data.project_title, 'Campus wayfinding for low-vision students');

  const upd = await put(`/api/teams/${ctx.teamA}`, { health: 'watch', demo_url: 'https://atlas.example' });
  assert.equal(upd.data.health, 'watch');
  assert.equal(upd.data.demo_url, 'https://atlas.example');
  // Untouched fields survive a partial update.
  assert.equal(upd.data.name, 'Team Atlas');

  assert.equal((await get('/api/teams/99999')).status, 404);
});

// ---------------------------------------------------------------- members

test('adds members and rejects orphans', async () => {
  const orphan = await post('/api/members', { name: 'Nobody', team_id: 99999 });
  assert.equal(orphan.status, 400);

  const noTeam = await post('/api/members', { name: 'Nobody' });
  assert.equal(noTeam.status, 400);

  for (const [name, role, email] of [
    ['Priya Raman', 'Backend', 'priya@example.edu'],
    ['Diego Alvarez', 'Frontend', 'diego@example.edu'],
    ['Wen Li', 'ML', 'wen@example.edu'],
  ]) {
    const r = await post('/api/members', { name, role, email, team_id: ctx.teamA });
    assert.equal(r.status, 201);
    ctx[name.split(' ')[0].toLowerCase()] = r.data.id;
  }

  const team = await get(`/api/teams/${ctx.teamA}`);
  assert.equal(team.data.member_count, 3);

  const listed = await get(`/api/members?team_id=${ctx.teamA}`);
  assert.equal(listed.data.length, 3);
  assert.equal(listed.data[0].attendance_rate, null, 'no meetings recorded yet');
});

test('updates and deactivates a member', async () => {
  const upd = await put(`/api/members/${ctx.wen}`, { role: 'ML / data', notes: 'Strong on evaluation.' });
  assert.equal(upd.data.role, 'ML / data');
  assert.equal(upd.data.notes, 'Strong on evaluation.');

  await put(`/api/members/${ctx.wen}`, { active: 0 });
  const team = await get(`/api/teams/${ctx.teamA}`);
  assert.equal(team.data.member_count, 2, 'inactive members drop out of the count');
  await put(`/api/members/${ctx.wen}`, { active: 1 });
});

// ---------------------------------------------------------------- meetings

test('logs a meeting with attendance', async () => {
  const res = await post('/api/meetings', {
    team_id: ctx.teamA,
    date: dayOffset(-7),
    title: 'Week 3 — beacon calibration',
    kind: 'weekly',
    agenda: 'Review beacon placement; scope the routing algorithm.',
    notes: 'Priya walked through the BLE trilateration results. Accuracy is ±3m indoors, '
      + 'which is not good enough for turn-by-turn. Diego demoed the map view.',
    decisions: 'Switch to fingerprinting instead of trilateration.',
    blockers: 'Waiting on facilities for access to the Levine basement.',
    private_notes: 'Wen was quiet again. Check whether she is being crowded out.',
    mood: 'fine',
    duration_min: 45,
    attendance: [
      { member_id: ctx.priya, status: 'present' },
      { member_id: ctx.diego, status: 'present' },
      { member_id: ctx.wen, status: 'absent' },
    ],
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.attendance.length, 3);
  ctx.meeting1 = res.data.id;

  const bad = await post('/api/meetings', { team_id: 99999 });
  assert.equal(bad.status, 400);
});

test('attendance feeds per-student stats', async () => {
  await post('/api/meetings', {
    team_id: ctx.teamA,
    date: dayOffset(-1),
    title: 'Week 4 — routing',
    attendance: [
      { member_id: ctx.priya, status: 'present' },
      { member_id: ctx.diego, status: 'present' },
      { member_id: ctx.wen, status: 'present' },
    ],
  });

  const priya = await get(`/api/members/${ctx.priya}`);
  assert.equal(priya.data.meetings_recorded, 2);
  assert.equal(priya.data.meetings_attended, 2);
  assert.equal(priya.data.attendance_rate, 100);

  const wen = await get(`/api/members/${ctx.wen}`);
  assert.equal(wen.data.attendance_rate, 50, 'one absence out of two meetings');
});

test('editing a meeting replaces attendance rather than duplicating it', async () => {
  const upd = await put(`/api/meetings/${ctx.meeting1}`, {
    notes: 'Updated write-up.',
    attendance: [
      { member_id: ctx.priya, status: 'present' },
      { member_id: ctx.diego, status: 'late' },
      { member_id: ctx.wen, status: 'absent' },
    ],
  });
  assert.equal(upd.data.attendance.length, 3);
  assert.equal(upd.data.notes, 'Updated write-up.');
  assert.equal(upd.data.title, 'Week 3 — beacon calibration', 'partial update keeps other fields');
  const diego = upd.data.attendance.find((a) => a.member_id === ctx.diego);
  assert.equal(diego.status, 'late');
});

test('turning up late still counts as attending', async () => {
  // Diego is 'late' for one of two meetings and 'present' for the other.
  const diego = (await get(`/api/members/${ctx.diego}`)).data;
  assert.equal(diego.meetings_recorded, 2);
  assert.equal(diego.meetings_attended, 2, 'late is attendance, not absence');
  assert.equal(diego.attendance_rate, 100);

  // An absence still counts against the rate.
  const wen = (await get(`/api/members/${ctx.wen}`)).data;
  assert.equal(wen.attendance_rate, 50);
});

// ---------------------------------------------------------------- tasks

test('creates team tasks and TA tasks', async () => {
  const bad = await post('/api/tasks', { title: '' });
  assert.equal(bad.status, 400);

  const badStatus = await post('/api/tasks', { title: 'x', status: 'nonsense' });
  assert.equal(badStatus.status, 400);

  const t1 = await post('/api/tasks', {
    team_id: ctx.teamA,
    meeting_id: ctx.meeting1,
    member_id: ctx.priya,
    title: 'Implement wifi fingerprinting prototype',
    owner: 'team',
    priority: 'high',
    due_date: dayOffset(-2),
  });
  assert.equal(t1.status, 201);
  assert.equal(t1.data.member_name, 'Priya Raman');
  assert.equal(t1.data.team_name, 'Team Atlas');
  ctx.task1 = t1.data.id;

  const t2 = await post('/api/tasks', {
    team_id: ctx.teamA, title: 'Draft the design-review rubric', owner: 'ta', due_date: dayOffset(3),
  });
  ctx.task2 = t2.data.id;

  await post('/api/tasks', {
    team_id: ctx.teamA, title: 'Write the evaluation plan', owner: 'team', status: 'blocked',
  });
  await post('/api/tasks', {
    team_id: ctx.teamA, title: 'Set up CI', owner: 'team', status: 'done',
  });
  // A personal task with no team at all.
  await post('/api/tasks', { title: 'Email the course staff about demo slots', owner: 'ta' });
});

test('task filters work', async () => {
  const mine = await get('/api/tasks?owner=ta');
  assert.equal(mine.data.length, 2);

  const teamOnly = await get(`/api/tasks?team_id=${ctx.teamA}&owner=team`);
  assert.equal(teamOnly.data.length, 3);

  const blocked = await get('/api/tasks?status=blocked');
  assert.equal(blocked.data.length, 1);

  const open = await get('/api/tasks?open=1');
  assert.ok(open.data.every((t) => t.status !== 'done'));

  const byMember = await get(`/api/tasks?member_id=${ctx.priya}`);
  assert.equal(byMember.data.length, 1);
});

test('completing a task stamps completed_at, reopening clears it', async () => {
  const done = await put(`/api/tasks/${ctx.task1}`, { status: 'done' });
  assert.equal(done.data.status, 'done');
  assert.ok(done.data.completed_at, 'completed_at should be set');

  const reopened = await put(`/api/tasks/${ctx.task1}`, { status: 'todo' });
  assert.equal(reopened.data.completed_at, null);
});

// ---------------------------------------------------------------- milestones

test('milestones drive weighted progress', async () => {
  const mk = (title, status, weight, due) => post('/api/milestones', {
    team_id: ctx.teamA, title, status, weight, due_date: due,
  });

  await mk('Proposal accepted', 'done', 1, dayOffset(-30));
  await mk('Design review', 'done', 1, dayOffset(-14));
  await mk('MVP demo', 'in_progress', 2, dayOffset(10));
  const missed = await mk('Beacon deployment', 'pending', 1, dayOffset(-3));
  ctx.milestone = missed.data.id;

  // done: 1+1 = 2, in_progress: 2*0.5 = 1 → 3 of 5 total weight = 60%
  const team = await get(`/api/teams/${ctx.teamA}`);
  assert.equal(team.data.milestone_progress, 60);
  assert.equal(team.data.milestone_overdue, 1, 'the pending past-due milestone is flagged');

  const badStatus = await post('/api/milestones', { team_id: ctx.teamA, title: 'x', status: 'bogus' });
  assert.equal(badStatus.status, 400);
});

test('overall progress blends milestones and tasks', async () => {
  const team = (await get(`/api/teams/${ctx.teamA}`)).data;
  const expected = Math.round(team.milestone_progress * 0.7 + team.task_progress * 0.3);
  assert.equal(team.progress, expected);
});

// ---------------------------------------------------------------- notes

test('notes attach to teams and students', async () => {
  const n1 = await post('/api/notes', {
    team_id: ctx.teamA,
    member_id: ctx.wen,
    kind: 'concern',
    title: 'Wen may be sidelined',
    body: 'Third week running where she has not spoken. Ask her directly what she owns.',
    pinned: 1,
  });
  assert.equal(n1.status, 201);
  ctx.note1 = n1.data.id;

  await post('/api/notes', {
    team_id: ctx.teamA, kind: 'kudos', body: 'Diego\'s map view is genuinely good work.',
  });
  await post('/api/notes', { kind: 'idea', body: 'Run a joint demo day for both teams.' });

  const empty = await post('/api/notes', { body: '', title: '' });
  assert.equal(empty.status, 400);

  const concerns = await get('/api/notes?kind=concern');
  assert.equal(concerns.data.length, 1);
  assert.equal(concerns.data[0].member_name, 'Wen Li');

  const teamNotes = await get(`/api/notes?team_id=${ctx.teamA}`);
  assert.equal(teamNotes.data.length, 2);
});

test('notes carry their team colour so the UI can tint them', async () => {
  await put(`/api/teams/${ctx.teamA}`, { color: '#1B9E8F' });

  const all = (await get('/api/notes')).data;
  const teamNote = all.find((n) => n.team_id === ctx.teamA);
  assert.equal(teamNote.team_color, '#1B9E8F');
  assert.equal(teamNote.team_name, 'Team Atlas');

  // A note with no team must not borrow a colour.
  const general = all.find((n) => n.team_id === null);
  assert.ok(general, 'expected a note with no team');
  assert.equal(general.team_color, null);
  assert.equal(general.team_name, null);

  // Pinned notes on the dashboard need the colour too.
  const pinned = (await get('/api/dashboard')).data.pinned_notes;
  assert.ok(pinned.length > 0);
  for (const n of pinned) {
    if (n.team_id) assert.ok(n.team_color, `pinned note ${n.id} is missing its team colour`);
  }

  await put(`/api/teams/${ctx.teamA}`, { color: '#2F5D8C' });
});

// ---------------------------------------------------------------- derived views

test('team/full bundles everything the page needs', async () => {
  const full = (await get(`/api/teams/${ctx.teamA}/full`)).data;
  assert.equal(full.name, 'Team Atlas');
  assert.equal(full.members.length, 3);
  assert.equal(full.meetings.length, 2);
  assert.equal(full.milestones.length, 4);
  assert.ok(full.tasks.length >= 4);
  assert.ok(Array.isArray(full.risks));
  assert.ok(full.risks.some((r) => /milestone/i.test(r.text)), 'late milestone should raise a risk');
});

test('meeting prep carries open work forward', async () => {
  const prep = (await get(`/api/teams/${ctx.teamA}/prep`)).data;
  assert.equal(prep.team.name, 'Team Atlas');
  assert.ok(prep.last_meeting, 'should find the most recent meeting');
  assert.ok(prep.suggested_agenda.length > 3);
  assert.ok(prep.open_team_tasks.length >= 1);
  assert.ok(prep.my_open_tasks.some((t) => t.title.includes('rubric')));
  // Blocked work sorts to the front of the carry-over list.
  assert.equal(prep.open_team_tasks[0].status, 'blocked');
  // Agenda lines are for a human to read, so dates are formatted, not ISO.
  const followUp = prep.suggested_agenda[0];
  assert.match(followUp, /Follow up on last meeting \([A-Z][a-z]{2} \d{1,2}/);
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(prep.suggested_agenda.join(' ')), 'no raw ISO dates in the agenda');
});

test('dashboard aggregates across teams', async () => {
  const d = (await get('/api/dashboard')).data;
  assert.equal(d.counts.teams, 2);
  assert.equal(d.counts.members, 3);
  assert.ok(d.my_open_tasks.length >= 2);
  assert.ok(d.overdue_tasks.some((t) => t.title.includes('fingerprinting')));
  assert.ok(d.pinned_notes.length === 1);
  assert.ok(d.risks.length > 0);
  assert.ok(d.teams.every((t) => 'progress' in t));
  // Team Borealis has never met, which should be flagged.
  assert.ok(d.risks.some((r) => r.team_name === 'Team Borealis' && /no meetings/i.test(r.text)));
});

test('every risk flag names the tab that resolves it', async () => {
  // A warning the UI cannot make clickable is a dead end, so each risk must
  // carry a destination.
  const bare = (await post('/api/teams', { name: 'Team Bare' })).data;
  const risks = (await get(`/api/teams/${bare.id}/full`)).data.risks;

  assert.ok(risks.length > 0);
  for (const r of risks) {
    assert.ok(r.tab, `risk "${r.text}" is missing a tab`);
    assert.ok(
      ['members', 'meetings', 'tasks', 'milestones'].includes(r.tab),
      `risk "${r.text}" points at unknown tab "${r.tab}"`,
    );
  }
  assert.ok(risks.some((r) => r.tab === 'members' && /no team members/i.test(r.text)));
  assert.ok(risks.some((r) => r.tab === 'meetings'));

  // Adding a member clears the members risk.
  await post('/api/members', { name: 'Someone', team_id: bare.id });
  const after = (await get(`/api/teams/${bare.id}/full`)).data.risks;
  assert.ok(!after.some((r) => r.tab === 'members'));

  // Dashboard risks carry the tab through too.
  const dash = (await get('/api/dashboard')).data;
  for (const r of dash.risks) assert.ok(r.tab, `dashboard risk "${r.text}" is missing a tab`);

  await del(`/api/teams/${bare.id}`);
});

test('risk flags escalate with staleness', async () => {
  const old = await post('/api/teams', { name: 'Team Stale' });
  await post('/api/meetings', { team_id: old.data.id, date: dayOffset(-20), title: 'Long ago' });
  const risks = (await get(`/api/teams/${old.data.id}/full`)).data.risks;
  assert.ok(risks.some((r) => r.level === 'danger' && /20 days since/.test(r.text)));
  await del(`/api/teams/${old.data.id}`);
});

// ---------------------------------------------------------------- search

test('search spans notes, meetings, tasks, members and teams', async () => {
  const hits = (await get('/api/search?q=fingerprinting')).data.results;
  assert.ok(hits.some((r) => r.type === 'task'));
  assert.ok(hits.some((r) => r.type === 'meeting'), 'the decision text mentions fingerprinting');

  const priya = (await get('/api/search?q=Priya')).data.results;
  assert.ok(priya.some((r) => r.type === 'member'));

  // Meeting hits are titled for reading, not with raw ISO dates.
  const meetingHit = hits.find((r) => r.type === 'meeting');
  assert.match(meetingHit.title, /^[A-Z][a-z]{2} \d{1,2}/);

  // Private meeting notes are searchable by the TA.
  const priv = (await get('/api/search?q=crowded%20out')).data.results;
  assert.ok(priv.some((r) => r.type === 'meeting'));

  const none = (await get('/api/search?q=zzzznothing')).data.results;
  assert.equal(none.length, 0);

  const blank = (await get('/api/search?q=')).data.results;
  assert.equal(blank.length, 0);
});

test('search is case insensitive', async () => {
  const lower = (await get('/api/search?q=atlas')).data.results;
  const upper = (await get('/api/search?q=ATLAS')).data.results;
  assert.equal(lower.length, upper.length);
  assert.ok(lower.length > 0);
});

// ---------------------------------------------------------------- report

test('markdown report includes the log but not private notes', async () => {
  const res = await get(`/api/teams/${ctx.teamA}/report`);
  assert.equal(res.status, 200);
  assert.match(res.contentType, /text\/markdown/);
  const md = res.data;
  assert.match(md, /^# Team Atlas/m);
  assert.match(md, /Campus wayfinding/);
  assert.match(md, /\| Priya Raman \|/);
  assert.match(md, /## Milestones/);
  assert.match(md, /- \[x\] \*\*Proposal accepted\*\*/);
  assert.match(md, /## Meeting log/);
  assert.match(md, /Week 3 — beacon calibration/);
  assert.ok(!md.includes('crowded out'), 'private meeting notes must stay out of the report');

  assert.equal((await get('/api/teams/99999/report')).status, 404);
});

// ---------------------------------------------------------------- backup

test('export then replace-import round-trips every entity', async () => {
  const before = (await get('/api/export')).data;
  assert.equal(before.format, 'ta-project-tracker');
  const counts = {
    teams: before.teams.length,
    members: before.members.length,
    meetings: before.meetings.length,
    attendance: before.attendance.length,
    tasks: before.tasks.length,
    milestones: before.milestones.length,
    notes: before.notes.length,
  };

  const res = await post('/api/import', { payload: before, mode: 'replace' });
  assert.equal(res.status, 201);

  const after = (await get('/api/export')).data;
  for (const [k, n] of Object.entries(counts)) {
    assert.equal(after[k].length, n, `${k} count should survive the round trip`);
  }

  // Relationships must be rewired to the new ids, not left dangling.
  const atlas = after.teams.find((t) => t.name === 'Team Atlas');
  const full = (await get(`/api/teams/${atlas.id}/full`)).data;
  assert.equal(full.members.length, 3);
  assert.equal(full.meetings.length, 2);
  assert.ok(full.tasks.some((t) => t.member_name === 'Priya Raman'), 'task assignee survived');
  const wen = full.members.find((m) => m.name === 'Wen Li');
  assert.equal(wen.attendance_rate, 50, 'attendance survived the round trip');
  ctx.teamA = atlas.id;
});

test('merge import doubles the data', async () => {
  const snapshot = (await get('/api/export')).data;
  const teamsBefore = snapshot.teams.length;
  await post('/api/import', { payload: snapshot, mode: 'merge' });
  const after = (await get('/api/export')).data;
  assert.equal(after.teams.length, teamsBefore * 2);

  // Put it back the way it was.
  await post('/api/import', { payload: snapshot, mode: 'replace' });
  assert.equal((await get('/api/export')).data.teams.length, teamsBefore);
  ctx.teamA = (await get('/api/teams')).data.find((t) => t.name === 'Team Atlas').id;
});

test('import rejects a file that is not a tracker backup', async () => {
  const res = await post('/api/import', { payload: { hello: 'world' }, mode: 'replace' });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /not a project-tracker export/i);

  // The rejection must not have wiped anything.
  assert.ok((await get('/api/teams')).data.length > 0);
});

// ---------------------------------------------------------------- deletion

test('deleting a team cascades to its children', async () => {
  const team = (await post('/api/teams', { name: 'Team Ephemeral' })).data;
  const member = (await post('/api/members', { name: 'Temp Student', team_id: team.id })).data;
  const meeting = (await post('/api/meetings', {
    team_id: team.id, date: TODAY, attendance: [{ member_id: member.id, status: 'present' }],
  })).data;
  await post('/api/tasks', { team_id: team.id, title: 'Temp task', member_id: member.id });
  await post('/api/milestones', { team_id: team.id, title: 'Temp milestone' });
  await post('/api/notes', { team_id: team.id, body: 'Temp note' });

  assert.equal((await del(`/api/teams/${team.id}`)).status, 200);
  assert.equal((await get(`/api/teams/${team.id}`)).status, 404);
  assert.equal((await get(`/api/members/${member.id}`)).status, 404);
  assert.equal((await get(`/api/meetings/${meeting.id}`)).status, 404);

  const dump = (await get('/api/export')).data;
  assert.ok(!dump.tasks.some((t) => t.title === 'Temp task'));
  assert.ok(!dump.milestones.some((m) => m.title === 'Temp milestone'));
  assert.ok(!dump.notes.some((n) => n.body === 'Temp note'));
  assert.ok(!dump.attendance.some((a) => a.meeting_id === meeting.id));
});

test('deleting a member keeps their tasks but unassigns them', async () => {
  const m = (await post('/api/members', { name: 'Leaver', team_id: ctx.teamA })).data;
  const t = (await post('/api/tasks', {
    team_id: ctx.teamA, title: 'Orphaned task', member_id: m.id,
  })).data;

  await del(`/api/members/${m.id}`);
  const after = (await get(`/api/tasks/${t.id}`)).data;
  assert.equal(after.member_id, null, 'assignee is cleared, task survives');
  assert.equal(after.title, 'Orphaned task');
  await del(`/api/tasks/${t.id}`);
});

test('deleting a meeting keeps its action items', async () => {
  const meet = (await post('/api/meetings', { team_id: ctx.teamA, date: TODAY, title: 'Doomed' })).data;
  const task = (await post('/api/tasks', {
    team_id: ctx.teamA, meeting_id: meet.id, title: 'Survivor task',
  })).data;
  await del(`/api/meetings/${meet.id}`);
  const after = (await get(`/api/tasks/${task.id}`)).data;
  assert.equal(after.meeting_id, null);
  assert.equal(after.title, 'Survivor task');
  await del(`/api/tasks/${task.id}`);
});

test('404s and bad payloads behave', async () => {
  assert.equal((await get('/api/nope')).status, 404);
  assert.equal((await put('/api/tasks/99999', { title: 'x' })).status, 404);
  assert.equal((await del('/api/notes/99999')).status, 404);
  assert.equal((await get('/api/meetings/99999')).status, 404);

  const res = await fetch(`${base}/api/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
});

test('text with quotes, unicode and newlines round-trips intact', async () => {
  const tricky = 'Quotes "double" & \'single\', <script>alert(1)</script>,\nnewline, émoji 🎓, 50% — dash';
  const n = (await post('/api/notes', { body: tricky, title: 'Tricky' })).data;
  const back = (await get(`/api/notes/${n.id}`)).data;
  assert.equal(back.body, tricky);

  const found = (await get('/api/search?q=' + encodeURIComponent('émoji'))).data.results;
  assert.ok(found.some((r) => r.id === n.id));
  await del(`/api/notes/${n.id}`);
});
