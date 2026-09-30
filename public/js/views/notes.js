import { api } from '../api.js';
import { esc } from '../ui.js';
import { noteCard, wireNotes } from './components.js';
import { noteForm } from './forms.js';

const KINDS = [
  ['', 'All'],
  ['thought', 'Thoughts'],
  ['observation', 'Observations'],
  ['concern', 'Concerns'],
  ['kudos', 'Kudos'],
  ['idea', 'Ideas'],
  ['grading', 'Grading'],
];

export default async function notesView({ query, state, refresh }) {
  const kind = query.kind || '';
  const teamId = query.team || '';

  const list = await api.notes.list({
    kind: kind || undefined,
    team_id: teamId || undefined,
  });

  const link = (patch) => {
    const q = { kind, team: teamId, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
    return `#/notes${p.toString() ? `?${p}` : ''}`;
  };

  // A third entry in an option tints its dot, so the team filter doubles as the
  // colour key for the cards.
  const chips = (label, opts, current, key) => `
    <div style="margin-bottom:10px">
      <div class="micro" style="margin-bottom:6px">${esc(label)}</div>
      <div class="chips">${opts.map(([v, l, color]) =>
    `<a class="chip ${current === v ? 'on' : ''}" href="${link({ [key]: v })}">${
      color ? `<span class="dot" style="background:${esc(color)}"></span>` : ''
    }${esc(l)}</a>`).join('')}</div>
    </div>`;

  const side = `
    <div class="sidehead">Filter</div>
    ${chips('Kind', KINDS, kind, 'kind')}
    ${chips('Team', [
    ['', 'All teams'],
    ...state.teams.map((t) => [String(t.id), t.name, t.color || 'var(--ink-3)']),
  ], teamId, 'team')}`;

  const content = `
    <div class="pagehead">
      <div class="grow">
        <h1>Notes &amp; thoughts</h1>
        <div class="deck">${list.length} note${list.length === 1 ? '' : 's'} — the running commentary that
          doesn't belong in a meeting log or a task.</div>
      </div>
      <button class="btn" id="nv-add">＋ New note</button>
    </div>

    ${list.length
    ? `<div class="masonry" style="margin-top:18px">${list.map((n) => noteCard(n, { showTeam: true })).join('')}</div>`
    : `<div class="card" style="margin-top:18px"><div class="empty">
         Nothing here yet. Notes are for the things you notice between meetings —
         who is carrying the team, what worries you, an idea to raise next week.
       </div></div>`}`;

  return {
    content,
    side,
    mount(root) {
      root.querySelector('#nv-add').addEventListener('click',
        () => noteForm(null, { team_id: teamId ? Number(teamId) : undefined, kind: kind || 'thought' }, refresh));
      wireNotes(root, refresh, noteForm);
    },
  };
}
