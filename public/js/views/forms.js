// Every create/edit drawer in the app lives here, so the same entity is edited
// the same way no matter which view you opened it from.
import { api } from '../api.js';
import { openForm, toast, toastError, todayStr, esc } from '../ui.js';
import { refresh, go, state } from '../app.js';

const TEAM_COLORS = [
  { value: '#2F5D8C', label: 'Slate blue' },
  { value: '#3A6A4E', label: 'Forest' },
  { value: '#D96518', label: 'Amber' },
  { value: '#1B9E8F', label: 'Teal' },
  { value: '#A05CC4', label: 'Violet' },
  { value: '#9E3826', label: 'Brick' },
  { value: '#8A6412', label: 'Ochre' },
  { value: '#2E7EBB', label: 'Sky' },
];

const after = async (fn) => {
  if (fn) await fn();
  else await refresh();
};

// ---------------------------------------------------------------- team

export function teamForm(team, onDone) {
  const editing = Boolean(team);
  const fields = [
    { name: 'name', label: 'Team name', required: true, placeholder: 'e.g. Team Atlas' },
    {
      row: [
        { name: 'course', label: 'Course', placeholder: 'CIS 4000' },
        { name: 'semester', label: 'Semester', placeholder: 'Fall 2026' },
      ],
    },
    { heading: 'Project' },
    { name: 'project_title', label: 'Project title', placeholder: 'One-line title' },
    {
      name: 'project_description', label: 'Description', type: 'textarea', rows: 4,
      placeholder: 'What are they building, for whom, and why?',
    },
    { name: 'tech_stack', label: 'Tech stack', placeholder: 'React · FastAPI · Postgres' },
    {
      row: [
        { name: 'repo_url', label: 'Repository', type: 'url', placeholder: 'https://github.com/…' },
        { name: 'demo_url', label: 'Demo / deploy', type: 'url' },
      ],
    },
    { name: 'doc_url', label: 'Spec / docs link', type: 'url' },
    { heading: 'Supervision' },
    {
      row: [
        { name: 'meeting_schedule', label: 'Meeting slot', placeholder: 'Thursdays 3:00pm, Levine 307' },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'planning', label: 'Planning' },
            { value: 'paused', label: 'Paused' },
            { value: 'complete', label: 'Complete' },
          ],
        },
      ],
    },
    {
      row: [
        {
          name: 'health', label: 'Your read on it', type: 'select',
          options: [
            { value: 'unknown', label: 'Not judged yet' },
            { value: 'good', label: 'On track' },
            { value: 'watch', label: 'Needs watching' },
            { value: 'risk', label: 'At risk' },
          ],
        },
        { name: 'color', label: 'Colour', type: 'select', options: TEAM_COLORS },
      ],
    },
  ];

  openForm({
    title: editing ? `Edit ${team.name}` : 'New team',
    subtitle: editing ? 'Team & project details' : 'Add a capstone team you supervise',
    fields,
    values: team || {
      status: 'active', health: 'unknown',
      color: TEAM_COLORS[(state.teams.length || 0) % TEAM_COLORS.length].value,
    },
    submitLabel: editing ? 'Save team' : 'Create team',
    async onSubmit(values, close) {
      if (!values.name.trim()) throw new Error('Give the team a name.');
      if (editing) {
        await api.teams.update(team.id, values);
        toast('Team updated');
        close();
        await after(onDone);
      } else {
        const created = await api.teams.create(values);
        toast(`${created.name} created`);
        close();
        await refresh();
        go(`/teams/${created.id}`);
      }
    },
    onDelete: editing
      ? async (close) => {
        await api.teams.remove(team.id);
        toast('Team deleted');
        close();
        await refresh();
        go('/teams');
      }
      : null,
    deleteLabel: 'Delete team',
  });
}

// ---------------------------------------------------------------- member

export function memberForm(member, teamId, onDone) {
  const editing = Boolean(member);
  const fields = [
    { name: 'name', label: 'Name', required: true },
    {
      row: [
        { name: 'role', label: 'Role on the team', placeholder: 'Backend / PM / ML' },
        { name: 'email', label: 'Email', type: 'email' },
      ],
    },
    {
      row: [
        { name: 'github', label: 'GitHub handle' },
        { name: 'pennkey', label: 'PennKey' },
      ],
    },
    {
      name: 'notes', label: 'Private notes on this student', type: 'textarea', rows: 4,
      note: 'Strengths, what they own, anything to follow up on. Never shown to the team.',
    },
    { name: 'active', label: 'Still on the team', type: 'checkbox' },
  ];

  openForm({
    title: editing ? `Edit ${member.name}` : 'Add team member',
    fields,
    values: member || { active: 1 },
    submitLabel: editing ? 'Save' : 'Add member',
    async onSubmit(values, close) {
      if (!values.name.trim()) throw new Error('Give the student a name.');
      if (editing) await api.members.update(member.id, values);
      else await api.members.create({ ...values, team_id: teamId });
      toast(editing ? 'Member updated' : 'Member added');
      close();
      await after(onDone);
    },
    onDelete: editing
      ? async (close) => {
        await api.members.remove(member.id);
        toast('Member removed');
        close();
        await after(onDone);
      }
      : null,
    deleteLabel: 'Remove member',
  });
}

// ---------------------------------------------------------------- meeting

export function meetingForm(meeting, teamId, members = [], onDone, prefill = {}) {
  const editing = Boolean(meeting);
  const current = meeting
    ? meeting.attendance.reduce((acc, a) => ({ ...acc, [a.member_id]: a.status }), {})
    : {};

  const attendanceRows = members.length
    ? `<div class="field">
         <span class="micro" style="display:block;margin-bottom:7px">Attendance</span>
         ${members.map((m) => `
           <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
             <span style="flex:1;font-size:.87rem">${esc(m.name)}${m.role ? ` <span class="muted">· ${esc(m.role)}</span>` : ''}</span>
             <select data-att="${m.id}" style="width:auto;min-width:110px">
               ${['present', 'late', 'absent', 'excused'].map((s) =>
    `<option value="${s}"${(current[m.id] || 'present') === s ? ' selected' : ''}>${s}</option>`).join('')}
             </select>
           </div>`).join('')}
       </div>`
    : '<div class="notice">Add team members first to track who showed up.</div>';

  const fields = [
    {
      row: [
        { name: 'date', label: 'Date', type: 'date' },
        {
          name: 'kind', label: 'Kind', type: 'select',
          options: [
            { value: 'weekly', label: 'Weekly check-in' },
            { value: 'kickoff', label: 'Kick-off' },
            { value: 'demo', label: 'Demo / review' },
            { value: 'adhoc', label: 'Ad-hoc' },
            { value: 'final', label: 'Final presentation' },
          ],
        },
      ],
    },
    { name: 'title', label: 'Title', placeholder: 'Week 4 — auth flow review' },
    { raw: attendanceRows },
    {
      name: 'agenda', label: 'Agenda', type: 'textarea', rows: 4,
      note: 'What you planned to cover.',
    },
    {
      name: 'notes', label: 'Meeting notes', type: 'textarea', rows: 9, tall: true,
      note: 'What was said. Paste transcripts or conversation logs here too.',
    },
    { name: 'decisions', label: 'Decisions made', type: 'textarea', rows: 3 },
    { name: 'blockers', label: 'Blockers raised', type: 'textarea', rows: 3 },
    {
      name: 'private_notes', label: 'Your private thoughts', type: 'textarea', rows: 4,
      note: 'Only for you — kept out of exported team reports.',
    },
    {
      row: [
        {
          name: 'mood', label: 'Room temperature', type: 'select',
          options: [
            { value: '', label: '—' },
            { value: 'great', label: 'Great — energised' },
            { value: 'fine', label: 'Fine' },
            { value: 'flat', label: 'Flat / low energy' },
            { value: 'tense', label: 'Tense / friction' },
          ],
        },
        { name: 'duration_min', label: 'Minutes', type: 'number', min: 0 },
      ],
    },
  ];

  openForm({
    title: editing ? 'Edit meeting' : 'Log a meeting',
    subtitle: editing ? meeting.date : 'Notes, decisions and who turned up',
    wide: true,
    fields,
    values: editing
      ? meeting
      : { date: todayStr(), kind: 'weekly', duration_min: 30, ...prefill },
    submitLabel: editing ? 'Save meeting' : 'Save meeting',
    async onSubmit(values, close) {
      const form = document.getElementById('drawer-form');
      const attendance = [...form.querySelectorAll('[data-att]')].map((sel) => ({
        member_id: Number(sel.dataset.att),
        status: sel.value,
      }));
      const payload = { ...values, attendance };
      if (editing) await api.meetings.update(meeting.id, payload);
      else await api.meetings.create({ ...payload, team_id: teamId });
      toast('Meeting saved');
      close();
      await after(onDone);
    },
    onDelete: editing
      ? async (close) => {
        await api.meetings.remove(meeting.id);
        toast('Meeting deleted');
        close();
        await after(onDone);
      }
      : null,
    deleteLabel: 'Delete meeting',
  });
}

// ---------------------------------------------------------------- task

export function taskForm(task, defaults = {}, onDone) {
  const editing = Boolean(task);
  const teams = state.teams;
  const initialTeam = editing ? task.team_id : defaults.team_id;

  const teamOptions = [{ value: '', label: '— no team (personal) —' },
    ...teams.map((t) => ({ value: String(t.id), label: t.name }))];

  const fields = [
    { name: 'title', label: 'Task', required: true, placeholder: 'What needs doing?' },
    { name: 'description', label: 'Detail', type: 'textarea', rows: 3 },
    {
      row: [
        {
          name: 'owner', label: 'Whose job', type: 'select',
          options: [
            { value: 'team', label: 'The team' },
            { value: 'ta', label: 'Mine (TA)' },
          ],
        },
        { name: 'team_id', label: 'Team', type: 'select', options: teamOptions, nullable: true },
      ],
    },
    {
      row: [
        {
          name: 'member_id', label: 'Assigned to', type: 'select',
          options: [{ value: '', label: '— whole team —' }],
          nullable: true,
        },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [
            { value: 'todo', label: 'To do' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'blocked', label: 'Blocked' },
            { value: 'done', label: 'Done' },
          ],
        },
      ],
    },
    {
      row: [
        {
          name: 'priority', label: 'Priority', type: 'select',
          options: [
            { value: 'high', label: 'High' },
            { value: 'normal', label: 'Normal' },
            { value: 'low', label: 'Low' },
          ],
        },
        { name: 'due_date', label: 'Due', type: 'date', nullable: true },
      ],
    },
  ];

  openForm({
    title: editing ? 'Edit task' : 'New task',
    fields,
    values: editing
      ? task
      : { owner: 'team', status: 'todo', priority: 'normal', team_id: initialTeam ?? '', ...defaults },
    submitLabel: editing ? 'Save task' : 'Add task',
    async onSubmit(values, close) {
      if (!values.title.trim()) throw new Error('Describe the task.');
      const payload = {
        ...values,
        team_id: values.team_id === '' ? null : Number(values.team_id),
        member_id: values.member_id === '' || !values.member_id ? null : Number(values.member_id),
        due_date: values.due_date || null,
        meeting_id: defaults.meeting_id ?? (editing ? task.meeting_id : null),
      };
      if (editing) await api.tasks.update(task.id, payload);
      else await api.tasks.create(payload);
      toast('Task saved');
      close();
      await after(onDone);
    },
    onDelete: editing
      ? async (close) => {
        await api.tasks.remove(task.id);
        toast('Task deleted');
        close();
        await after(onDone);
      }
      : null,
    deleteLabel: 'Delete task',
  });

  // The assignee list depends on the chosen team, so populate it reactively.
  const form = document.getElementById('drawer-form');
  const teamSel = form.elements.team_id;
  const memberSel = form.elements.member_id;

  async function loadMembers(selectedId) {
    const tid = teamSel.value;
    memberSel.innerHTML = '<option value="">— whole team —</option>';
    if (!tid) return;
    try {
      const list = await api.members.list({ team_id: tid });
      for (const m of list) {
        const opt = document.createElement('option');
        opt.value = String(m.id);
        opt.textContent = m.name + (m.active ? '' : ' (inactive)');
        if (String(selectedId) === String(m.id)) opt.selected = true;
        memberSel.appendChild(opt);
      }
    } catch (err) {
      toastError(err);
    }
  }
  teamSel.addEventListener('change', () => loadMembers(null));
  loadMembers(editing ? task.member_id : defaults.member_id);
}

// ---------------------------------------------------------------- milestone

export function milestoneForm(milestone, teamId, onDone) {
  const editing = Boolean(milestone);
  const fields = [
    { name: 'title', label: 'Milestone', required: true, placeholder: 'MVP demo' },
    { name: 'description', label: 'What "done" means', type: 'textarea', rows: 3 },
    {
      row: [
        { name: 'due_date', label: 'Target date', type: 'date', nullable: true },
        {
          name: 'status', label: 'Status', type: 'select',
          options: [
            { value: 'pending', label: 'Pending' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'done', label: 'Done' },
            { value: 'missed', label: 'Missed' },
          ],
        },
      ],
    },
    {
      row: [
        {
          name: 'weight', label: 'Weight', type: 'number', min: 1,
          note: 'How much of the project this represents. Drives the progress bar.',
        },
        { name: 'order_index', label: 'Order', type: 'number' },
      ],
    },
  ];

  openForm({
    title: editing ? 'Edit milestone' : 'New milestone',
    fields,
    values: editing ? milestone : { status: 'pending', weight: 1, order_index: 0 },
    submitLabel: 'Save milestone',
    async onSubmit(values, close) {
      if (!values.title.trim()) throw new Error('Name the milestone.');
      const payload = { ...values, due_date: values.due_date || null };
      if (editing) await api.milestones.update(milestone.id, payload);
      else await api.milestones.create({ ...payload, team_id: teamId });
      toast('Milestone saved');
      close();
      await after(onDone);
    },
    onDelete: editing
      ? async (close) => {
        await api.milestones.remove(milestone.id);
        toast('Milestone deleted');
        close();
        await after(onDone);
      }
      : null,
    deleteLabel: 'Delete milestone',
  });
}

// ---------------------------------------------------------------- note

export function noteForm(note, defaults = {}, onDone) {
  const editing = Boolean(note);
  const teamOptions = [{ value: '', label: '— general / not team-specific —' },
    ...state.teams.map((t) => ({ value: String(t.id), label: t.name }))];

  const fields = [
    { name: 'title', label: 'Title', placeholder: 'Optional heading' },
    {
      name: 'body', label: 'Note', type: 'textarea', rows: 9, tall: true,
      placeholder: 'Write freely — thoughts, observations, an idea to raise next week…',
    },
    {
      row: [
        {
          name: 'kind', label: 'Kind', type: 'select',
          options: [
            { value: 'thought', label: 'Thought' },
            { value: 'observation', label: 'Observation' },
            { value: 'kudos', label: 'Kudos' },
            { value: 'concern', label: 'Concern' },
            { value: 'idea', label: 'Idea' },
            { value: 'grading', label: 'Grading note' },
          ],
        },
        { name: 'team_id', label: 'Team', type: 'select', options: teamOptions, nullable: true },
      ],
    },
    {
      name: 'member_id', label: 'About a specific student', type: 'select',
      options: [{ value: '', label: '— the whole team —' }], nullable: true,
    },
    { name: 'pinned', label: 'Pin to dashboard', type: 'checkbox' },
  ];

  openForm({
    title: editing ? 'Edit note' : 'New note',
    fields,
    values: editing ? note : { kind: 'thought', team_id: defaults.team_id ?? '', ...defaults },
    submitLabel: 'Save note',
    async onSubmit(values, close) {
      if (!values.body.trim() && !values.title.trim()) throw new Error('Write something first.');
      const payload = {
        ...values,
        team_id: values.team_id === '' ? null : Number(values.team_id),
        member_id: values.member_id === '' || !values.member_id ? null : Number(values.member_id),
      };
      if (editing) await api.notes.update(note.id, payload);
      else await api.notes.create(payload);
      toast('Note saved');
      close();
      await after(onDone);
    },
    onDelete: editing
      ? async (close) => {
        await api.notes.remove(note.id);
        toast('Note deleted');
        close();
        await after(onDone);
      }
      : null,
    deleteLabel: 'Delete note',
  });

  const form = document.getElementById('drawer-form');
  const teamSel = form.elements.team_id;
  const memberSel = form.elements.member_id;
  async function loadMembers(selectedId) {
    memberSel.innerHTML = '<option value="">— the whole team —</option>';
    if (!teamSel.value) return;
    try {
      for (const m of await api.members.list({ team_id: teamSel.value })) {
        const opt = document.createElement('option');
        opt.value = String(m.id);
        opt.textContent = m.name;
        if (String(selectedId) === String(m.id)) opt.selected = true;
        memberSel.appendChild(opt);
      }
    } catch (err) {
      toastError(err);
    }
  }
  teamSel.addEventListener('change', () => loadMembers(null));
  loadMembers(editing ? note.member_id : defaults.member_id);
}
