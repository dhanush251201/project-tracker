import { getDb, now, today, plain, plainAll } from './db.js';

// node:sqlite only accepts null | number | bigint | string | Uint8Array.
// Normalise booleans/undefined so callers can pass natural JS values.
function norm(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  return String(v);
}

function run(sql, params = []) {
  return getDb().prepare(sql).run(...params.map(norm));
}
function all(sql, params = []) {
  return plainAll(getDb().prepare(sql).all(...params.map(norm)));
}
function one(sql, params = []) {
  return plain(getDb().prepare(sql).get(...params.map(norm)));
}

function pick(obj, keys, defaults = {}) {
  const out = {};
  for (const k of keys) out[k] = obj[k] !== undefined ? obj[k] : (defaults[k] ?? null);
  return out;
}

/** Partial update helper: only touches keys present in `body`. */
function patch(table, id, body, allowed) {
  const keys = Object.keys(body).filter((k) => allowed.includes(k));
  if (keys.length === 0) return false;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  run(`UPDATE ${table} SET ${sets}, updated_at = ? WHERE id = ?`, [
    ...keys.map((k) => body[k]),
    now(),
    id,
  ]);
  return true;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-09-17' -> 'Sep 17'; adds the year when it is not the current one. */
export function niceDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const thisYear = new Date().getFullYear();
  return `${MONTHS[m - 1]} ${d}${y === thisYear ? '' : ` ${y}`}`;
}

function daysBetween(aIso, bIso) {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];
export const MILESTONE_STATUSES = ['pending', 'in_progress', 'done', 'missed'];
export const NOTE_KINDS = ['thought', 'observation', 'kudos', 'concern', 'idea', 'grading'];

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

const TEAM_FIELDS = [
  'name', 'course', 'semester', 'project_title', 'project_description', 'tech_stack',
  'repo_url', 'demo_url', 'doc_url', 'meeting_schedule', 'status', 'health', 'color', 'archived',
];

export const teams = {
  list({ includeArchived = false } = {}) {
    const rows = all(
      `SELECT * FROM teams ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY name`,
    );
    return rows.map((t) => ({ ...t, ...teams.stats(t.id) }));
  },

  get(id) {
    const t = one('SELECT * FROM teams WHERE id = ?', [id]);
    return t ? { ...t, ...teams.stats(id) } : null;
  },

  create(body) {
    if (!body.name || !String(body.name).trim()) throw badRequest('Team name is required');
    const f = pick(body, TEAM_FIELDS, {
      course: '', semester: '', project_title: '', project_description: '', tech_stack: '',
      repo_url: '', demo_url: '', doc_url: '', meeting_schedule: '',
      status: 'active', health: 'unknown', color: '#6366f1', archived: 0,
    });
    const ts = now();
    const res = run(
      `INSERT INTO teams (${TEAM_FIELDS.join(',')}, created_at, updated_at)
       VALUES (${TEAM_FIELDS.map(() => '?').join(',')}, ?, ?)`,
      [...TEAM_FIELDS.map((k) => f[k]), ts, ts],
    );
    return teams.get(Number(res.lastInsertRowid));
  },

  update(id, body) {
    if (!teams.get(id)) return null;
    patch('teams', id, body, TEAM_FIELDS);
    return teams.get(id);
  },

  remove(id) {
    const res = run('DELETE FROM teams WHERE id = ?', [id]);
    return res.changes > 0;
  },

  /** Derived progress / activity numbers used all over the UI. */
  stats(teamId) {
    const ms = all('SELECT status, weight, due_date FROM milestones WHERE team_id = ?', [teamId]);
    const totalWeight = ms.reduce((s, m) => s + (m.weight || 1), 0);
    const doneWeight = ms.reduce(
      (s, m) => s + (m.status === 'done' ? (m.weight || 1) : m.status === 'in_progress' ? (m.weight || 1) * 0.5 : 0),
      0,
    );
    const milestoneProgress = totalWeight ? Math.round((doneWeight / totalWeight) * 100) : null;

    const t = one(
      `SELECT
         COUNT(*)                                          AS total,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END)  AS done,
         SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
         SUM(CASE WHEN status != 'done' AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue
       FROM tasks WHERE team_id = ? AND owner = 'team'`,
      [today(), teamId],
    ) || {};
    const taskTotal = t.total || 0;
    const taskDone = t.done || 0;
    const taskProgress = taskTotal ? Math.round((taskDone / taskTotal) * 100) : null;

    const lastMeeting = one(
      'SELECT date FROM meetings WHERE team_id = ? ORDER BY date DESC LIMIT 1',
      [teamId],
    );
    const nextMeeting = one(
      'SELECT date FROM meetings WHERE team_id = ? AND date > ? ORDER BY date ASC LIMIT 1',
      [teamId, today()],
    );
    const memberCount = one(
      'SELECT COUNT(*) AS c FROM members WHERE team_id = ? AND active = 1',
      [teamId],
    ).c;
    const meetingCount = one('SELECT COUNT(*) AS c FROM meetings WHERE team_id = ?', [teamId]).c;

    const overdueMilestones = ms.filter(
      (m) => m.due_date && m.due_date < today() && m.status !== 'done',
    ).length;

    // Blend milestone + task progress; milestones dominate when both exist.
    let progress = milestoneProgress;
    if (milestoneProgress === null) progress = taskProgress;
    else if (taskProgress !== null) progress = Math.round(milestoneProgress * 0.7 + taskProgress * 0.3);

    return {
      progress,
      milestone_progress: milestoneProgress,
      task_progress: taskProgress,
      task_total: taskTotal,
      task_done: taskDone,
      task_blocked: t.blocked || 0,
      task_overdue: t.overdue || 0,
      milestone_overdue: overdueMilestones,
      member_count: memberCount,
      meeting_count: meetingCount,
      last_meeting: lastMeeting ? lastMeeting.date : null,
      next_meeting: nextMeeting ? nextMeeting.date : null,
      days_since_meeting: lastMeeting ? daysBetween(today(), lastMeeting.date) : null,
    };
  },

  /** Everything needed to render a team page in one round trip. */
  full(id) {
    const team = teams.get(id);
    if (!team) return null;
    return {
      ...team,
      members: members.list(id),
      milestones: milestones.list(id),
      meetings: meetings.list({ team_id: id }),
      tasks: tasks.list({ team_id: id }),
      notes: notes.list({ team_id: id }),
      risks: teams.risks(id),
    };
  },

  /**
   * Heuristic warnings surfaced on the dashboard and team page. Each carries
   * the `tab` that fixes it, so the UI can render it as somewhere to click
   * rather than as a dead end.
   */
  risks(id) {
    const s = teams.stats(id);
    const out = [];
    if (s.days_since_meeting === null) {
      out.push({ level: 'warn', text: 'No meetings logged yet', tab: 'meetings' });
    } else if (s.days_since_meeting > 14) {
      out.push({ level: 'danger', text: `${s.days_since_meeting} days since last meeting`, tab: 'meetings' });
    } else if (s.days_since_meeting > 9) {
      out.push({ level: 'warn', text: `${s.days_since_meeting} days since last meeting`, tab: 'meetings' });
    }
    if (s.task_overdue > 0) {
      out.push({ level: 'danger', text: `${s.task_overdue} overdue task${s.task_overdue > 1 ? 's' : ''}`, tab: 'tasks' });
    }
    if (s.task_blocked > 0) {
      out.push({ level: 'warn', text: `${s.task_blocked} blocked task${s.task_blocked > 1 ? 's' : ''}`, tab: 'tasks' });
    }
    if (s.milestone_overdue > 0) {
      out.push({ level: 'danger', text: `${s.milestone_overdue} milestone${s.milestone_overdue > 1 ? 's' : ''} past due`, tab: 'milestones' });
    }
    if (s.member_count === 0) {
      out.push({ level: 'warn', text: 'No team members added', tab: 'members' });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const MEMBER_FIELDS = ['team_id', 'name', 'email', 'role', 'github', 'pennkey', 'notes', 'active'];

export const members = {
  list(teamId) {
    const rows = teamId
      ? all('SELECT * FROM members WHERE team_id = ? ORDER BY active DESC, name', [teamId])
      : all('SELECT * FROM members ORDER BY name');
    return rows.map((m) => ({ ...m, ...members.stats(m.id) }));
  },

  get(id) {
    const m = one('SELECT * FROM members WHERE id = ?', [id]);
    return m ? { ...m, ...members.stats(id) } : null;
  },

  create(body) {
    if (!body.name || !String(body.name).trim()) throw badRequest('Member name is required');
    if (!body.team_id) throw badRequest('team_id is required');
    if (!one('SELECT id FROM teams WHERE id = ?', [body.team_id])) throw badRequest('Unknown team_id');
    const f = pick(body, MEMBER_FIELDS, {
      email: '', role: '', github: '', pennkey: '', notes: '', active: 1,
    });
    const ts = now();
    const res = run(
      `INSERT INTO members (${MEMBER_FIELDS.join(',')}, created_at, updated_at)
       VALUES (${MEMBER_FIELDS.map(() => '?').join(',')}, ?, ?)`,
      [...MEMBER_FIELDS.map((k) => f[k]), ts, ts],
    );
    return members.get(Number(res.lastInsertRowid));
  },

  update(id, body) {
    if (!members.get(id)) return null;
    patch('members', id, body, MEMBER_FIELDS);
    return members.get(id);
  },

  remove(id) {
    return run('DELETE FROM members WHERE id = ?', [id]).changes > 0;
  },

  /** Per-student signal: attendance rate + task throughput. Useful at grading time. */
  stats(memberId) {
    // Turning up late still counts as turning up; only 'absent' and 'excused' do not.
    const att = one(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN ('present', 'late') THEN 1 ELSE 0 END) AS present
       FROM attendance WHERE member_id = ?`,
      [memberId],
    ) || {};
    const t = one(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
       FROM tasks WHERE member_id = ?`,
      [memberId],
    ) || {};
    return {
      meetings_attended: att.present || 0,
      meetings_recorded: att.total || 0,
      attendance_rate: att.total ? Math.round(((att.present || 0) / att.total) * 100) : null,
      tasks_assigned: t.total || 0,
      tasks_done: t.done || 0,
    };
  },
};

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

const MEETING_FIELDS = [
  'team_id', 'date', 'title', 'kind', 'duration_min',
  'agenda', 'notes', 'decisions', 'blockers', 'private_notes', 'mood',
];

export const meetings = {
  list({ team_id = null, limit = null } = {}) {
    const rows = team_id
      ? all(`SELECT * FROM meetings WHERE team_id = ? ORDER BY date DESC, id DESC${limit ? ` LIMIT ${Number(limit)}` : ''}`, [team_id])
      : all(`SELECT * FROM meetings ORDER BY date DESC, id DESC${limit ? ` LIMIT ${Number(limit)}` : ''}`);
    return rows.map((m) => ({ ...m, attendance: meetings.attendance(m.id) }));
  },

  get(id) {
    const m = one('SELECT * FROM meetings WHERE id = ?', [id]);
    if (!m) return null;
    return {
      ...m,
      attendance: meetings.attendance(id),
      tasks: all('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY id', [id]),
    };
  },

  attendance(meetingId) {
    return all(
      `SELECT a.member_id, a.status, m.name
       FROM attendance a JOIN members m ON m.id = a.member_id
       WHERE a.meeting_id = ? ORDER BY m.name`,
      [meetingId],
    );
  },

  create(body) {
    if (!body.team_id) throw badRequest('team_id is required');
    if (!one('SELECT id FROM teams WHERE id = ?', [body.team_id])) throw badRequest('Unknown team_id');
    const f = pick(body, MEETING_FIELDS, {
      date: today(), title: '', kind: 'weekly', duration_min: 30,
      agenda: '', notes: '', decisions: '', blockers: '', private_notes: '', mood: '',
    });
    if (!f.date) f.date = today();
    const ts = now();
    const res = run(
      `INSERT INTO meetings (${MEETING_FIELDS.join(',')}, created_at, updated_at)
       VALUES (${MEETING_FIELDS.map(() => '?').join(',')}, ?, ?)`,
      [...MEETING_FIELDS.map((k) => f[k]), ts, ts],
    );
    const id = Number(res.lastInsertRowid);
    if (Array.isArray(body.attendance)) meetings.setAttendance(id, body.attendance);
    return meetings.get(id);
  },

  update(id, body) {
    if (!one('SELECT id FROM meetings WHERE id = ?', [id])) return null;
    patch('meetings', id, body, MEETING_FIELDS);
    if (Array.isArray(body.attendance)) meetings.setAttendance(id, body.attendance);
    return meetings.get(id);
  },

  setAttendance(meetingId, entries) {
    run('DELETE FROM attendance WHERE meeting_id = ?', [meetingId]);
    for (const e of entries) {
      if (!e || e.member_id == null) continue;
      run(
        'INSERT OR REPLACE INTO attendance (meeting_id, member_id, status) VALUES (?, ?, ?)',
        [meetingId, e.member_id, e.status || 'present'],
      );
    }
  },

  remove(id) {
    return run('DELETE FROM meetings WHERE id = ?', [id]).changes > 0;
  },

  /**
   * Meeting prep sheet: what to walk into the next meeting with.
   * Carries forward open items, blockers and upcoming milestones.
   */
  prep(teamId) {
    const team = teams.get(teamId);
    if (!team) return null;
    const last = one(
      'SELECT * FROM meetings WHERE team_id = ? ORDER BY date DESC, id DESC LIMIT 1',
      [teamId],
    );
    const openTeamTasks = all(
      `SELECT t.*, m.name AS member_name FROM tasks t
       LEFT JOIN members m ON m.id = t.member_id
       WHERE t.team_id = ? AND t.owner = 'team' AND t.status != 'done'
       ORDER BY CASE t.status WHEN 'blocked' THEN 0 ELSE 1 END,
                COALESCE(t.due_date, '9999-12-31')`,
      [teamId],
    );
    const myTasks = all(
      `SELECT * FROM tasks
       WHERE team_id = ? AND owner = 'ta' AND status != 'done'
       ORDER BY COALESCE(due_date, '9999-12-31')`,
      [teamId],
    );
    const upcoming = all(
      `SELECT * FROM milestones WHERE team_id = ? AND status != 'done'
       ORDER BY COALESCE(due_date, '9999-12-31') LIMIT 5`,
      [teamId],
    );
    const carryOver = openTeamTasks.filter((t) => t.status === 'blocked' || (t.due_date && t.due_date < today()));

    const agenda = [
      last ? `Follow up on last meeting (${niceDate(last.date)})${last.title ? `: ${last.title}` : ''}` : 'First meeting — project scope & expectations',
      ...carryOver.slice(0, 5).map((t) => `Unblock / chase: ${t.title}`),
      ...upcoming.slice(0, 3).map((m) => `Milestone check: ${m.title}${m.due_date ? ` (due ${niceDate(m.due_date)})` : ''}`),
      'Demo / progress since last week',
      'Risks & blockers',
      'Action items for next week',
    ];

    return {
      team: { id: team.id, name: team.name, project_title: team.project_title },
      last_meeting: last ? plain(last) : null,
      open_team_tasks: openTeamTasks,
      my_open_tasks: myTasks,
      upcoming_milestones: upcoming,
      carry_over: carryOver,
      suggested_agenda: agenda,
      stats: teams.stats(teamId),
    };
  },
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const TASK_FIELDS = [
  'team_id', 'meeting_id', 'member_id', 'title', 'description',
  'owner', 'status', 'priority', 'due_date',
];

export const tasks = {
  list({ team_id, owner, status, member_id, meeting_id, open_only, due_before } = {}) {
    const where = [];
    const params = [];
    if (team_id !== undefined && team_id !== null && team_id !== '') { where.push('t.team_id = ?'); params.push(team_id); }
    if (owner) { where.push('t.owner = ?'); params.push(owner); }
    if (status) { where.push('t.status = ?'); params.push(status); }
    if (member_id) { where.push('t.member_id = ?'); params.push(member_id); }
    if (meeting_id) { where.push('t.meeting_id = ?'); params.push(meeting_id); }
    if (open_only) where.push("t.status != 'done'");
    if (due_before) { where.push('t.due_date IS NOT NULL AND t.due_date <= ?'); params.push(due_before); }
    return all(
      `SELECT t.*, m.name AS member_name, tm.name AS team_name, tm.color AS team_color
       FROM tasks t
       LEFT JOIN members m ON m.id = t.member_id
       LEFT JOIN teams  tm ON tm.id = t.team_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY CASE t.status WHEN 'done' THEN 1 ELSE 0 END,
                CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
                COALESCE(t.due_date, '9999-12-31'), t.id DESC`,
      params,
    );
  },

  get(id) {
    return one(
      `SELECT t.*, m.name AS member_name, tm.name AS team_name, tm.color AS team_color
       FROM tasks t
       LEFT JOIN members m ON m.id = t.member_id
       LEFT JOIN teams tm ON tm.id = t.team_id
       WHERE t.id = ?`,
      [id],
    );
  },

  create(body) {
    if (!body.title || !String(body.title).trim()) throw badRequest('Task title is required');
    const f = pick(body, TASK_FIELDS, {
      team_id: null, meeting_id: null, member_id: null, description: '',
      owner: 'team', status: 'todo', priority: 'normal', due_date: null,
    });
    if (!TASK_STATUSES.includes(f.status)) throw badRequest(`status must be one of ${TASK_STATUSES.join(', ')}`);
    if (!['team', 'ta'].includes(f.owner)) throw badRequest("owner must be 'team' or 'ta'");
    const ts = now();
    const res = run(
      `INSERT INTO tasks (${TASK_FIELDS.join(',')}, completed_at, created_at, updated_at)
       VALUES (${TASK_FIELDS.map(() => '?').join(',')}, ?, ?, ?)`,
      [...TASK_FIELDS.map((k) => f[k]), f.status === 'done' ? ts : null, ts, ts],
    );
    return tasks.get(Number(res.lastInsertRowid));
  },

  update(id, body) {
    const existing = tasks.get(id);
    if (!existing) return null;
    if (body.status && !TASK_STATUSES.includes(body.status)) {
      throw badRequest(`status must be one of ${TASK_STATUSES.join(', ')}`);
    }
    patch('tasks', id, body, TASK_FIELDS);
    if (body.status && body.status !== existing.status) {
      run('UPDATE tasks SET completed_at = ? WHERE id = ?', [
        body.status === 'done' ? now() : null,
        id,
      ]);
    }
    return tasks.get(id);
  },

  remove(id) {
    return run('DELETE FROM tasks WHERE id = ?', [id]).changes > 0;
  },
};

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

const MILESTONE_FIELDS = ['team_id', 'title', 'description', 'due_date', 'status', 'weight', 'order_index'];

export const milestones = {
  list(teamId) {
    return teamId
      ? all(`SELECT * FROM milestones WHERE team_id = ?
             ORDER BY order_index, COALESCE(due_date, '9999-12-31'), id`, [teamId])
      : all(`SELECT * FROM milestones ORDER BY COALESCE(due_date, '9999-12-31'), id`);
  },

  get(id) {
    return one('SELECT * FROM milestones WHERE id = ?', [id]);
  },

  create(body) {
    if (!body.title || !String(body.title).trim()) throw badRequest('Milestone title is required');
    if (!body.team_id) throw badRequest('team_id is required');
    if (!one('SELECT id FROM teams WHERE id = ?', [body.team_id])) throw badRequest('Unknown team_id');
    const f = pick(body, MILESTONE_FIELDS, {
      description: '', due_date: null, status: 'pending', weight: 1, order_index: 0,
    });
    if (!MILESTONE_STATUSES.includes(f.status)) {
      throw badRequest(`status must be one of ${MILESTONE_STATUSES.join(', ')}`);
    }
    const ts = now();
    const res = run(
      `INSERT INTO milestones (${MILESTONE_FIELDS.join(',')}, completed_at, created_at, updated_at)
       VALUES (${MILESTONE_FIELDS.map(() => '?').join(',')}, ?, ?, ?)`,
      [...MILESTONE_FIELDS.map((k) => f[k]), f.status === 'done' ? ts : null, ts, ts],
    );
    return milestones.get(Number(res.lastInsertRowid));
  },

  update(id, body) {
    const existing = milestones.get(id);
    if (!existing) return null;
    if (body.status && !MILESTONE_STATUSES.includes(body.status)) {
      throw badRequest(`status must be one of ${MILESTONE_STATUSES.join(', ')}`);
    }
    patch('milestones', id, body, MILESTONE_FIELDS);
    if (body.status && body.status !== existing.status) {
      run('UPDATE milestones SET completed_at = ? WHERE id = ?', [
        body.status === 'done' ? now() : null,
        id,
      ]);
    }
    return milestones.get(id);
  },

  remove(id) {
    return run('DELETE FROM milestones WHERE id = ?', [id]).changes > 0;
  },
};

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const NOTE_FIELDS = ['team_id', 'member_id', 'title', 'body', 'kind', 'pinned'];

export const notes = {
  list({ team_id, member_id, kind } = {}) {
    const where = [];
    const params = [];
    if (team_id !== undefined && team_id !== null && team_id !== '') { where.push('n.team_id = ?'); params.push(team_id); }
    if (member_id) { where.push('n.member_id = ?'); params.push(member_id); }
    if (kind) { where.push('n.kind = ?'); params.push(kind); }
    return all(
      `SELECT n.*, m.name AS member_name, t.name AS team_name, t.color AS team_color
       FROM notes n
       LEFT JOIN members m ON m.id = n.member_id
       LEFT JOIN teams t ON t.id = n.team_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY n.pinned DESC, n.created_at DESC`,
      params,
    );
  },

  get(id) {
    return one('SELECT * FROM notes WHERE id = ?', [id]);
  },

  create(body) {
    if (!body.body && !body.title) throw badRequest('Note needs a title or body');
    const f = pick(body, NOTE_FIELDS, {
      team_id: null, member_id: null, title: '', body: '', kind: 'thought', pinned: 0,
    });
    const ts = now();
    const res = run(
      `INSERT INTO notes (${NOTE_FIELDS.join(',')}, created_at, updated_at)
       VALUES (${NOTE_FIELDS.map(() => '?').join(',')}, ?, ?)`,
      [...NOTE_FIELDS.map((k) => f[k]), ts, ts],
    );
    return notes.get(Number(res.lastInsertRowid));
  },

  update(id, body) {
    if (!notes.get(id)) return null;
    patch('notes', id, body, NOTE_FIELDS);
    return notes.get(id);
  },

  remove(id) {
    return run('DELETE FROM notes WHERE id = ?', [id]).changes > 0;
  },
};

// ---------------------------------------------------------------------------
// Dashboard & search
// ---------------------------------------------------------------------------

export function dashboard() {
  const t = today();
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const teamList = teams.list();

  return {
    today: t,
    teams: teamList,
    my_open_tasks: tasks.list({ owner: 'ta', open_only: true }),
    overdue_tasks: tasks.list({ open_only: true }).filter((x) => x.due_date && x.due_date < t),
    due_this_week: tasks.list({ open_only: true }).filter(
      (x) => x.due_date && x.due_date >= t && x.due_date <= weekAhead,
    ),
    upcoming_milestones: all(
      `SELECT ms.*, tm.name AS team_name, tm.color AS team_color
       FROM milestones ms JOIN teams tm ON tm.id = ms.team_id
       WHERE ms.status != 'done' AND ms.due_date IS NOT NULL
       ORDER BY ms.due_date LIMIT 10`,
    ),
    recent_meetings: meetings.list({ limit: 6 }).map((m) => ({
      ...m,
      team_name: (one('SELECT name FROM teams WHERE id = ?', [m.team_id]) || {}).name,
    })),
    pinned_notes: all(
      `SELECT n.*, t.name AS team_name, t.color AS team_color FROM notes n
       LEFT JOIN teams t ON t.id = n.team_id
       WHERE n.pinned = 1 ORDER BY n.updated_at DESC LIMIT 10`,
    ),
    risks: teamList.flatMap((team) =>
      teams.risks(team.id).map((r) => ({ ...r, team_id: team.id, team_name: team.name })),
    ),
    counts: {
      teams: teamList.length,
      members: one('SELECT COUNT(*) AS c FROM members WHERE active = 1').c,
      open_tasks: one("SELECT COUNT(*) AS c FROM tasks WHERE status != 'done'").c,
      meetings: one('SELECT COUNT(*) AS c FROM meetings').c,
    },
  };
}

export function search(q) {
  const query = String(q || '').trim();
  if (!query) return [];
  const like = `%${query.toLowerCase()}%`;
  const results = [];

  for (const r of all(
    `SELECT id, name, project_title, project_description FROM teams
     WHERE lower(name) LIKE ? OR lower(project_title) LIKE ? OR lower(project_description) LIKE ?`,
    [like, like, like],
  )) {
    results.push({ type: 'team', id: r.id, title: r.name, snippet: r.project_title || r.project_description, link: `#/teams/${r.id}` });
  }

  for (const r of all(
    `SELECT m.id, m.team_id, m.date, m.title, m.notes, m.agenda, m.decisions, m.private_notes, t.name AS team_name
     FROM meetings m JOIN teams t ON t.id = m.team_id
     WHERE lower(m.title) LIKE ? OR lower(m.notes) LIKE ? OR lower(m.agenda) LIKE ?
        OR lower(m.decisions) LIKE ? OR lower(m.private_notes) LIKE ? OR lower(m.blockers) LIKE ?`,
    [like, like, like, like, like, like],
  )) {
    results.push({
      type: 'meeting', id: r.id, title: `${niceDate(r.date)} — ${r.title || 'Meeting'} (${r.team_name})`,
      snippet: excerpt([r.notes, r.agenda, r.decisions, r.private_notes].join(' '), query),
      link: `#/teams/${r.team_id}/meetings/${r.id}`,
    });
  }

  for (const r of all(
    `SELECT t.id, t.team_id, t.title, t.description, t.status, tm.name AS team_name
     FROM tasks t LEFT JOIN teams tm ON tm.id = t.team_id
     WHERE lower(t.title) LIKE ? OR lower(t.description) LIKE ?`,
    [like, like],
  )) {
    results.push({
      type: 'task', id: r.id, title: r.title,
      snippet: `${r.status}${r.team_name ? ` · ${r.team_name}` : ''} — ${excerpt(r.description, query)}`,
      link: r.team_id ? `#/teams/${r.team_id}/tasks` : '#/tasks',
    });
  }

  for (const r of all(
    `SELECT n.id, n.team_id, n.title, n.body, n.kind, t.name AS team_name
     FROM notes n LEFT JOIN teams t ON t.id = n.team_id
     WHERE lower(n.title) LIKE ? OR lower(n.body) LIKE ?`,
    [like, like],
  )) {
    results.push({
      type: 'note', id: r.id, title: r.title || `${r.kind} note`,
      snippet: excerpt(r.body, query),
      link: r.team_id ? `#/teams/${r.team_id}/notes` : '#/notes',
    });
  }

  for (const r of all(
    `SELECT m.id, m.team_id, m.name, m.role, m.notes, t.name AS team_name
     FROM members m JOIN teams t ON t.id = m.team_id
     WHERE lower(m.name) LIKE ? OR lower(m.notes) LIKE ? OR lower(m.role) LIKE ? OR lower(m.email) LIKE ?`,
    [like, like, like, like],
  )) {
    results.push({
      type: 'member', id: r.id, title: r.name,
      snippet: `${r.role || 'member'} · ${r.team_name}`,
      link: `#/teams/${r.team_id}`,
    });
  }

  return results;
}

function excerpt(text, query, radius = 70) {
  if (!text) return '';
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  return (start > 0 ? '…' : '') + text.slice(start, idx + query.length + radius).replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export function exportAll() {
  return {
    format: 'ta-project-tracker',
    version: 1,
    exported_at: now(),
    teams: all('SELECT * FROM teams ORDER BY id'),
    members: all('SELECT * FROM members ORDER BY id'),
    meetings: all('SELECT * FROM meetings ORDER BY id'),
    attendance: all('SELECT * FROM attendance'),
    tasks: all('SELECT * FROM tasks ORDER BY id'),
    milestones: all('SELECT * FROM milestones ORDER BY id'),
    notes: all('SELECT * FROM notes ORDER BY id'),
    tags: all('SELECT * FROM tags ORDER BY id'),
    tag_links: all('SELECT * FROM tag_links'),
  };
}

/**
 * Restore a JSON export. `mode: 'replace'` wipes everything first;
 * `mode: 'merge'` appends with fresh ids (kept simple and predictable).
 */
export function importAll(payload, { mode = 'replace' } = {}) {
  if (!payload || payload.format !== 'ta-project-tracker') {
    throw badRequest('Not a project-tracker export file');
  }
  const db = getDb();
  db.exec('BEGIN');
  try {
    if (mode === 'replace') {
      for (const t of ['tag_links', 'tags', 'notes', 'milestones', 'tasks', 'attendance', 'meetings', 'members', 'teams']) {
        db.exec(`DELETE FROM ${t}`);
      }
    }
    const teamMap = new Map();
    const memberMap = new Map();
    const meetingMap = new Map();

    for (const t of payload.teams || []) {
      const created = teams.create({ ...t });
      teamMap.set(t.id, created.id);
      patch('teams', created.id, { archived: t.archived ?? 0, status: t.status, health: t.health }, TEAM_FIELDS);
    }
    for (const m of payload.members || []) {
      const created = members.create({ ...m, team_id: teamMap.get(m.team_id) ?? m.team_id });
      memberMap.set(m.id, created.id);
    }
    for (const mt of payload.meetings || []) {
      const created = meetings.create({ ...mt, team_id: teamMap.get(mt.team_id) ?? mt.team_id, attendance: undefined });
      meetingMap.set(mt.id, created.id);
    }
    for (const a of payload.attendance || []) {
      const mid = meetingMap.get(a.meeting_id) ?? a.meeting_id;
      const memId = memberMap.get(a.member_id) ?? a.member_id;
      run('INSERT OR REPLACE INTO attendance (meeting_id, member_id, status) VALUES (?, ?, ?)', [mid, memId, a.status]);
    }
    for (const ms of payload.milestones || []) {
      milestones.create({ ...ms, team_id: teamMap.get(ms.team_id) ?? ms.team_id });
    }
    for (const tk of payload.tasks || []) {
      tasks.create({
        ...tk,
        team_id: tk.team_id ? (teamMap.get(tk.team_id) ?? tk.team_id) : null,
        member_id: tk.member_id ? (memberMap.get(tk.member_id) ?? tk.member_id) : null,
        meeting_id: tk.meeting_id ? (meetingMap.get(tk.meeting_id) ?? tk.meeting_id) : null,
      });
    }
    for (const n of payload.notes || []) {
      notes.create({
        ...n,
        team_id: n.team_id ? (teamMap.get(n.team_id) ?? n.team_id) : null,
        member_id: n.member_id ? (memberMap.get(n.member_id) ?? n.member_id) : null,
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, counts: dashboard().counts };
}

/** Per-team Markdown report — handy for end-of-semester evaluations. */
export function teamReport(teamId) {
  const t = teams.full(teamId);
  if (!t) return null;
  const L = [];
  L.push(`# ${t.name}`);
  if (t.project_title) L.push(`\n**Project:** ${t.project_title}`);
  if (t.course || t.semester) L.push(`**Course:** ${[t.course, t.semester].filter(Boolean).join(' · ')}`);
  if (t.project_description) L.push(`\n${t.project_description}`);
  if (t.tech_stack) L.push(`\n**Stack:** ${t.tech_stack}`);
  const links = [
    t.repo_url && `[Repo](${t.repo_url})`,
    t.demo_url && `[Demo](${t.demo_url})`,
    t.doc_url && `[Docs](${t.doc_url})`,
  ].filter(Boolean);
  if (links.length) L.push(`\n${links.join(' · ')}`);

  L.push(`\n**Progress:** ${t.progress ?? 0}%  ·  **Meetings logged:** ${t.meeting_count}  ·  **Tasks:** ${t.task_done}/${t.task_total} done`);

  L.push('\n## Team members\n');
  L.push('| Name | Role | Email | Attendance | Tasks done |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const m of t.members) {
    L.push(`| ${m.name} | ${m.role || '—'} | ${m.email || '—'} | ${m.attendance_rate === null ? '—' : `${m.attendance_rate}% (${m.meetings_attended}/${m.meetings_recorded})`} | ${m.tasks_done}/${m.tasks_assigned} |`);
  }

  if (t.milestones.length) {
    L.push('\n## Milestones\n');
    for (const m of t.milestones) {
      const box = m.status === 'done' ? 'x' : ' ';
      L.push(`- [${box}] **${m.title}**${m.due_date ? ` — due ${m.due_date}` : ''} _(${m.status})_${m.description ? `\n      ${m.description}` : ''}`);
    }
  }

  const openTasks = t.tasks.filter((x) => x.status !== 'done');
  if (openTasks.length) {
    L.push('\n## Open tasks\n');
    for (const x of openTasks) {
      L.push(`- [${x.owner === 'ta' ? 'TA' : 'Team'}] ${x.title}${x.member_name ? ` — @${x.member_name}` : ''}${x.due_date ? ` (due ${x.due_date})` : ''} _(${x.status})_`);
    }
  }

  if (t.meetings.length) {
    L.push('\n## Meeting log\n');
    for (const m of [...t.meetings].reverse()) {
      L.push(`### ${m.date}${m.title ? ` — ${m.title}` : ''}`);
      const present = m.attendance.filter((a) => a.status === 'present').map((a) => a.name);
      const absent = m.attendance.filter((a) => a.status === 'absent').map((a) => a.name);
      if (present.length) L.push(`_Present:_ ${present.join(', ')}`);
      if (absent.length) L.push(`_Absent:_ ${absent.join(', ')}`);
      if (m.agenda) L.push(`\n**Agenda**\n\n${m.agenda}`);
      if (m.notes) L.push(`\n**Notes**\n\n${m.notes}`);
      if (m.decisions) L.push(`\n**Decisions**\n\n${m.decisions}`);
      if (m.blockers) L.push(`\n**Blockers**\n\n${m.blockers}`);
      L.push('');
    }
  }

  const visibleNotes = t.notes;
  if (visibleNotes.length) {
    L.push('\n## Notes & observations\n');
    for (const n of visibleNotes) {
      L.push(`- **${n.kind}**${n.member_name ? ` (${n.member_name})` : ''}${n.title ? ` — ${n.title}` : ''}: ${n.body}`);
    }
  }

  return L.join('\n');
}

// ---------------------------------------------------------------------------

export function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}
