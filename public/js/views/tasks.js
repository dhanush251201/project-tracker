import { api } from '../api.js';
import { esc, todayStr, isOverdue } from '../ui.js';
import { taskList, wireTasks, figure } from './components.js';
import { taskForm } from './forms.js';

const OWNERS = [
  ['', 'Everyone'],
  ['team', 'Team tasks'],
  ['ta', 'Mine (TA)'],
];
const DUES = [
  ['', 'Any date'],
  ['overdue', 'Overdue'],
  ['week', 'Next 7 days'],
  ['none', 'No due date'],
];

export default async function tasksView({ query, state, refresh }) {
  const owner = query.owner || '';
  const teamId = query.team || '';
  const due = query.due || '';
  const show = query.show || 'open';

  let list = await api.tasks.list({
    owner: owner || undefined,
    team_id: teamId || undefined,
  });

  if (show === 'open') list = list.filter((t) => t.status !== 'done');
  if (show === 'done') list = list.filter((t) => t.status === 'done');

  const today = todayStr();
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (due === 'overdue') list = list.filter((t) => isOverdue(t.due_date, t.status));
  if (due === 'week') list = list.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekOut);
  if (due === 'none') list = list.filter((t) => !t.due_date);

  const link = (patch) => {
    const q = { owner, team: teamId, due, show, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return `#/tasks${p.toString() ? `?${p}` : ''}`;
  };

  const chipRow = (label, opts, current, key) => `
    <div style="margin-bottom:10px">
      <div class="micro" style="margin-bottom:6px">${esc(label)}</div>
      <div class="chips">
        ${opts.map(([v, l]) => `<a class="chip ${current === v ? 'on' : ''}" href="${link({ [key]: v })}">${esc(l)}</a>`).join('')}
      </div>
    </div>`;

  const teamChips = [['', 'All teams'], ...state.teams.map((t) => [String(t.id), t.name])];

  const side = `
    <div class="sidehead">Filter</div>
    ${chipRow('Owner', OWNERS, owner, 'owner')}
    ${chipRow('Team', teamChips, teamId, 'team')}
    ${chipRow('Due', DUES, due, 'due')}
    ${chipRow('Show', [['open', 'Open'], ['done', 'Done'], ['all', 'All']], show, 'show')}`;

  const overdueCount = list.filter((t) => isOverdue(t.due_date, t.status)).length;
  const blocked = list.filter((t) => t.status === 'blocked');

  const content = `
    <div class="pagehead">
      <div class="grow">
        <h1>Tasks</h1>
        <div class="deck">${list.length} shown${owner === 'ta' ? ' · your own list' : ''}</div>
      </div>
      <button class="btn" id="tv-add">＋ New task</button>
    </div>

    <div class="grid c4" style="margin:16px 0">
      ${figure(list.filter((t) => t.status !== 'done').length, 'open')}
      ${figure(overdueCount, 'overdue', overdueCount > 0)}
      ${figure(blocked.length, 'blocked', blocked.length > 0)}
      ${figure(list.filter((t) => t.status === 'done').length, 'done')}
    </div>

    <div class="card">
      ${taskList(list, { showTeam: true, emptyText: 'Nothing matches these filters.' })}
    </div>`;

  return {
    content,
    side,
    mount(root) {
      root.querySelector('#tv-add').addEventListener('click', () => taskForm(null, {
        team_id: teamId ? Number(teamId) : undefined,
        owner: owner || 'team',
      }, refresh));
      wireTasks(root, refresh, taskForm);
    },
  };
}
