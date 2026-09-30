import { api } from '../api.js';
import {
  esc, flag, avatar, progressBar, fmtDate, fmtDateLong, relDate,
  openDrawer, toast, toastError, STATUS_LABEL,
} from '../ui.js';
import {
  taskList, wireTasks, meetingRow, meetingDetailHtml, milestoneRow,
  noteCard, wireNotes, figure,
} from './components.js';
import { teamForm, memberForm, meetingForm, taskForm, milestoneForm, noteForm } from './forms.js';

const TABS = [
  ['overview', 'Overview'],
  ['members', 'Members'],
  ['meetings', 'Meetings'],
  ['tasks', 'Tasks'],
  ['milestones', 'Milestones'],
  ['notes', 'Notes'],
  ['prep', 'Meeting prep'],
  ['report', 'Report'],
];

const HEALTH = {
  good: ['on track', 'ok'], watch: ['needs watching', 'warning'],
  risk: ['at risk', 'critical'], unknown: ['not judged', 'info'],
};

export default async function teamView({ params, refresh }) {
  const id = Number(params.id);
  const tab = params.tab || 'overview';
  const t = await api.teams.full(id);
  const reload = refresh;

  const header = `
    <div class="pagehead">
      <div class="grow">
        <div class="micro" style="margin-bottom:4px">
          ${[t.course, t.semester].filter(Boolean).map(esc).join(' · ') || 'capstone team'}
        </div>
        <h1 style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="color:${esc(t.color)}">●</span>${esc(t.name)}
          ${flag(...(HEALTH[t.health] || HEALTH.unknown))}
          ${t.status !== 'active' ? flag(t.status, 'info') : ''}
        </h1>
        ${t.project_title ? `<div class="deck">${esc(t.project_title)}</div>` : ''}
      </div>
      <div class="actions">
        <button class="btn ghost" id="tv-edit">Edit team</button>
        <button class="btn" id="tv-meet">＋ Log meeting</button>
      </div>
    </div>

    <div class="segmented" style="margin:16px 0 20px">
      ${TABS.map(([key, label]) => `
        <a href="#/teams/${id}/${key}" class="${tab === key ? 'on' : ''}">${esc(label)}</a>`).join('')}
    </div>`;

  const body = await renderTab(tab, t, id, reload);

  return {
    content: header + body.html,
    side: sideSummary(t),
    mount(root) {
      root.querySelector('#tv-edit').addEventListener('click', () => teamForm(t, reload));
      root.querySelector('#tv-meet').addEventListener('click',
        () => meetingForm(null, id, t.members.filter((m) => m.active), reload));
      wireTasks(root, reload, taskForm);
      wireNotes(root, reload, noteForm);
      if (body.mount) body.mount(root);
    },
  };
}

// ---------------------------------------------------------------- sidebar

function sideSummary(t) {
  // Every flag links to the tab that resolves it — a warning with nowhere to
  // click is just nagging.
  const risks = t.risks.length
    ? t.risks.map((r) => {
      const chip = flag(r.text, r.level === 'danger' ? 'critical' : 'warning');
      return `<div style="margin-bottom:5px">${r.tab
        ? `<a href="#/teams/${t.id}/${r.tab}" style="text-decoration:none">${chip}</a>`
        : chip}</div>`;
    }).join('')
    : `<div style="font-size:.82rem" class="muted">Nothing flagged.</div>`;

  return `
    <div class="sidehead">${esc(t.name)}</div>
    ${progressBar(t.progress, t.color)}
    <div class="barcap">
      <span class="micro">${t.progress === null ? 'no milestones' : `${t.progress}% complete`}</span>
      <span class="micro">${t.task_done}/${t.task_total} tasks</span>
    </div>
    <dl class="kv" style="margin-top:14px">
      <dt>Meets</dt><dd>${esc(t.meeting_schedule || '—')}</dd>
      <dt>Last met</dt><dd>${t.last_meeting ? esc(relDate(t.last_meeting)) : 'never'}</dd>
      <dt>Members</dt><dd>${t.member_count}</dd>
      <dt>Meetings</dt><dd>${t.meeting_count}</dd>
    </dl>
    <div class="sidehead">Flags</div>
    ${risks}`;
}

// ---------------------------------------------------------------- tabs

async function renderTab(tab, t, id, reload) {
  switch (tab) {
    case 'members': return membersTab(t, id, reload);
    case 'meetings': return meetingsTab(t, id, reload);
    case 'tasks': return tasksTab(t, id, reload);
    case 'milestones': return milestonesTab(t, id, reload);
    case 'notes': return notesTab(t, id, reload);
    case 'prep': return prepTab(t, id, reload);
    case 'report': return reportTab(t, id);
    default: return overviewTab(t, id, reload);
  }
}

// --- overview ---------------------------------------------------

function overviewTab(t, id, reload) {
  const links = [
    t.repo_url && `<a href="${esc(t.repo_url)}" target="_blank" rel="noopener">Repository ↗</a>`,
    t.demo_url && `<a href="${esc(t.demo_url)}" target="_blank" rel="noopener">Demo ↗</a>`,
    t.doc_url && `<a href="${esc(t.doc_url)}" target="_blank" rel="noopener">Docs ↗</a>`,
  ].filter(Boolean);

  const membersHtml = t.members.length
    ? `<div class="tablewrap"><table class="data">
        <thead><tr>
          <th>Student</th><th>Role</th><th>Contact</th>
          <th class="num">Attendance</th><th class="num">Tasks done</th><th></th>
        </tr></thead>
        <tbody>${t.members.map((m) => `
          <tr${m.active ? '' : ' style="opacity:.55"'}>
            <td><span class="who">${avatar(m.name, 'sm')}<span>${esc(m.name)}${m.active ? '' : ' <span class="micro">(inactive)</span>'}</span></span></td>
            <td>${esc(m.role || '—')}</td>
            <td>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '—'}
                ${m.github ? `<div class="micro">${esc(m.github)}</div>` : ''}</td>
            <td class="num">${m.attendance_rate === null ? '—' : `${m.attendance_rate}%<div class="micro">${m.meetings_attended}/${m.meetings_recorded}</div>`}</td>
            <td class="num">${m.tasks_done}/${m.tasks_assigned}</td>
            <td class="num"><button class="btn ghost sm" data-edit-member="${m.id}">edit</button></td>
          </tr>`).join('')}</tbody>
      </table></div>`
    : `<div class="empty tight">
         <p style="margin-bottom:12px">No students added yet.</p>
         <button class="btn" id="tv-add-member-empty">＋ Add your first student</button>
       </div>`;

  const openTasks = t.tasks.filter((x) => x.status !== 'done');

  const html = `
    <div class="grid c4" style="margin-bottom:18px">
      ${figure(`${t.progress ?? 0}%`, 'overall progress')}
      ${figure(openTasks.length, 'open tasks', t.task_overdue > 0)}
      ${figure(t.milestones.filter((m) => m.status === 'done').length + '/' + t.milestones.length, 'milestones done')}
      ${figure(t.meeting_count, 'meetings logged')}
    </div>

    <div class="grid c2" style="align-items:start">
      <div class="card">
        <div class="cardhead"><h2>The project</h2></div>
        ${t.project_description
    ? `<div class="prose" style="margin-bottom:14px">${esc(t.project_description)}</div>`
    : '<div class="muted" style="font-size:.86rem;margin-bottom:14px">No description yet — add one from “Edit team”.</div>'}
        <dl class="kv">
          <dt>Stack</dt><dd>${esc(t.tech_stack || '—')}</dd>
          <dt>Meets</dt><dd>${esc(t.meeting_schedule || '—')}</dd>
          <dt>Status</dt><dd>${esc(t.status)}</dd>
          ${links.length ? `<dt>Links</dt><dd>${links.join(' · ')}</dd>` : ''}
        </dl>
      </div>

      <div class="card">
        <div class="cardhead"><h2>Where it stands</h2></div>
        ${progressBar(t.progress, t.color)}
        <div class="barcap">
          <span class="micro">milestones ${t.milestone_progress ?? 0}%</span>
          <span class="micro">tasks ${t.task_progress ?? 0}%</span>
        </div>
        <div class="flags" style="margin-top:14px">
          ${t.risks.length
    ? t.risks.map((r) => {
      const chip = flag(r.text, r.level === 'danger' ? 'critical' : 'warning');
      return r.tab ? `<a href="#/teams/${id}/${r.tab}" style="text-decoration:none">${chip}</a>` : chip;
    }).join('')
    : flag('nothing flagged', 'ok')}
        </div>
        ${t.milestones.length ? `
          <div class="micro" style="margin:16px 0 8px">Next up</div>
          ${t.milestones.filter((m) => m.status !== 'done').slice(0, 3).map((m) => `
            <div class="row" style="padding:6px 0">
              <div class="grow"><div class="rtitle" style="font-size:.88rem">${esc(m.title)}</div>
              <div class="rmeta">${m.due_date ? esc(relDate(m.due_date)) : 'no date'} <span class="sep">·</span> ${esc(STATUS_LABEL[m.status] || m.status)}</div></div>
            </div>`).join('') || '<div class="muted" style="font-size:.84rem">All milestones done.</div>'}
        ` : ''}
      </div>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Team members</h2>
        <div class="actions">
          <a class="btn link" href="#/teams/${id}/members">manage</a>
          <button class="btn ghost sm" id="tv-add-member">＋ Add student</button>
        </div></div>
      ${membersHtml}
    </div>

    <div class="grid c2" style="align-items:start">
      <div class="card">
        <div class="cardhead"><h2>Open tasks</h2>
          <a class="btn link" href="#/teams/${id}/tasks">all tasks</a></div>
        ${taskList(openTasks.slice(0, 8), { emptyText: 'No open tasks.' })}
      </div>
      <div class="card">
        <div class="cardhead"><h2>Recent meetings</h2>
          <a class="btn link" href="#/teams/${id}/meetings">all meetings</a></div>
        ${t.meetings.length
    ? `<div class="rows">${t.meetings.slice(0, 5).map((m) => meetingRow(m)).join('')}</div>`
    : '<div class="empty tight">No meetings logged yet.</div>'}
      </div>
    </div>`;

  return {
    html,
    mount(root) {
      root.querySelector('#tv-add-member').addEventListener('click', () => memberForm(null, id, reload));
      const emptyAdd = root.querySelector('#tv-add-member-empty');
      if (emptyAdd) emptyAdd.addEventListener('click', () => memberForm(null, id, reload));
      root.querySelectorAll('[data-edit-member]').forEach((b) => {
        b.addEventListener('click', async () => {
          const m = await api.members.get(Number(b.dataset.editMember));
          memberForm(m, id, reload);
        });
      });
      wireMeetingRows(root, t, id, reload);
    },
  };
}

// --- members ----------------------------------------------------

function membersTab(t, id, reload) {
  const active = t.members.filter((m) => m.active);
  const inactive = t.members.filter((m) => !m.active);

  const card = (m) => {
    const theirTasks = t.tasks.filter((x) => x.member_id === m.id);
    const open = theirTasks.filter((x) => x.status !== 'done');
    return `
      <div class="card" ${m.active ? '' : 'style="opacity:.6"'}>
        <div class="cardhead" style="align-items:flex-start;margin-bottom:10px">
          <div class="who" style="align-items:flex-start">
            ${avatar(m.name)}
            <div>
              <h3 style="line-height:1.25">${esc(m.name)}${m.active ? '' : ' <span class="micro">(inactive)</span>'}</h3>
              <div class="micro" style="margin-top:2px">${esc(m.role || 'no role set')}</div>
            </div>
          </div>
          <button class="btn ghost sm" data-edit-member="${m.id}">edit</button>
        </div>

        <dl class="kv">
          ${m.email ? `<dt>Email</dt><dd><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></dd>` : ''}
          ${m.github ? `<dt>GitHub</dt><dd>${esc(m.github)}</dd>` : ''}
          ${m.pennkey ? `<dt>PennKey</dt><dd>${esc(m.pennkey)}</dd>` : ''}
          <dt>Attendance</dt>
          <dd>${m.attendance_rate === null
    ? 'no meetings recorded yet'
    : `${m.attendance_rate}% <span class="micro">(${m.meetings_attended} of ${m.meetings_recorded})</span>`}</dd>
          <dt>Tasks</dt>
          <dd>${m.tasks_assigned === 0 ? 'none assigned' : `${m.tasks_done} of ${m.tasks_assigned} done`}</dd>
        </dl>

        ${m.notes ? `
          <div style="margin-top:12px;border-left:3px solid var(--caution);padding-left:11px">
            <div class="micro" style="color:var(--caution);margin-bottom:4px">Your private notes</div>
            <div class="prose" style="font-size:.86rem">${esc(m.notes)}</div>
          </div>` : ''}

        ${open.length ? `
          <div class="micro" style="margin:14px 0 4px">Open work — ${open.length}</div>
          <div class="rows">${open.map((x) => `
            <div class="row" style="padding:6px 0">
              <div class="grow"><div class="rtitle" style="font-size:.86rem">${esc(x.title)}</div>
                <div class="rmeta">${esc(STATUS_LABEL[x.status] || x.status)}${x.due_date ? ` <span class="sep">·</span> due ${esc(relDate(x.due_date))}` : ''}</div>
              </div>
            </div>`).join('')}</div>` : ''}

        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ghost sm" data-assign="${m.id}">＋ Assign a task</button>
          <button class="btn ghost sm" data-note-about="${m.id}">＋ Note about them</button>
        </div>
      </div>`;
  };

  const html = `
    <div class="pagehead" style="margin-bottom:6px">
      <div class="grow">
        <h2>Team members</h2>
        <div class="deck">${active.length
    ? `${active.length} student${active.length === 1 ? '' : 's'} on ${esc(t.name)}`
    : 'Add the students on this team to track attendance, assignments and individual progress.'}</div>
      </div>
      <button class="btn" id="mb-add">＋ Add student</button>
    </div>

    ${t.members.length === 0 ? `
      <div class="card" style="margin-top:16px">
        <div class="empty">
          <p style="max-width:44ch;margin:0 auto 16px">
            No students yet. Once they are here you can mark who turned up to each
            meeting, assign tasks to individuals, and keep private notes for grading.
          </p>
          <button class="btn" id="mb-add-empty">＋ Add your first student</button>
        </div>
      </div>` : `
      <div class="grid c2" style="align-items:start;margin-top:16px">
        ${active.map(card).join('')}
      </div>
      ${inactive.length ? `
        <div class="sidehead" style="margin-top:22px">No longer on the team</div>
        <div class="grid c2" style="align-items:start">${inactive.map(card).join('')}</div>` : ''}
    `}`;

  return {
    html,
    mount(root) {
      const add = () => memberForm(null, id, reload);
      root.querySelector('#mb-add').addEventListener('click', add);
      const empty = root.querySelector('#mb-add-empty');
      if (empty) empty.addEventListener('click', add);

      root.querySelectorAll('[data-edit-member]').forEach((b) => {
        b.addEventListener('click', async () => {
          const m = await api.members.get(Number(b.dataset.editMember));
          memberForm(m, id, reload);
        });
      });
      root.querySelectorAll('[data-assign]').forEach((b) => {
        b.addEventListener('click', () => taskForm(null, {
          team_id: id, owner: 'team', member_id: Number(b.dataset.assign),
        }, reload));
      });
      root.querySelectorAll('[data-note-about]').forEach((b) => {
        b.addEventListener('click', () => noteForm(null, {
          team_id: id, member_id: Number(b.dataset.noteAbout), kind: 'observation',
        }, reload));
      });
    },
  };
}

// --- meetings ---------------------------------------------------

function meetingsTab(t, id, reload) {
  const html = `
    <div class="card">
      <div class="cardhead">
        <h2>Meeting log</h2>
        <button class="btn sm" id="mt-add">＋ Log a meeting</button>
      </div>
      ${t.meetings.length
    ? `<div class="rows">${t.meetings.map((m) => meetingRow(m)).join('')}</div>`
    : `<div class="empty">Nothing logged yet. After your next check-in, write it up here —
         notes, decisions, who showed up, and what you asked them to do.</div>`}
    </div>`;

  return {
    html,
    mount(root) {
      root.querySelector('#mt-add').addEventListener('click',
        () => meetingForm(null, id, t.members.filter((m) => m.active), reload));
      wireMeetingRows(root, t, id, reload);
    },
  };
}

/** Click a meeting row to read it; the edit button opens the form. */
function wireMeetingRows(root, t, id, reload) {
  root.querySelectorAll('[data-edit-meeting]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const m = await api.meetings.get(Number(btn.dataset.editMeeting));
      meetingForm(m, id, t.members.filter((x) => x.active), reload);
    });
  });
  root.querySelectorAll('[data-meeting]').forEach((row) => {
    row.addEventListener('click', async () => {
      try {
        const m = await api.meetings.get(Number(row.dataset.meeting));
        openDrawer({
          title: m.title || 'Check-in',
          subtitle: `${t.name} · ${fmtDateLong(m.date)}`,
          body: meetingDetailHtml(m),
          footer: `
            <button class="btn ghost left" id="md-task">＋ Action item</button>
            <button class="btn ghost" id="md-edit">Edit</button>
            <button class="btn" data-close-drawer="1">Done</button>`,
          onMount(bodyEl, close, footEl) {
            footEl.querySelector('[data-close-drawer]').addEventListener('click', close);
            footEl.querySelector('#md-edit').addEventListener('click', () => {
              close();
              meetingForm(m, id, t.members.filter((x) => x.active), reload);
            });
            footEl.querySelector('#md-task').addEventListener('click', () => {
              close();
              taskForm(null, { team_id: id, meeting_id: m.id }, reload);
            });
          },
        });
      } catch (err) {
        toastError(err);
      }
    });
  });
}

// --- tasks ------------------------------------------------------

function tasksTab(t, id, reload) {
  const teamTasks = t.tasks.filter((x) => x.owner === 'team');
  const myTasks = t.tasks.filter((x) => x.owner === 'ta');
  const group = (list, status) => list.filter((x) => x.status === status);

  const section = (label, list) => (list.length
    ? `<div class="micro" style="margin:16px 0 6px">${esc(label)} — ${list.length}</div>${taskList(list)}`
    : '');

  const html = `
    <div class="grid c2" style="align-items:start">
      <div class="card">
        <div class="cardhead"><h2>What the team owes</h2>
          <button class="btn sm" id="tk-add-team">＋ Assign task</button></div>
        ${teamTasks.length ? `
          ${section('Blocked', group(teamTasks, 'blocked'))}
          ${section('In progress', group(teamTasks, 'in_progress'))}
          ${section('To do', group(teamTasks, 'todo'))}
          ${section('Done', group(teamTasks, 'done'))}
        ` : '<div class="empty tight">Nothing assigned yet.</div>'}
      </div>

      <div class="card">
        <div class="cardhead"><h2>What I owe them</h2>
          <button class="btn ghost sm" id="tk-add-ta">＋ My task</button></div>
        ${myTasks.length ? `
          ${section('Open', myTasks.filter((x) => x.status !== 'done'))}
          ${section('Done', group(myTasks, 'done'))}
        ` : `<div class="empty tight">Nothing on your own list for this team.<br />
             <span class="muted">e.g. “send them the rubric”, “review their PR”, “book the demo room”.</span></div>`}
      </div>
    </div>`;

  return {
    html,
    mount(root) {
      root.querySelector('#tk-add-team').addEventListener('click',
        () => taskForm(null, { team_id: id, owner: 'team' }, reload));
      root.querySelector('#tk-add-ta').addEventListener('click',
        () => taskForm(null, { team_id: id, owner: 'ta' }, reload));
    },
  };
}

// --- milestones -------------------------------------------------

function milestonesTab(t, id, reload) {
  const html = `
    <div class="card">
      <div class="cardhead">
        <h2>Milestones</h2>
        <button class="btn sm" id="ms-add">＋ Add milestone</button>
      </div>
      <p class="muted" style="font-size:.85rem;margin-bottom:14px">
        Milestones drive the progress bar. Weight them if some matter more than others —
        a “final demo” worth 3 counts three times a “repo set up” worth 1.
      </p>
      ${t.milestones.length
    ? `<div class="timeline">${t.milestones.map(milestoneRow).join('')}</div>`
    : `<div class="empty">No milestones yet. Add the checkpoints from the syllabus —
         proposal, design review, MVP, final demo — and progress starts tracking itself.</div>`}
    </div>`;

  return {
    html,
    mount(root) {
      root.querySelector('#ms-add').addEventListener('click', () => milestoneForm(null, id, reload));
      root.querySelectorAll('[data-edit-milestone]').forEach((b) => {
        b.addEventListener('click', async () => {
          const m = await api.milestones.get(Number(b.dataset.editMilestone));
          milestoneForm(m, id, reload);
        });
      });
    },
  };
}

// --- notes ------------------------------------------------------

function notesTab(t, id, reload) {
  const html = `
    <div class="pagehead" style="margin-bottom:14px">
      <div class="grow"><h2>Notes &amp; thoughts on ${esc(t.name)}</h2>
        <div class="deck">Anything that isn't a meeting or a task — impressions, concerns, things to raise.</div></div>
      <button class="btn" id="nt-add">＋ New note</button>
    </div>
    ${t.notes.length
    // No team label here — every note on this tab is this team's, and the
    // coloured edge already carries that. The label earns its place only on
    // the cumulative views.
    ? `<div class="masonry">${t.notes.map((n) => noteCard(n)).join('')}</div>`
    : '<div class="card"><div class="empty">No notes yet.</div></div>'}`;

  return {
    html,
    mount(root) {
      root.querySelector('#nt-add').addEventListener('click',
        () => noteForm(null, { team_id: id }, reload));
    },
  };
}

// --- prep -------------------------------------------------------

async function prepTab(t, id, reload) {
  const p = await api.teams.prep(id);

  const html = `
    <div class="pagehead" style="margin-bottom:6px">
      <div class="grow">
        <h2>Walk into the next meeting ready</h2>
        <div class="deck">Built from what was still open after ${p.last_meeting ? `your ${fmtDate(p.last_meeting.date)} check-in` : 'the last check-in'}.</div>
      </div>
      <div class="actions">
        <button class="btn ghost" id="pr-copy">Copy agenda</button>
        <button class="btn" id="pr-start">Log this meeting</button>
      </div>
    </div>

    <div class="grid c2" style="align-items:start;margin-top:16px">
      <div class="card">
        <div class="cardhead"><h2>Suggested agenda</h2></div>
        <ol style="margin:0;padding-left:20px;font-size:.9rem;line-height:1.9" id="pr-agenda">
          ${p.suggested_agenda.map((a) => `<li>${esc(a)}</li>`).join('')}
        </ol>
      </div>

      <div>
        <div class="card">
          <div class="cardhead"><h2>Carried over</h2>
            <span class="micro">${p.carry_over.length} item${p.carry_over.length === 1 ? '' : 's'}</span></div>
          ${taskList(p.carry_over, { emptyText: 'Nothing slipped since last time.' })}
        </div>
        <div class="card">
          <div class="cardhead"><h2>Still open with the team</h2></div>
          ${taskList(p.open_team_tasks, { emptyText: 'All clear.' })}
        </div>
        <div class="card">
          <div class="cardhead"><h2>What I owe them first</h2></div>
          ${taskList(p.my_open_tasks, { emptyText: 'Nothing outstanding on your side.' })}
        </div>
      </div>
    </div>

    ${p.last_meeting ? `
      <div class="card">
        <div class="cardhead"><h2>Last meeting — ${esc(fmtDateLong(p.last_meeting.date))}</h2></div>
        ${p.last_meeting.decisions ? `<div class="micro">Decisions</div><div class="prose" style="margin-bottom:12px">${esc(p.last_meeting.decisions)}</div>` : ''}
        ${p.last_meeting.notes ? `<div class="micro">Notes</div><div class="prose">${esc(p.last_meeting.notes)}</div>` : ''}
      </div>` : ''}`;

  return {
    html,
    mount(root) {
      root.querySelector('#pr-start').addEventListener('click', () => {
        meetingForm(null, id, t.members.filter((m) => m.active), reload, {
          agenda: p.suggested_agenda.map((a, i) => `${i + 1}. ${a}`).join('\n'),
        });
      });
      root.querySelector('#pr-copy').addEventListener('click', async () => {
        const text = p.suggested_agenda.map((a, i) => `${i + 1}. ${a}`).join('\n');
        try {
          await navigator.clipboard.writeText(text);
          toast('Agenda copied');
        } catch {
          toast('Copy failed — select the text manually', 'err');
        }
      });
    },
  };
}

// --- report -----------------------------------------------------

async function reportTab(t, id) {
  const md = await api.teams.report(id);

  const html = `
    <div class="pagehead" style="margin-bottom:6px">
      <div class="grow">
        <h2>Semester report</h2>
        <div class="deck">Everything on ${esc(t.name)} as Markdown — meetings, attendance, tasks, milestones.
          Your private meeting notes are left out.</div>
      </div>
      <div class="actions">
        <button class="btn ghost" id="rp-copy">Copy</button>
        <button class="btn" id="rp-download">Download .md</button>
      </div>
    </div>
    <pre class="q" id="rp-body" style="margin-top:16px">${esc(md)}</pre>`;

  return {
    html,
    mount(root) {
      root.querySelector('#rp-copy').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(md);
          toast('Report copied');
        } catch {
          toast('Copy failed — select the text manually', 'err');
        }
      });
      root.querySelector('#rp-download').addEventListener('click', () => {
        const blob = new Blob([md], { type: 'text/markdown' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${t.name.replace(/[^\w.-]+/g, '-').toLowerCase()}-report.md`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
    },
  };
}
