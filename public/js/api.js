async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const msg = data && data.error ? data.error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

const qs = (params = {}) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

const crud = (name) => ({
  list: (params) => req('GET', `/api/${name}${qs(params)}`),
  get: (id) => req('GET', `/api/${name}/${id}`),
  create: (body) => req('POST', `/api/${name}`, body),
  update: (id, body) => req('PUT', `/api/${name}/${id}`, body),
  remove: (id) => req('DELETE', `/api/${name}/${id}`),
});

export const api = {
  dashboard: () => req('GET', '/api/dashboard'),
  search: (q) => req('GET', `/api/search${qs({ q })}`),
  meta: () => req('GET', '/api/meta'),

  teams: {
    ...crud('teams'),
    full: (id) => req('GET', `/api/teams/${id}/full`),
    prep: (id) => req('GET', `/api/teams/${id}/prep`),
    reportUrl: (id) => `/api/teams/${id}/report`,
    report: async (id) => {
      const res = await fetch(`/api/teams/${id}/report`);
      if (!res.ok) throw new Error(`Report failed (${res.status})`);
      return res.text();
    },
  },
  members: crud('members'),
  meetings: crud('meetings'),
  tasks: crud('tasks'),
  milestones: crud('milestones'),
  notes: crud('notes'),

  exportAll: () => req('GET', '/api/export'),
  importAll: (payload, mode = 'replace') => req('POST', '/api/import', { payload, mode }),
};
