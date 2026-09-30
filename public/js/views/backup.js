import { api } from '../api.js';
import { toast, toastError, confirmDialog, todayStr } from '../ui.js';
import { figure } from './components.js';

export default async function backupView({ refresh }) {
  const dash = await api.dashboard();

  const content = `
    <div class="pagehead">
      <div class="grow">
        <h1>Backup &amp; settings</h1>
        <div class="deck">Everything lives in one SQLite file on this machine. Nothing leaves it.</div>
      </div>
    </div>

    <div class="grid c4" style="margin:16px 0">
      ${figure(dash.counts.teams, 'teams')}
      ${figure(dash.counts.members, 'students')}
      ${figure(dash.counts.meetings, 'meetings logged')}
      ${figure(dash.counts.open_tasks, 'open tasks')}
    </div>

    <div class="grid c2" style="align-items:start">
      <div class="card">
        <div class="cardhead"><h2>Export</h2></div>
        <p class="muted" style="font-size:.86rem">
          A single JSON file with every team, student, meeting, task, milestone and note.
          Keep one at the end of each week — it restores the whole workspace.
        </p>
        <div class="actions" style="margin-top:12px">
          <button class="btn" id="bk-export">Download backup .json</button>
          <button class="btn ghost" id="bk-copy">Copy to clipboard</button>
        </div>
      </div>

      <div class="card">
        <div class="cardhead"><h2>Restore</h2></div>
        <p class="muted" style="font-size:.86rem">
          Load a backup file. <b>Replace</b> wipes what is here first;
          <b>merge</b> adds everything in the file alongside your current data.
        </p>
        <label class="field" style="margin-top:12px">
          <span>Mode</span>
          <select id="bk-mode">
            <option value="replace">Replace everything</option>
            <option value="merge">Merge into what's here</option>
          </select>
        </label>
        <input type="file" id="bk-file" accept="application/json,.json" style="font-size:.85rem" />
        <div class="notice" style="margin-top:12px">
          Export first. A replace cannot be undone.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Where your data lives</h2></div>
      <dl class="kv">
        <dt>Storage</dt><dd><code>data/tracker.db</code> — a SQLite file in the project folder.</dd>
        <dt>Server</dt><dd>Node's built-in HTTP server on <code>127.0.0.1</code>, reachable only from this machine.</dd>
        <dt>Network</dt><dd>No account, no sync, no telemetry. The only outbound request is the web font.</dd>
        <dt>To back up</dt><dd>Copy <code>data/tracker.db</code>, or use the JSON export above.</dd>
      </dl>
    </div>

    <div class="card">
      <div class="cardhead"><h2>Danger zone</h2></div>
      <p class="muted" style="font-size:.86rem">Delete every team, meeting, task and note. Export first.</p>
      <button class="btn danger" id="bk-wipe" style="margin-top:10px">Erase all data</button>
    </div>`;

  return {
    content,
    mount(root) {
      root.querySelector('#bk-export').addEventListener('click', async () => {
        try {
          const data = await api.exportAll();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `project-tracker-${todayStr()}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
          toast('Backup downloaded');
        } catch (err) {
          toastError(err);
        }
      });

      root.querySelector('#bk-copy').addEventListener('click', async () => {
        try {
          const data = await api.exportAll();
          await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
          toast('Backup copied to clipboard');
        } catch (err) {
          toastError(err);
        }
      });

      root.querySelector('#bk-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const mode = root.querySelector('#bk-mode').value;
        const ok = await confirmDialog({
          title: mode === 'replace' ? 'Replace everything?' : 'Merge this backup?',
          message: mode === 'replace'
            ? `“${file.name}” will replace all current data. This cannot be undone.`
            : `“${file.name}” will be added alongside your current data.`,
          confirmLabel: mode === 'replace' ? 'Replace' : 'Merge',
          danger: mode === 'replace',
        });
        e.target.value = '';
        if (!ok) return;
        try {
          const payload = JSON.parse(await file.text());
          await api.importAll(payload, mode);
          toast('Backup restored');
          await refresh();
        } catch (err) {
          toastError(err);
        }
      });

      root.querySelector('#bk-wipe').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Erase everything?',
          message: 'Every team, student, meeting, task, milestone and note will be deleted permanently.',
          confirmLabel: 'Erase it all',
          danger: true,
        });
        if (!ok) return;
        try {
          await api.importAll({ format: 'ta-project-tracker', version: 1, teams: [] }, 'replace');
          toast('All data erased');
          await refresh();
        } catch (err) {
          toastError(err);
        }
      });
    },
  };
}
