#!/usr/bin/env node
// Populates a realistic half-semester of supervision data, so you can try the
// app before typing in your own. Refuses to run over existing data unless
// called with --force.
import { openDb } from '../src/db.js';
import { teams, members, meetings, tasks, milestones, notes, dashboard } from '../src/store.js';

const force = process.argv.includes('--force');
openDb();

if (dashboard().counts.teams > 0 && !force) {
  console.error('\n  There is already data in this workspace.');
  console.error('  Re-run with --force to add the sample teams anyway.\n');
  process.exit(1);
}

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- team one

const atlas = teams.create({
  name: 'Team Atlas',
  course: 'CIS 4000',
  semester: 'Fall 2026',
  project_title: 'Indoor wayfinding for low-vision students',
  project_description:
    'A phone app that gives turn-by-turn audio directions inside Penn buildings, using '
    + 'BLE beacons and wifi fingerprinting. Partnered with Student Disability Services, '
    + 'who will run the final user study.',
  tech_stack: 'React Native · FastAPI · Postgres · BLE',
  repo_url: 'https://github.com/example/atlas',
  meeting_schedule: 'Thursdays 3:00pm · Levine 307',
  status: 'active',
  health: 'watch',
  color: '#2F5D8C',
});

const priya = members.create({
  team_id: atlas.id, name: 'Priya Raman', role: 'Backend / localisation',
  email: 'priya@example.edu', github: 'praman',
  notes: 'Strongest engineer on the team. Tends to take on too much — watch for burnout.',
});
const diego = members.create({
  team_id: atlas.id, name: 'Diego Alvarez', role: 'Mobile / UX',
  email: 'diego@example.edu', github: 'dalvarez',
  notes: 'Good design instincts. Needs pushing on testing.',
});
const wen = members.create({
  team_id: atlas.id, name: 'Wen Li', role: 'Data / evaluation',
  email: 'wen@example.edu', github: 'wenl',
  notes: 'Quiet in meetings but the write-ups are excellent. Ask her directly for opinions.',
});

for (const [title, status, weight, due] of [
  ['Proposal accepted', 'done', 1, day(-45)],
  ['Beacons installed in Levine', 'done', 1, day(-24)],
  ['Design review', 'done', 2, day(-12)],
  ['Working MVP — one building', 'in_progress', 3, day(9)],
  ['User study with SDS', 'pending', 2, day(30)],
  ['Final demo & poster', 'pending', 3, day(51)],
]) {
  milestones.create({ team_id: atlas.id, title, status, weight, due_date: due });
}

const m1 = meetings.create({
  team_id: atlas.id, date: day(-21), title: 'Week 3 — beacon calibration', kind: 'weekly',
  duration_min: 45, mood: 'fine',
  agenda: 'Beacon placement results\nRouting algorithm scope\nDivide up the evaluation work',
  notes:
    'Priya walked through the trilateration results from the Levine basement. Accuracy is '
    + 'roughly ±3m, which is nowhere near enough for turn-by-turn inside a corridor. She '
    + 'proposed switching to wifi fingerprinting with the beacons as a coarse prior.\n\n'
    + 'Diego demoed the map view. It looks good but there is no audio output at all yet, '
    + 'which is the actual point of the project — I pushed on this.\n\n'
    + 'Wen has the evaluation protocol drafted but had not shared it with the others.',
  decisions: 'Switch from trilateration to wifi fingerprinting.\nAudio output is the priority for the MVP, not the visual map.',
  blockers: 'Facilities have not given basement access for the second beacon sweep.',
  private_notes:
    'Wen said almost nothing again until I asked her directly. Diego and Priya talk over '
    + 'her. Worth raising with the two of them separately rather than in the room.',
  attendance: [
    { member_id: priya.id, status: 'present' },
    { member_id: diego.id, status: 'present' },
    { member_id: wen.id, status: 'present' },
  ],
});

const m2 = meetings.create({
  team_id: atlas.id, date: day(-14), title: 'Week 4 — audio prototype', kind: 'weekly',
  duration_min: 30, mood: 'great',
  agenda: 'Audio prototype demo\nFingerprinting progress\nUser study logistics',
  notes:
    'Genuinely good session. Diego had a working audio prototype — it speaks the next '
    + 'turn and the distance, and he had tested it with a blindfold in the corridor.\n\n'
    + 'Priya\'s fingerprinting is at ±1.2m which is good enough. Wen presented the study '
    + 'protocol to the group and took real questions on it.',
  decisions: 'Lock the MVP scope to Levine floors 1-3 only.',
  blockers: 'Still waiting on the IRB determination for the user study.',
  private_notes: 'Much better dynamic this week. Wen presented and they listened.',
  attendance: [
    { member_id: priya.id, status: 'present' },
    { member_id: diego.id, status: 'present' },
    { member_id: wen.id, status: 'present' },
  ],
});

meetings.create({
  team_id: atlas.id, date: day(-7), title: 'Week 5 — integration trouble', kind: 'weekly',
  duration_min: 50, mood: 'tense',
  agenda: 'Integration status\nIRB\nWhat is blocking the MVP',
  notes:
    'The audio layer and the localisation layer do not talk to each other yet, and each '
    + 'of them assumed the other would define the interface. Lost a week to it.\n\n'
    + 'Some friction between Priya and Diego about who owns the integration. I made them '
    + 'agree in the room: Priya defines the interface, Diego consumes it, by Monday.',
  decisions: 'Priya owns the position-feed interface; Diego consumes it. Deadline Monday.',
  blockers: 'IRB determination still not back. Wen cannot recruit participants until it is.',
  private_notes:
    'First real friction. It is ownership ambiguity rather than anything personal, and '
    + 'naming it in the room seemed to settle it. Check on Thursday whether it held.',
  attendance: [
    { member_id: priya.id, status: 'present' },
    { member_id: diego.id, status: 'late' },
    { member_id: wen.id, status: 'absent' },
  ],
});

for (const t of [
  { title: 'Define the position-feed interface', member_id: priya.id, status: 'done', due_date: day(-3), priority: 'high', meeting_id: m2.id },
  { title: 'Consume the position feed in the audio layer', member_id: diego.id, status: 'in_progress', due_date: day(2), priority: 'high' },
  { title: 'Recruit 6 participants for the user study', member_id: wen.id, status: 'blocked', due_date: day(-1), priority: 'high', description: 'Blocked on the IRB determination.' },
  { title: 'Second beacon sweep of the basement', member_id: priya.id, status: 'todo', due_date: day(6) },
  { title: 'Write the evaluation protocol', member_id: wen.id, status: 'done', meeting_id: m1.id },
  { title: 'Accessibility audit of the map view', member_id: diego.id, status: 'todo', due_date: day(12), priority: 'low' },
]) {
  tasks.create({ ...t, team_id: atlas.id, owner: 'team' });
}

for (const t of [
  { title: 'Chase facilities about basement access', status: 'todo', due_date: day(-2), priority: 'high' },
  { title: 'Follow up with the IRB office', status: 'in_progress', due_date: day(1), priority: 'high' },
  { title: 'Review Priya\'s interface PR', status: 'todo', due_date: day(3) },
  { title: 'Send Atlas the design-review rubric', status: 'done' },
]) {
  tasks.create({ ...t, team_id: atlas.id, owner: 'ta' });
}

notes.create({
  team_id: atlas.id, member_id: wen.id, kind: 'concern', pinned: 1,
  title: 'Wen is being talked over',
  body: 'Two meetings running where she only spoke when addressed directly. Her written '
    + 'work is the best on the team, so this is a room problem, not a capability problem. '
    + 'Plan: ask Priya and Diego separately to route the evaluation questions to her.',
});
notes.create({
  team_id: atlas.id, member_id: diego.id, kind: 'kudos',
  body: 'Diego testing the audio prototype blindfolded in the corridor, unprompted, is '
    + 'exactly the instinct this project needs. Worth saying so in the final evaluation.',
});
notes.create({
  team_id: atlas.id, kind: 'observation',
  title: 'Scope risk',
  body: 'They keep adding buildings to the plan. Levine floors 1-3 is already ambitious '
    + 'for the time left. Hold them to it at the next check-in.',
});

// ---------------------------------------------------------------- team two

const borealis = teams.create({
  name: 'Team Borealis',
  course: 'CIS 4000',
  semester: 'Fall 2026',
  project_title: 'Carbon accounting for university labs',
  project_description:
    'A dashboard that pulls freezer, fume-hood and compute usage from building systems '
    + 'and turns it into a per-lab carbon figure, so PIs can see the cost of their setup.',
  tech_stack: 'Next.js · Python · TimescaleDB',
  repo_url: 'https://github.com/example/borealis',
  meeting_schedule: 'Tuesdays 11:00am · Towne 311',
  status: 'active',
  health: 'good',
  color: '#3A6A4E',
});

const sam = members.create({
  team_id: borealis.id, name: 'Sam Okafor', role: 'Data pipeline',
  email: 'sam@example.edu', notes: 'Runs the team in practice. Very organised.',
});
const yuki = members.create({
  team_id: borealis.id, name: 'Yuki Tanaka', role: 'Frontend',
  email: 'yuki@example.edu', notes: 'Fast, but ships without tests. Keep an eye on it.',
});

for (const [title, status, weight, due] of [
  ['Proposal accepted', 'done', 1, day(-45)],
  ['Building-systems data access', 'done', 2, day(-20)],
  ['Design review', 'done', 2, day(-12)],
  ['Pilot with two labs', 'in_progress', 3, day(14)],
  ['Final demo & poster', 'pending', 3, day(51)],
]) {
  milestones.create({ team_id: borealis.id, title, status, weight, due_date: due });
}

meetings.create({
  team_id: borealis.id, date: day(-6), title: 'Week 5 — pilot prep', kind: 'weekly',
  duration_min: 30, mood: 'fine',
  agenda: 'Pilot lab selection\nData quality issues\nDashboard walkthrough',
  notes:
    'Sam has the freezer and fume-hood feeds landing cleanly. Compute usage is harder — '
    + 'the cluster only exposes aggregate figures, not per-lab, so they are estimating '
    + 'by allocation share. I said that is fine for the pilot as long as the dashboard '
    + 'is honest about it being an estimate.\n\n'
    + 'Yuki walked through the dashboard. It is further along than I expected.',
  decisions: 'Estimate compute by allocation share, and label it as an estimate in the UI.',
  blockers: 'Need a second pilot lab — the first one said yes, the second has not replied.',
  private_notes: 'This team is in good shape. Yuki still has no tests at all, which will '
    + 'bite them during the pilot. Raise it once more, then let them learn it.',
  attendance: [
    { member_id: sam.id, status: 'present' },
    { member_id: yuki.id, status: 'present' },
  ],
});

for (const t of [
  { title: 'Label estimated figures in the dashboard', member_id: yuki.id, status: 'todo', due_date: day(4) },
  { title: 'Write tests for the ingest pipeline', member_id: sam.id, status: 'in_progress', due_date: day(8) },
  { title: 'Confirm the second pilot lab', member_id: sam.id, status: 'todo', due_date: day(3), priority: 'high' },
]) {
  tasks.create({ ...t, team_id: borealis.id, owner: 'team' });
}
tasks.create({
  team_id: borealis.id, owner: 'ta', title: 'Introduce Borealis to the sustainability office',
  status: 'todo', due_date: day(5), priority: 'normal',
});

notes.create({
  team_id: borealis.id, kind: 'observation',
  body: 'Borealis needs less from me than Atlas does. Shift the weekly slot to 20 minutes '
    + 'and give the time to Atlas while their integration is stuck.',
});

// ---------------------------------------------------------------- cross-team

notes.create({
  kind: 'idea', pinned: 1, title: 'Joint demo day',
  body: 'Both teams present to each other two weeks before the final. Cheap to arrange '
    + 'and they would get real questions from people who understand the constraints.',
});
tasks.create({
  owner: 'ta', title: 'Book a room for the joint demo day', status: 'todo', due_date: day(10),
});

const c = dashboard().counts;
console.log(`\n  Seeded: ${c.teams} teams · ${c.members} students · ${c.meetings} meetings · ${c.open_tasks} open tasks\n`);
console.log('  Start the app with:  npm start\n');
