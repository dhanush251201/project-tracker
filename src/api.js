import {
  teams, members, meetings, tasks, milestones, notes,
  dashboard, search, exportAll, importAll, teamReport,
  TASK_STATUSES, MILESTONE_STATUSES, NOTE_KINDS,
} from './store.js';

const routes = [];

function route(method, pattern, handler) {
  // '/api/teams/:id' -> /^\/api\/teams\/([^/]+)$/
  const names = [];
  const regex = new RegExp(
    `^${pattern.replace(/:[a-zA-Z_]+/g, (m) => {
      names.push(m.slice(1));
      return '([^/]+)';
    })}$`,
  );
  routes.push({ method, regex, names, handler });
}

/** Resolve a request to a handler; returns null when nothing matches. */
export function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.regex);
    if (!m) continue;
    const params = {};
    r.names.forEach((n, i) => { params[n] = m[i + 1]; });
    return { handler: r.handler, params };
  }
  return null;
}

const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function notFound() {
  const e = new Error('Not found');
  e.status = 404;
  throw e;
}

// --- meta ------------------------------------------------------------------

route('GET', '/api/health', () => ({ ok: true, time: new Date().toISOString() }));

route('GET', '/api/meta', () => ({
  task_statuses: TASK_STATUSES,
  milestone_statuses: MILESTONE_STATUSES,
  note_kinds: NOTE_KINDS,
}));

// --- dashboard / search ----------------------------------------------------

route('GET', '/api/dashboard', () => dashboard());
route('GET', '/api/search', (ctx) => ({ query: ctx.query.q || '', results: search(ctx.query.q) }));

// --- teams -----------------------------------------------------------------

route('GET', '/api/teams', (ctx) =>
  teams.list({ includeArchived: ctx.query.archived === '1' }));
route('POST', '/api/teams', (ctx) => teams.create(ctx.body));
route('GET', '/api/teams/:id', (ctx) => teams.get(num(ctx.params.id)) || notFound());
route('GET', '/api/teams/:id/full', (ctx) => teams.full(num(ctx.params.id)) || notFound());
route('GET', '/api/teams/:id/prep', (ctx) => meetings.prep(num(ctx.params.id)) || notFound());
route('PUT', '/api/teams/:id', (ctx) => teams.update(num(ctx.params.id), ctx.body) || notFound());
route('DELETE', '/api/teams/:id', (ctx) =>
  teams.remove(num(ctx.params.id)) ? { ok: true } : notFound());

// --- members ---------------------------------------------------------------

route('GET', '/api/members', (ctx) => members.list(num(ctx.query.team_id)));
route('POST', '/api/members', (ctx) => members.create(ctx.body));
route('GET', '/api/members/:id', (ctx) => members.get(num(ctx.params.id)) || notFound());
route('PUT', '/api/members/:id', (ctx) => members.update(num(ctx.params.id), ctx.body) || notFound());
route('DELETE', '/api/members/:id', (ctx) =>
  members.remove(num(ctx.params.id)) ? { ok: true } : notFound());

// --- meetings --------------------------------------------------------------

route('GET', '/api/meetings', (ctx) =>
  meetings.list({ team_id: num(ctx.query.team_id), limit: num(ctx.query.limit) }));
route('POST', '/api/meetings', (ctx) => meetings.create(ctx.body));
route('GET', '/api/meetings/:id', (ctx) => meetings.get(num(ctx.params.id)) || notFound());
route('PUT', '/api/meetings/:id', (ctx) => meetings.update(num(ctx.params.id), ctx.body) || notFound());
route('DELETE', '/api/meetings/:id', (ctx) =>
  meetings.remove(num(ctx.params.id)) ? { ok: true } : notFound());

// --- tasks -----------------------------------------------------------------

route('GET', '/api/tasks', (ctx) => tasks.list({
  team_id: ctx.query.team_id !== undefined ? num(ctx.query.team_id) : undefined,
  owner: ctx.query.owner,
  status: ctx.query.status,
  member_id: num(ctx.query.member_id),
  meeting_id: num(ctx.query.meeting_id),
  open_only: ctx.query.open === '1',
}));
route('POST', '/api/tasks', (ctx) => tasks.create(ctx.body));
route('GET', '/api/tasks/:id', (ctx) => tasks.get(num(ctx.params.id)) || notFound());
route('PUT', '/api/tasks/:id', (ctx) => tasks.update(num(ctx.params.id), ctx.body) || notFound());
route('DELETE', '/api/tasks/:id', (ctx) =>
  tasks.remove(num(ctx.params.id)) ? { ok: true } : notFound());

// --- milestones ------------------------------------------------------------

route('GET', '/api/milestones', (ctx) => milestones.list(num(ctx.query.team_id)));
route('POST', '/api/milestones', (ctx) => milestones.create(ctx.body));
route('GET', '/api/milestones/:id', (ctx) => milestones.get(num(ctx.params.id)) || notFound());
route('PUT', '/api/milestones/:id', (ctx) => milestones.update(num(ctx.params.id), ctx.body) || notFound());
route('DELETE', '/api/milestones/:id', (ctx) =>
  milestones.remove(num(ctx.params.id)) ? { ok: true } : notFound());

// --- notes -----------------------------------------------------------------

route('GET', '/api/notes', (ctx) => notes.list({
  team_id: ctx.query.team_id !== undefined ? num(ctx.query.team_id) : undefined,
  member_id: num(ctx.query.member_id),
  kind: ctx.query.kind,
}));
route('POST', '/api/notes', (ctx) => notes.create(ctx.body));
route('GET', '/api/notes/:id', (ctx) => notes.get(num(ctx.params.id)) || notFound());
route('PUT', '/api/notes/:id', (ctx) => notes.update(num(ctx.params.id), ctx.body) || notFound());
route('DELETE', '/api/notes/:id', (ctx) =>
  notes.remove(num(ctx.params.id)) ? { ok: true } : notFound());

// --- backup / reports ------------------------------------------------------

route('GET', '/api/export', () => exportAll());
route('POST', '/api/import', (ctx) =>
  importAll(ctx.body.payload || ctx.body, { mode: ctx.body.mode || 'replace' }));
route('GET', '/api/teams/:id/report', (ctx) => {
  const md = teamReport(num(ctx.params.id));
  if (md === null) notFound();
  return { raw: md, contentType: 'text/markdown; charset=utf-8' };
});

export { routes };
