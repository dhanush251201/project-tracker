// Reusable row/card renderers plus the event wiring they expect.
import { api } from '../api.js';
import {
  esc, flag, progressBar, fmtDate, fmtDateLong, relDate, fmtStamp,
  isOverdue, STATUS_LABEL, STATUS_FLAG, TICK_GLYPH, toast, toastError,
} from '../ui.js';

// ---------------------------------------------------------------- tasks

export function taskRow(t, { showTeam = false } = {}) {
  const over = isOverdue(t.due_date, t.status);
  const bits = [];
  if (showTeam && t.team_name) {
    bits.push(`<span style="color:${esc(t.team_color || 'var(--ink-3)')}">●</span> ${esc(t.team_name)}`);
  }
  if (t.owner === 'ta') bits.push('<b>mine</b>');
  if (t.member_name) bits.push(esc(t.member_name));
  if (t.due_date) {
    bits.push(`<span class="${over ? 'overdue' : ''}">${over ? 'overdue — ' : 'due '}${esc(relDate(t.due_date))}</span>`);
  }
  if (t.status === 'blocked') bits.push(flag('blocked', 'critical'));
  if (t.priority === 'high' && t.status !== 'done') bits.push(flag('high', 'warning'));

  return `
    <div class="row ${t.status === 'done' ? 'is-done' : ''}" data-task="${t.id}">
      <button class="tickbtn ${esc(t.status)}" data-tick="${t.id}"
              title="${t.status === 'done' ? 'Mark not done' : 'Mark done'}">${TICK_GLYPH[t.status] || ''}</button>
      <div class="grow">
        <div class="rtitle">${esc(t.title)}</div>
        ${t.description ? `<div class="muted" style="font-size:.8rem;margin-top:2px">${esc(t.description)}</div>` : ''}
        <div class="rmeta">${bits.join('<span class="sep">·</span>')}</div>
      </div>
      <div class="rowacts">
        <button class="btn ghost sm" data-edit-task="${t.id}">edit</button>
      </div>
    </div>`;
}

export function taskList(list, opts = {}) {
  if (!list.length) return `<div class="empty tight">${esc(opts.emptyText || 'Nothing here.')}</div>`;
  return `<div class="rows">${list.map((t) => taskRow(t, opts)).join('')}</div>`;
}

/** Wires tick-to-complete and edit buttons for every task row inside `root`. */
export function wireTasks(root, reload, taskFormFn) {
  root.querySelectorAll('[data-tick]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.tick);
      btn.disabled = true;
      try {
        const current = await api.tasks.get(id);
        const next = current.status === 'done' ? 'todo' : 'done';
        await api.tasks.update(id, { status: next });
        toast(next === 'done' ? 'Marked done' : 'Reopened');
        await reload();
      } catch (err) {
        toastError(err);
        btn.disabled = false;
      }
    });
  });
  root.querySelectorAll('[data-edit-task]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const t = await api.tasks.get(Number(btn.dataset.editTask));
        taskFormFn(t, {}, reload);
      } catch (err) {
        toastError(err);
      }
    });
  });
}

// ---------------------------------------------------------------- meetings

export function meetingRow(m, { showTeam = false } = {}) {
  const present = (m.attendance || []).filter((a) => a.status === 'present').length;
  const total = (m.attendance || []).length;
  const bits = [];
  if (showTeam && m.team_name) bits.push(esc(m.team_name));
  bits.push(esc(m.kind));
  if (total) bits.push(`${present}/${total} present`);
  if (m.duration_min) bits.push(`${m.duration_min} min`);
  if (m.mood) bits.push(`mood: ${esc(m.mood)}`);

  const preview = (m.notes || m.agenda || m.decisions || '').replace(/\s+/g, ' ').slice(0, 150);

  return `
    <div class="row" data-meeting="${m.id}" style="cursor:pointer">
      <div class="grow">
        <div class="rtitle">
          <span class="tnum muted" style="font-size:.8rem">${esc(fmtDate(m.date))}</span>
          &nbsp;${esc(m.title || 'Check-in')}
        </div>
        ${preview ? `<div class="muted" style="font-size:.82rem;margin-top:3px">${esc(preview)}${preview.length >= 150 ? '…' : ''}</div>` : ''}
        <div class="rmeta">${bits.join('<span class="sep">·</span>')}</div>
      </div>
      <div class="rowacts"><button class="btn ghost sm" data-edit-meeting="${m.id}">edit</button></div>
    </div>`;
}

/** Read-only detail panel for a logged meeting. */
export function meetingDetailHtml(m) {
  const section = (label, text, serif = false) => (text
    ? `<div style="margin-top:16px">
         <div class="micro" style="margin-bottom:5px">${esc(label)}</div>
         <div class="${serif ? 'notebody' : 'prose'}">${esc(text)}</div>
       </div>`
    : '');

  const att = (m.attendance || []);
  const attHtml = att.length
    ? `<div class="chips" style="margin-top:4px">${att.map((a) => {
      const kind = a.status === 'present' ? 'ok' : a.status === 'absent' ? 'critical' : 'warning';
      return `<span class="flag ${kind}">${esc(a.name)} · ${esc(a.status)}</span>`;
    }).join('')}</div>`
    : '<div class="muted" style="font-size:.84rem">No attendance recorded.</div>';

  const tasks = (m.tasks || []);

  return `
    <dl class="kv">
      <dt>Date</dt><dd>${esc(fmtDateLong(m.date))}</dd>
      <dt>Kind</dt><dd>${esc(m.kind)}${m.duration_min ? ` · ${m.duration_min} min` : ''}</dd>
      ${m.mood ? `<dt>Room</dt><dd>${esc(m.mood)}</dd>` : ''}
    </dl>
    <div style="margin-top:14px">
      <div class="micro" style="margin-bottom:5px">Attendance</div>
      ${attHtml}
    </div>
    ${section('Agenda', m.agenda)}
    ${section('Notes', m.notes, true)}
    ${section('Decisions', m.decisions)}
    ${section('Blockers', m.blockers)}
    ${m.private_notes ? `
      <div style="margin-top:16px;border-left:3px solid var(--caution);padding-left:12px">
        <div class="micro" style="margin-bottom:5px;color:var(--caution)">Private — excluded from reports</div>
        <div class="prose">${esc(m.private_notes)}</div>
      </div>` : ''}
    ${tasks.length ? `
      <div style="margin-top:18px">
        <div class="micro" style="margin-bottom:5px">Action items from this meeting</div>
        <div class="rows">${tasks.map((t) => `
          <div class="row ${t.status === 'done' ? 'is-done' : ''}">
            <span class="tickbtn ${esc(t.status)}" style="cursor:default">${TICK_GLYPH[t.status] || ''}</span>
            <div class="grow"><div class="rtitle">${esc(t.title)}</div>
            <div class="rmeta">${esc(STATUS_LABEL[t.status] || t.status)}${t.due_date ? ` <span class="sep">·</span> due ${esc(fmtDate(t.due_date))}` : ''}</div></div>
          </div>`).join('')}</div>
      </div>` : ''}
    <div class="micro" style="margin-top:20px">Logged ${esc(fmtStamp(m.created_at))}</div>`;
}

// ---------------------------------------------------------------- milestones

export function milestoneRow(ms) {
  const over = isOverdue(ms.due_date, ms.status);
  return `
    <div class="tl-item ${esc(ms.status)}" data-milestone="${ms.id}">
      <div class="tl-head">
        <strong style="font-size:.95rem">${esc(ms.title)}</strong>
        ${flag(STATUS_LABEL[ms.status] || ms.status, STATUS_FLAG[ms.status] || 'info')}
        ${ms.weight > 1 ? flag(`weight ${ms.weight}`, 'info') : ''}
        <span class="micro ${over ? 'overdue' : ''}" style="margin-left:auto">
          ${ms.due_date ? `${over ? 'overdue · ' : ''}${esc(fmtDate(ms.due_date))}` : 'no date'}
        </span>
        <button class="btn ghost sm" data-edit-milestone="${ms.id}">edit</button>
      </div>
      ${ms.description ? `<div class="muted" style="font-size:.84rem;margin-top:3px">${esc(ms.description)}</div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------- notes

const NOTE_FLAG = {
  concern: 'critical', kudos: 'ok', idea: 'accent', grading: 'warning',
  observation: 'info', thought: 'info',
};

export function noteCard(n, { showTeam = false } = {}) {
  // The team's own colour tints the card edge and its label, so a mixed wall of
  // notes can be read by team at a glance. Notes with no team get a muted,
  // dashed edge rather than borrowing someone else's colour.
  const color = n.team_color || null;
  const teamLabel = n.team_name
    ? `<span class="note-team" style="--team:${esc(color || 'var(--ink-3)')}">
         <span class="dot"></span>${esc(n.team_name)}</span>`
    : '<span class="note-team general"><span class="dot"></span>general</span>';

  return `
    <div class="card note${n.team_name ? '' : ' no-team'}" data-note="${n.id}"
         style="--team:${esc(color || 'var(--rule)')}">
      <div class="cardhead" style="margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${flag(n.kind, NOTE_FLAG[n.kind] || 'info')}
          ${n.pinned ? flag('pinned', 'accent') : ''}
          ${showTeam ? teamLabel : ''}
          ${n.member_name ? `<span class="micro">re: ${esc(n.member_name)}</span>` : ''}
        </div>
        <button class="btn ghost sm" data-edit-note="${n.id}">edit</button>
      </div>
      ${n.title ? `<h3 style="margin-bottom:5px">${esc(n.title)}</h3>` : ''}
      <div class="notebody">${esc(n.body)}</div>
      <div class="micro" style="margin-top:10px">${esc(fmtStamp(n.created_at))}</div>
    </div>`;
}

export function wireNotes(root, reload, noteFormFn) {
  root.querySelectorAll('[data-edit-note]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const n = await api.notes.get(Number(btn.dataset.editNote));
        noteFormFn(n, {}, reload);
      } catch (err) {
        toastError(err);
      }
    });
  });
}

// ---------------------------------------------------------------- teams

export function teamCard(t) {
  const risks = [];
  if (t.task_overdue) risks.push(flag(`${t.task_overdue} overdue`, 'critical'));
  if (t.task_blocked) risks.push(flag(`${t.task_blocked} blocked`, 'warning'));
  if (t.milestone_overdue) risks.push(flag(`${t.milestone_overdue} milestone late`, 'critical'));
  if (t.health === 'risk') risks.push(flag('at risk', 'critical'));
  if (t.health === 'watch') risks.push(flag('watch', 'warning'));
  if (!risks.length && t.progress !== null) risks.push(flag('on track', 'ok'));

  return `
    <a class="teamcard" href="#/teams/${t.id}" style="--team:${esc(t.color || 'var(--accent)')}">
      <div class="tc-name">${esc(t.name)}</div>
      ${t.project_title ? `<div class="tc-proj">${esc(t.project_title)}</div>` : ''}
      <div class="flags" style="margin-top:9px">${risks.join('')}</div>
      ${progressBar(t.progress, t.color)}
      <div class="barcap">
        <span class="micro">${t.progress === null ? 'no milestones yet' : `${t.progress}% complete`}</span>
        <span class="micro">${t.task_done}/${t.task_total} tasks</span>
      </div>
      <div class="tc-meta">
        <span>${t.member_count} member${t.member_count === 1 ? '' : 's'}</span>
        <span>${t.meeting_count} meeting${t.meeting_count === 1 ? '' : 's'}</span>
        <span>${t.last_meeting ? `last met ${esc(relDate(t.last_meeting))}` : 'never met'}</span>
      </div>
    </a>`;
}

export function figure(value, caption, alert = false) {
  return `<div class="figure">
      <div class="n${alert ? ' alert' : ''}">${esc(value)}</div>
      <div class="cap micro">${esc(caption)}</div>
    </div>`;
}
