import { api } from './api.js';
import { esc, toastError, closeDrawer } from './ui.js';
import { teamForm } from './views/forms.js';

import dashboardView from './views/dashboard.js';
import teamsView from './views/teams.js';
import teamView from './views/team.js';
import tasksView from './views/tasks.js';
import notesView from './views/notes.js';
import timelineView from './views/timeline.js';
import searchView from './views/search.js';
import backupView from './views/backup.js';

const TABS = [
  ['/', 'Dashboard'],
  ['/teams', 'Teams'],
  ['/tasks', 'Tasks'],
  ['/notes', 'Notes'],
  ['/timeline', 'Timeline'],
  ['/backup', 'Backup'],
];

const ROUTES = [
  [/^\/$/, dashboardView],
  [/^\/teams$/, teamsView],
  [/^\/teams\/(\d+)$/, teamView, ['id']],
  [/^\/teams\/(\d+)\/([a-z]+)$/, teamView, ['id', 'tab']],
  [/^\/tasks$/, tasksView],
  [/^\/notes$/, notesView],
  [/^\/timeline$/, timelineView],
  [/^\/search$/, searchView],
  [/^\/backup$/, backupView],
];

const contentEl = () => document.getElementById('content');
const sideEl = () => document.getElementById('side');

/** Shared, lightly cached state: the sidebar needs the team list on every view. */
export const state = { teams: [], loaded: false };

export function go(path) {
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}

/** Re-fetch the team list and re-render the current route. */
export async function refresh() {
  state.teams = await api.teams.list();
  updateBrand();
  await render();
}

function updateBrand() {
  const n = state.teams.length;
  document.getElementById('brand-sub').textContent =
    `TA workspace · ${n} team${n === 1 ? '' : 's'}`;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, queryStr] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryStr || '').entries());
  return { path: path || '/', query };
}

// ---------------------------------------------------------------- sidebar

function sidebarHtml(active, extra = '') {
  const { path } = parseHash();
  const teams = state.teams;
  const teamLinks = teams.length
    ? teams.map((t) => {
        const on = path === `/teams/${t.id}` || path.startsWith(`/teams/${t.id}/`);
        const alerts = (t.task_overdue || 0) + (t.milestone_overdue || 0);
        return `<a href="#/teams/${t.id}" class="${on ? 'on' : ''}" title="${esc(t.project_title || t.name)}">
            <span class="dot" style="background:${esc(t.color || 'var(--accent)')}"></span>
            <span class="sl-name">${esc(t.name)}</span>
            <span class="ct">${alerts ? `<span style="color:var(--critical)">▲${alerts}</span>` : `${t.progress ?? 0}%`}</span>
          </a>`;
      }).join('')
    : `<div class="muted" style="font-size:.82rem;padding:4px 2px">No teams yet.</div>`;

  return `
    <form class="searchbox" id="side-search" autocomplete="off">
      <span class="muted" aria-hidden="true">⌕</span>
      <input type="search" id="side-search-input" placeholder="Search everything…"
             aria-label="Search" value="${esc(parseHash().query.q || '')}" />
    </form>

    <div class="sidehead" style="margin-top:20px">
      <span>Teams</span>
      <button type="button" id="side-add-team">+ add</button>
    </div>
    <div class="sidelist">${teamLinks}</div>

    ${extra}

    <div class="sidehead">Shortcuts</div>
    <div class="sidelist">
      <a href="#/tasks?owner=ta" class="${path === '/tasks' && parseHash().query.owner === 'ta' ? 'on' : ''}">
        <span class="sl-name">My TA to-dos</span></a>
      <a href="#/tasks?due=overdue"><span class="sl-name">Overdue</span></a>
      <a href="#/notes?kind=concern"><span class="sl-name">Concerns</span></a>
      <a href="#/backup"><span class="sl-name">Export / backup</span></a>
    </div>`;
}

function wireSidebar() {
  const form = document.getElementById('side-search');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = document.getElementById('side-search-input').value.trim();
      if (q) go(`/search?q=${encodeURIComponent(q)}`);
    });
  }
  const add = document.getElementById('side-add-team');
  if (add) add.addEventListener('click', () => teamForm(null));
}

function renderTabs(path) {
  document.getElementById('tabs').innerHTML = TABS.map(([href, label]) => {
    const on = href === '/' ? path === '/' : path.startsWith(href);
    return `<a class="tab" role="tab" aria-selected="${on}" href="#${href}">${esc(label)}</a>`;
  }).join('');
}

// ---------------------------------------------------------------- render

let renderToken = 0;

export async function render() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  renderTabs(path);

  let match = null;
  for (const [re, view, names = []] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    const params = {};
    names.forEach((n, i) => { params[n] = m[i + 1]; });
    match = { view, params };
    break;
  }

  if (!match) {
    contentEl().innerHTML = `<div class="empty">Nothing here. <a href="#/">Back to the dashboard</a>.</div>`;
    sideEl().innerHTML = sidebarHtml();
    wireSidebar();
    return;
  }

  contentEl().innerHTML = `<div class="empty"><span class="spin"></span></div>`;

  let out;
  try {
    out = await match.view({ params: match.params, query, state, refresh, go });
  } catch (err) {
    if (token !== renderToken) return;
    contentEl().innerHTML = `<div class="err">${esc(err.message || String(err))}</div>`;
    sideEl().innerHTML = sidebarHtml();
    wireSidebar();
    return;
  }
  if (token !== renderToken) return; // a newer navigation won

  contentEl().innerHTML = out.content || '';
  sideEl().innerHTML = sidebarHtml(path, out.side || '');
  wireSidebar();
  if (out.mount) out.mount(contentEl(), sideEl());
  contentEl().scrollIntoView({ block: 'start' });
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- theme

function applyTheme(mode) {
  if (mode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  localStorage.setItem('pt-theme', mode);
  const btn = document.getElementById('btn-theme');
  btn.textContent = mode === 'dark' ? '☾' : mode === 'light' ? '☀' : '◐';
  btn.title = `Theme: ${mode}`;
}

// ---------------------------------------------------------------- boot

async function boot() {
  applyTheme(localStorage.getItem('pt-theme') || 'system');
  document.getElementById('btn-theme').addEventListener('click', () => {
    const cur = localStorage.getItem('pt-theme') || 'system';
    applyTheme(cur === 'system' ? 'light' : cur === 'light' ? 'dark' : 'system');
  });

  const menuBtn = document.getElementById('btn-menu');
  menuBtn.addEventListener('click', () => {
    const open = document.body.classList.toggle('nav-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  window.addEventListener('hashchange', () => {
    closeDrawer();
    // Navigating from the narrow-screen menu should put it away again.
    document.body.classList.remove('nav-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    render();
  });

  // '/' focuses search, like the reference app.
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      const el = document.getElementById('side-search-input');
      if (el) el.focus();
    }
  });

  try {
    state.teams = await api.teams.list();
    state.loaded = true;
    updateBrand();
  } catch (err) {
    contentEl().innerHTML =
      `<div class="err">Cannot reach the local server — ${esc(err.message)}.
       Is <code>npm start</code> still running?</div>`;
    return;
  }
  await render();
}

boot().catch((e) => toastError(e));
