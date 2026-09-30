import { api } from '../api.js';
import { esc, flag, fmtDate, relDate } from '../ui.js';
import { teamCard, taskList, wireTasks, figure, noteCard, wireNotes } from './components.js';
import { taskForm, noteForm, teamForm } from './forms.js';

export default async function dashboardView({ refresh }) {
  const d = await api.dashboard();
  const reload = refresh;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const alerts = d.risks.filter((r) => r.level === 'danger');
  const warnings = d.risks.filter((r) => r.level === 'warn');

  const risksHtml = d.risks.length
    ? `<div class="card">
         <div class="cardhead"><h2>Needs your attention</h2>
           <span class="micro">${alerts.length} urgent · ${warnings.length} to watch</span></div>
         <div class="rows">
           ${[...alerts, ...warnings].map((r) => `
             <div class="row">
               <div class="grow">
                 <div class="rtitle" style="font-size:.88rem">
                   ${flag(r.level === 'danger' ? 'urgent' : 'watch', r.level === 'danger' ? 'critical' : 'warning')}
                   &nbsp;${esc(r.text)}
                 </div>
                 <div class="rmeta">
                   <a href="#/teams/${r.team_id}${r.tab ? `/${r.tab}` : ''}">${esc(r.team_name)}${r.tab ? ` → ${esc(r.tab)}` : ''}</a>
                 </div>
               </div>
             </div>`).join('')}
         </div>
       </div>`
    : `<div class="card"><h2>Needs your attention</h2>
         <div class="empty tight">${d.teams.length === 0
    ? 'Add a team and anything that needs chasing will surface here.'
    : `Nothing flagged. ${d.teams.length === 1 ? 'The team looks'
      : d.teams.length === 2 ? 'Both teams look' : 'All teams look'} steady.`}</div></div>`;

  const upcoming = d.upcoming_milestones.slice(0, 6);
  const milestonesHtml = upcoming.length
    ? `<div class="rows">${upcoming.map((m) => {
      const late = m.due_date < d.today;
      return `<div class="row">
          <div class="grow">
            <div class="rtitle" style="font-size:.9rem">${esc(m.title)}</div>
            <div class="rmeta">
              <span style="color:${esc(m.team_color)}">●</span> ${esc(m.team_name)}
              <span class="sep">·</span>
              <span class="${late ? 'overdue' : ''}">${late ? 'overdue — ' : ''}${esc(relDate(m.due_date))}</span>
            </div>
          </div>
          <a class="btn ghost sm" href="#/teams/${m.team_id}/milestones">open</a>
        </div>`;
    }).join('')}</div>`
    : '<div class="empty tight">No dated milestones yet.</div>';

  const meetingsHtml = d.recent_meetings.length
    ? `<div class="rows">${d.recent_meetings.map((m) => `
        <div class="row">
          <div class="grow">
            <div class="rtitle" style="font-size:.9rem">${esc(m.title || 'Check-in')}</div>
            <div class="rmeta">${esc(m.team_name || '')}<span class="sep">·</span>${esc(fmtDate(m.date))}
              <span class="sep">·</span>${(m.attendance || []).filter((a) => a.status === 'present').length}/${(m.attendance || []).length} present</div>
          </div>
          <a class="btn ghost sm" href="#/teams/${m.team_id}/meetings">open</a>
        </div>`).join('')}</div>`
    : '<div class="empty tight">No meetings logged yet.</div>';

  const content = `
    <div class="pagehead">
      <div class="grow">
        <h1>${greeting}</h1>
        <div class="deck">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}
          · ${d.counts.teams} team${d.counts.teams === 1 ? '' : 's'}, ${d.counts.members} students</div>
      </div>
      <div class="actions">
        <button class="btn ghost" id="db-new-note">＋ Quick note</button>
        <button class="btn" id="db-new-task">＋ Task</button>
      </div>
    </div>

    <div class="grid c4" style="margin:18px 0 6px">
      ${figure(d.counts.open_tasks, 'open tasks')}
      ${figure(d.overdue_tasks.length, 'overdue', d.overdue_tasks.length > 0)}
      ${figure(d.due_this_week.length, 'due within 7 days')}
      ${figure(d.my_open_tasks.length, 'on my plate')}
    </div>

    <div class="sidehead" style="margin-top:26px">Teams</div>
    ${d.teams.length
    ? `<div class="grid c2">${d.teams.map(teamCard).join('')}</div>`
    : `<div class="card"><div class="empty">
           No teams yet.<br /><br />
           <button class="btn" id="db-first-team">Add your first team</button>
         </div></div>`}

    <div class="grid c2" style="margin-top:22px;align-items:start">
      <div>
        ${risksHtml}
        <div class="card">
          <div class="cardhead"><h2>My TA to-dos</h2>
            <a class="btn link" href="#/tasks?owner=ta">see all</a></div>
          ${taskList(d.my_open_tasks.slice(0, 8), { showTeam: true, emptyText: 'Nothing on your own list.' })}
        </div>
      </div>
      <div>
        <div class="card">
          <div class="cardhead"><h2>Overdue &amp; due soon</h2>
            <a class="btn link" href="#/tasks?due=overdue">see all</a></div>
          ${taskList([...d.overdue_tasks, ...d.due_this_week].slice(0, 10), {
    showTeam: true, emptyText: 'Nothing due in the next week.',
  })}
        </div>
        <div class="card">
          <div class="cardhead"><h2>Upcoming milestones</h2>
            <a class="btn link" href="#/timeline">timeline</a></div>
          ${milestonesHtml}
        </div>
        <div class="card">
          <div class="cardhead"><h2>Recent meetings</h2></div>
          ${meetingsHtml}
        </div>
      </div>
    </div>

    ${d.pinned_notes.length ? `
      <div class="sidehead" style="margin-top:26px">Pinned notes</div>
      <div class="masonry">${d.pinned_notes.map((n) => noteCard(n, { showTeam: true })).join('')}</div>` : ''}
  `;

  return {
    content,
    mount(root) {
      root.querySelector('#db-new-task').addEventListener('click', () => taskForm(null, {}, reload));
      root.querySelector('#db-new-note').addEventListener('click', () => noteForm(null, {}, reload));
      const first = root.querySelector('#db-first-team');
      if (first) first.addEventListener('click', () => teamForm(null));
      wireTasks(root, reload, taskForm);
      wireNotes(root, reload, noteForm);
    },
  };
}
