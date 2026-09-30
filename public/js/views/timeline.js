import { api } from '../api.js';
import { esc, flag, fmtDate, relDate, todayStr, parseDate } from '../ui.js';
import { taskForm } from './forms.js';

const TYPES = [
  ['', 'Everything'],
  ['meeting', 'Meetings'],
  ['milestone', 'Milestones'],
  ['task', 'Task deadlines'],
];

export default async function timelineView({ query, state, refresh }) {
  const typeFilter = query.type || '';
  const teamFilter = query.team || '';
  const today = todayStr();

  const [meetings, milestones, tasks] = await Promise.all([
    api.meetings.list(teamFilter ? { team_id: teamFilter } : undefined),
    api.milestones.list(teamFilter ? { team_id: teamFilter } : undefined),
    api.tasks.list(teamFilter ? { team_id: teamFilter } : undefined),
  ]);

  const teamById = new Map(state.teams.map((t) => [t.id, t]));
  const teamName = (id) => (teamById.get(id) || {}).name || '';
  const teamColor = (id) => (teamById.get(id) || {}).color || 'var(--accent)';

  const events = [];
  for (const m of meetings) {
    events.push({
      date: m.date, type: 'meeting', team_id: m.team_id,
      title: m.title || 'Check-in',
      detail: `${(m.attendance || []).filter((a) => a.status === 'present').length}/${(m.attendance || []).length} present · ${m.kind}`,
      link: `#/teams/${m.team_id}/meetings`, status: 'done',
    });
  }
  for (const ms of milestones) {
    if (!ms.due_date) continue;
    events.push({
      date: ms.due_date, type: 'milestone', team_id: ms.team_id,
      title: ms.title, detail: ms.description || '',
      link: `#/teams/${ms.team_id}/milestones`, status: ms.status,
      weight: ms.weight,
    });
  }
  for (const t of tasks) {
    if (!t.due_date) continue;
    events.push({
      date: t.due_date, type: 'task', team_id: t.team_id,
      title: t.title,
      detail: `${t.owner === 'ta' ? 'mine' : t.member_name || 'team'} · ${t.status}`,
      link: t.team_id ? `#/teams/${t.team_id}/tasks` : '#/tasks',
      status: t.status, taskId: t.id,
    });
  }

  const shown = events.filter((e) => (!typeFilter || e.type === typeFilter));
  shown.sort((a, b) => a.date.localeCompare(b.date));

  const past = shown.filter((e) => e.date < today);
  const future = shown.filter((e) => e.date >= today);

  const link = (patch) => {
    const q = { type: typeFilter, team: teamFilter, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return `#/timeline${p.toString() ? `?${p}` : ''}`;
  };

  const chips = (label, opts, current, key) => `
    <div style="margin-bottom:10px">
      <div class="micro" style="margin-bottom:6px">${esc(label)}</div>
      <div class="chips">${opts.map(([v, l]) =>
    `<a class="chip ${current === v ? 'on' : ''}" href="${link({ [key]: v })}">${esc(l)}</a>`).join('')}</div>
    </div>`;

  const side = `
    <div class="sidehead">Filter</div>
    ${chips('Type', TYPES, typeFilter, 'type')}
    ${chips('Team', [['', 'All teams'], ...state.teams.map((t) => [String(t.id), t.name])], teamFilter, 'team')}
    <div class="sidehead">Legend</div>
    <div class="chips">
      <span class="flag info">meeting</span>
      <span class="flag accent">milestone</span>
      <span class="flag warning">task due</span>
    </div>`;

  const TYPE_FLAG = { meeting: 'info', milestone: 'accent', task: 'warning' };

  const itemHtml = (e) => {
    const late = e.date < today && e.type !== 'meeting' && e.status !== 'done';
    const cls = e.status === 'done' ? 'done' : e.status === 'missed' || late ? 'missed' : 'pending';
    return `
      <div class="tl-item ${cls}">
        <div class="tl-head">
          <span class="tnum micro" style="min-width:74px">${esc(fmtDate(e.date))}</span>
          <a href="${e.link}" style="font-size:.93rem;color:var(--ink)">${esc(e.title)}</a>
          ${flag(e.type, TYPE_FLAG[e.type])}
          ${e.team_id ? `<span class="micro" style="color:${esc(teamColor(e.team_id))}">● ${esc(teamName(e.team_id))}</span>` : ''}
          ${late ? flag('overdue', 'critical') : ''}
          <span class="micro" style="margin-left:auto">${esc(relDate(e.date))}</span>
        </div>
        ${e.detail ? `<div class="muted" style="font-size:.82rem;margin-top:2px">${esc(e.detail)}</div>` : ''}
      </div>`;
  };

  const groupByMonth = (list) => {
    const groups = new Map();
    for (const e of list) {
      const d = parseDate(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key).items.push(e);
    }
    return [...groups.values()];
  };

  const renderGroups = (list, emptyText) => (list.length
    ? groupByMonth(list).map((g) => `
        <div class="sidehead" style="margin-top:20px">${esc(g.label)}</div>
        <div class="timeline">${g.items.map(itemHtml).join('')}</div>`).join('')
    : `<div class="empty tight">${esc(emptyText)}</div>`);

  const content = `
    <div class="pagehead">
      <div class="grow">
        <h1>Timeline</h1>
        <div class="deck">Every meeting, milestone and deadline on one line — ${shown.length} events.</div>
      </div>
      <button class="btn" id="tl-add">＋ Task with a deadline</button>
    </div>

    <div class="card" style="margin-top:18px">
      <div class="cardhead"><h2>Ahead</h2><span class="micro">${future.length} upcoming</span></div>
      ${renderGroups(future, 'Nothing scheduled ahead. Add milestones or due dates.')}
    </div>

    <div class="card">
      <div class="cardhead"><h2>Behind</h2><span class="micro">${past.length} past</span></div>
      ${renderGroups([...past].reverse(), 'Nothing in the past yet.')}
    </div>`;

  return {
    content,
    side,
    mount(root) {
      root.querySelector('#tl-add').addEventListener('click',
        () => taskForm(null, { team_id: teamFilter ? Number(teamFilter) : undefined }, refresh));
    },
  };
}
