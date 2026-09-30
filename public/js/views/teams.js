import { api } from '../api.js';
import { esc } from '../ui.js';
import { teamCard } from './components.js';
import { teamForm } from './forms.js';

export default async function teamsView({ query }) {
  const showArchived = query.archived === '1';
  const list = await api.teams.list(showArchived ? { archived: 1 } : undefined);

  const content = `
    <div class="pagehead">
      <div class="grow">
        <h1>Teams</h1>
        <div class="deck">${list.length} team${list.length === 1 ? '' : 's'} under supervision</div>
      </div>
      <div class="actions">
        <a class="btn ghost" href="#/teams${showArchived ? '' : '?archived=1'}">
          ${showArchived ? 'Hide archived' : 'Show archived'}
        </a>
        <button class="btn" id="tv-new">＋ New team</button>
      </div>
    </div>

    ${list.length
    ? `<div class="grid c2" style="margin-top:18px">${list.map(teamCard).join('')}</div>`
    : `<div class="card" style="margin-top:18px"><div class="empty">
         No teams yet. Add the two capstone teams you are supervising to get started.
       </div></div>`}
  `;

  return {
    content,
    mount(root) {
      root.querySelector('#tv-new').addEventListener('click', () => teamForm(null));
    },
  };
}
