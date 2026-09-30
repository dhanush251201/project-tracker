// Small DOM / formatting helpers shared by every view.

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Tagged template that escapes every interpolation. Arrays are joined. */
export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = vals[i - 1];
    const str = Array.isArray(v) ? v.join('') : v === null || v === undefined ? '' : String(v);
    return out + str + s;
  });
}

// ---------------------------------------------------------------- dates

/** 'YYYY-MM-DD' -> local Date (avoids the UTC-parsing off-by-one). */
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(s, opts = { month: 'short', day: 'numeric' }) {
  const d = parseDate(s);
  if (!d) return '—';
  const withYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString(undefined, withYear ? { ...opts, year: 'numeric' } : opts);
}

export function fmtDateLong(s) {
  const d = parseDate(s);
  if (!d) return '—';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysFromToday(s) {
  const d = parseDate(s);
  if (!d) return null;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

/** 'in 3 days' / 'yesterday' / 'Sep 3' for anything further out. */
export function relDate(s) {
  const n = daysFromToday(s);
  if (n === null) return '—';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n <= 13) return `in ${n} days`;
  if (n < -1 && n >= -13) return `${-n} days ago`;
  return fmtDate(s);
}

export function fmtStamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function isOverdue(due, status) {
  if (!due || status === 'done') return false;
  return due < todayStr();
}

// ---------------------------------------------------------------- display

export const STATUS_LABEL = {
  todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done',
  pending: 'Pending', missed: 'Missed',
};

export const STATUS_FLAG = {
  todo: 'info', in_progress: 'accent', blocked: 'critical', done: 'ok',
  pending: 'info', missed: 'critical',
};

export const TICK_GLYPH = { todo: '', in_progress: '◐', blocked: '!', done: '✓' };

export const PRIORITY_FLAG = { high: 'critical', normal: 'info', low: 'info' };

export function initials(name) {
  return String(name || '?')
    .trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0] || '').join('').toUpperCase() || '?';
}

const AVATAR_COLORS = ['#2E7EBB', '#D96518', '#1B9E8F', '#A05CC4', '#9E3826', '#3A6A4E', '#8A6412'];
export function avatarColor(seed) {
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function avatar(name, cls = '') {
  return `<span class="avatar ${cls}" style="background:${avatarColor(name)}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

export function flag(text, kind = 'info', title = '') {
  return `<span class="flag ${kind}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
}

export function progressBar(pct, color) {
  const v = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
  return `<div class="bar" style="--team:${esc(color || 'var(--accent)')}"><i style="width:${v}%"></i></div>`;
}

export function pluralize(n, one, many) {
  return `${n} ${n === 1 ? one : many || `${one}s`}`;
}

// ---------------------------------------------------------------- toasts

export function toast(message, kind = '') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5200 : 2600);
}

export function toastError(err) {
  console.error(err);
  toast(err && err.message ? err.message : String(err), 'err');
}

// ---------------------------------------------------------------- drawer

let closeCurrentDrawer = null;
// Raised while a confirm sits on top of a drawer, so Esc dismisses only the top layer.
let overlayDepth = 0;

export function closeDrawer() {
  if (closeCurrentDrawer) closeCurrentDrawer();
}

/**
 * Slide-over panel. `body` is an HTML string; `onMount(bodyEl, close)` wires it up.
 * Returns the close function.
 */
export function openDrawer({ title, subtitle = '', body = '', footer = '', wide = false, onMount }) {
  closeDrawer();
  const root = document.getElementById('drawer-root');
  root.innerHTML = `
    <div class="scrim" data-close="1"></div>
    <div class="drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}"
         style="${wide ? 'width:min(960px,100%)' : ''}">
      <header>
        <div class="grow">
          <h2>${esc(title)}</h2>
          ${subtitle ? `<div class="micro" style="margin-top:4px">${esc(subtitle)}</div>` : ''}
        </div>
        <button class="iconbtn" data-close="1" title="Close (Esc)">✕</button>
      </header>
      <div class="scroll">${body}</div>
      ${footer ? `<footer>${footer}</footer>` : ''}
    </div>`;

  const close = () => {
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    closeCurrentDrawer = null;
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && overlayDepth === 0) close();
  };
  document.addEventListener('keydown', onKey);
  closeCurrentDrawer = close;

  root.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', close));

  const scroll = root.querySelector('.scroll');
  const foot = root.querySelector('footer');
  if (onMount) onMount(scroll, close, foot);
  const first = scroll.querySelector('input, textarea, select');
  if (first) setTimeout(() => first.focus(), 40);
  return close;
}

// ---------------------------------------------------------------- forms

function fieldHtml(f, value) {
  const v = value === undefined || value === null ? '' : value;
  const label = `<span>${esc(f.label)}</span>`;
  const note = f.note ? `<span class="note">${esc(f.note)}</span>` : '';
  const req = f.required ? ' required' : '';
  let control;

  switch (f.type) {
    case 'textarea':
      control = `<textarea name="${esc(f.name)}" rows="${f.rows || 4}"
        class="${f.tall ? 'tall' : ''}" placeholder="${esc(f.placeholder || '')}"${req}>${esc(v)}</textarea>`;
      break;
    case 'select':
      control = `<select name="${esc(f.name)}"${req}>${
        (f.options || []).map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const lab = typeof o === 'string' ? o : o.label;
          return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`;
        }).join('')
      }</select>`;
      break;
    case 'checkbox':
      return `<label class="check"><input type="checkbox" name="${esc(f.name)}"${v ? ' checked' : ''} />
        <span>${esc(f.label)}${f.note ? ` — <span class="muted">${esc(f.note)}</span>` : ''}</span></label>`;
    case 'color':
      control = `<input type="color" name="${esc(f.name)}" value="${esc(v || '#2F5D8C')}"
        style="height:34px;padding:2px" />`;
      break;
    default:
      control = `<input type="${f.type || 'text'}" name="${esc(f.name)}" value="${esc(v)}"
        placeholder="${esc(f.placeholder || '')}"${f.min !== undefined ? ` min="${f.min}"` : ''}${req} />`;
  }
  return `<label class="field">${label}${control}${note}</label>`;
}

function fieldsHtml(fields, values) {
  return fields.map((f) => {
    if (f.row) {
      return `<div class="fieldrow${f.row.length > 2 ? ' three' : ''}">${
        f.row.map((sub) => fieldHtml(sub, values[sub.name])).join('')
      }</div>`;
    }
    if (f.raw) return f.raw;
    if (f.heading) return `<div class="sidehead" style="margin:18px 0 10px">${esc(f.heading)}</div>`;
    return fieldHtml(f, values[f.name]);
  }).join('');
}

/** Read a form back into a plain object, coercing numbers and checkboxes. */
export function readForm(formEl, fields) {
  const flat = [];
  for (const f of fields) {
    if (f.row) flat.push(...f.row);
    else if (!f.raw && !f.heading) flat.push(f);
  }
  const out = {};
  for (const f of flat) {
    const el = formEl.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked ? 1 : 0;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else {
      const val = el.value;
      out[f.name] = f.nullable && val === '' ? null : val;
    }
  }
  return out;
}

/**
 * Drawer containing a form. `onSubmit(values, close)` may be async; errors are
 * surfaced inline instead of closing the panel.
 */
export function openForm({
  title, subtitle = '', fields, values = {}, submitLabel = 'Save',
  onSubmit, onDelete, deleteLabel = 'Delete', wide = false, intro = '',
}) {
  return openDrawer({
    title,
    subtitle,
    wide,
    body: `${intro}<form id="drawer-form" novalidate>${fieldsHtml(fields, values)}</form>
           <div class="err" id="form-err" hidden></div>`,
    footer: `
      ${onDelete ? `<button type="button" class="btn danger left" id="form-delete">${esc(deleteLabel)}</button>` : ''}
      <button type="button" class="btn ghost" data-cancel="1">Cancel</button>
      <button type="button" class="btn" id="form-save">${esc(submitLabel)}</button>`,
    onMount(bodyEl, close, footEl) {
      const form = bodyEl.querySelector('#drawer-form');
      const errEl = bodyEl.querySelector('#form-err');
      const saveBtn = footEl.querySelector('#form-save');

      const submit = async () => {
        errEl.hidden = true;
        saveBtn.disabled = true;
        try {
          await onSubmit(readForm(form, fields), close);
        } catch (err) {
          errEl.textContent = err.message || String(err);
          errEl.hidden = false;
          // Long forms can push the message off-screen.
          errEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
          saveBtn.disabled = false;
          return;
        }
        saveBtn.disabled = false;
      };

      saveBtn.addEventListener('click', submit);
      footEl.querySelector('[data-cancel]').addEventListener('click', close);
      form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
      // Cmd/Ctrl+Enter saves from anywhere in the form.
      form.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'color') {
          e.preventDefault(); submit();
        }
      });

      const delBtn = footEl.querySelector('#form-delete');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: deleteLabel, message: 'This cannot be undone. Continue?', confirmLabel: 'Delete', danger: true }))) return;
          try {
            await onDelete(close);
          } catch (err) {
            errEl.textContent = err.message || String(err);
            errEl.hidden = false;
          }
        });
      }
    },
  });
}

/** Promise-based confirm that matches the app's styling. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    // Appended to <body>, never into #drawer-root: the drawer underneath keeps
    // its DOM nodes and therefore its event listeners.
    const holder = document.createElement('div');
    holder.innerHTML = `
      <div class="scrim" style="z-index:50"></div>
      <div class="drawer" style="z-index:51;top:50%;bottom:auto;right:50%;transform:translate(50%,-50%);
           width:min(430px,92vw);border:1px solid var(--rule);border-radius:var(--radius);
           box-shadow:0 20px 60px -20px rgba(0,0,0,.5)">
        <header><div class="grow"><h2>${esc(title)}</h2></div></header>
        <div class="scroll" style="padding:18px 22px">${esc(message)}</div>
        <footer>
          <button class="btn ghost" data-no="1">Cancel</button>
          <button class="btn ${danger ? 'danger' : ''}" data-yes="1">${esc(confirmLabel)}</button>
        </footer>
      </div>`;
    document.body.appendChild(holder);
    overlayDepth += 1;

    const done = (val) => {
      holder.remove();
      document.removeEventListener('keydown', onKey);
      overlayDepth -= 1;
      resolve(val);
    };
    // Esc cancels; Enter activates the focused confirm button natively.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(false); }
    };
    document.addEventListener('keydown', onKey);
    holder.querySelector('[data-no]').addEventListener('click', () => done(false));
    holder.querySelector('[data-yes]').addEventListener('click', () => done(true));
    holder.querySelector('.scrim').addEventListener('click', () => done(false));
    holder.querySelector('[data-yes]').focus();
  });
}
