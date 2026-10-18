import { getCurrentRole } from './roleStore';

async function request(path, { method = 'GET', body } = {}) {
  const role = getCurrentRole();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { 'x-carevs-role': role } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  login: (role) => request('/auth/login', { method: 'POST', body: { role } }),
  listUsers: () => request('/auth/users'),
  listIncidents: () => request('/incidents'),
  getIncident: (id) => request(`/incidents/${id}`),
  actOnIncident: (id, action) => request(`/incidents/${id}/action`, { method: 'POST', body: { action } }),
  getTrend: (elderId) => request(`/trends/${elderId}`),
  getZones: () => request('/zones'),
  getDeviceStatus: () => request('/device-status'),
  triggerFall: (outcome = 'confirmed') => request('/director/trigger-fall', { method: 'POST', body: { outcome } }),
  triggerZoneCrossing: (supervised) =>
    request('/director/trigger-zone-crossing', { method: 'POST', body: { supervised } }),
  triggerIsolation: () => request('/director/trigger-isolation', { method: 'POST' }),
  resetDemo: () => request('/director/reset', { method: 'POST' }),
  startVoice: (id) => request(`/incidents/${id}/voice/start`, { method: 'POST' }),
  endVoice: (id, seconds) => request(`/incidents/${id}/voice/end`, { method: 'POST', body: { seconds } }),
  startLiveFall: (payload) => request('/cv/fall/start', { method: 'POST', body: payload }),
  advanceLiveFall: (id, payload) => request(`/cv/fall/${id}/advance`, { method: 'POST', body: payload }),

  // Governance — DPDP consent, audit trail, adoption instrumentation
  getConsent: () => request('/governance/consent'),
  setConsent: (purposeId, granted) =>
    request('/governance/consent', { method: 'POST', body: { purposeId, granted } }),
  getAudit: () => request('/governance/audit'),
  getAdoptionMetrics: () => request('/governance/metrics/adoption'),
  probeValidator: (text) => request('/governance/validator/probe', { method: 'POST', body: { text } }),
  getFhir: (id) => request(`/incidents/${id}/fhir`),
};
