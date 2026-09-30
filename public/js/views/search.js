import { api } from '../api.js';
import { esc, flag } from '../ui.js';

const TYPE_FLAG = {
  team: 'accent', meeting: 'info', task: 'warning', note: 'ok', member: 'info',
};

export default async function searchView({ query }) {
  const q = (query.q || '').trim();
  if (!q) {
    return {
      content: `<div class="pagehead"><div class="grow"><h1>Search</h1>
        <div class="deck">Type in the box on the left — it looks through meeting notes,
        private thoughts, tasks, notes, students and project descriptions.</div></div></div>`,
    };
  }

  const { results } = await api.search(q);
  const byType = results.reduce((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  const order = ['team', 'member', 'meeting', 'task', 'note'];
  const LABEL = {
    team: 'Teams', member: 'Students', meeting: 'Meetings', task: 'Tasks', note: 'Notes',
  };

  const highlight = (text) => {
    const s = String(text || '');
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return esc(s);
    return `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + q.length))}</mark>${esc(s.slice(i + q.length))}`;
  };

  const content = `
    <div class="pagehead">
      <div class="grow">
        <h1>“${esc(q)}”</h1>
        <div class="deck">${results.length} result${results.length === 1 ? '' : 's'}</div>
      </div>
    </div>

    ${results.length === 0
    ? `<div class="card" style="margin-top:18px"><div class="empty">
         Nothing matched. Search covers meeting notes and private thoughts, task titles,
         notes, student names and project text.</div></div>`
    : order.filter((t) => byType[t]).map((type) => `
        <div class="card" style="margin-top:14px">
          <div class="cardhead"><h2>${esc(LABEL[type])}</h2>
            <span class="micro">${byType[type].length}</span></div>
          <div class="rows">
            ${byType[type].map((r) => `
              <div class="row">
                <div class="grow">
                  <div class="rtitle"><a href="${esc(r.link)}">${highlight(r.title)}</a></div>
                  ${r.snippet ? `<div class="muted" style="font-size:.83rem;margin-top:2px">${highlight(r.snippet)}</div>` : ''}
                </div>
                ${flag(r.type, TYPE_FLAG[r.type] || 'info')}
              </div>`).join('')}
          </div>
        </div>`).join('')}`;

  return { content };
}
