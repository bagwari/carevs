const TYPE_LABEL = {
  fall: 'Fall detection',
  wandering: 'Wandering / perimeter',
  behavioral: 'Behavioral anomaly',
  isolation: 'Social isolation',
};

export function describeIncident(incident) {
  if (incident.view === 'consent_withheld') {
    return {
      title: 'Not shared',
      subtitle: incident.note,
      location: '—',
      status: 'withheld',
      type: 'consent',
    };
  }
  if (incident.view === 'masked_summary') {
    return {
      title: TYPE_LABEL[incident.type] ?? 'Event',
      subtitle: incident.summary,
      location: incident.room,
      status: incident.status,
      type: incident.type,
    };
  }
  if (incident.view === 'system_only') {
    return {
      title: incident.detector ?? TYPE_LABEL[incident.type] ?? 'Event',
      subtitle: `${incident.residentRef} · confidence ${(incident.confidenceScore * 100).toFixed(0)}% · ${incident.deviceId}`,
      location: incident.deviceId,
      status: incident.status,
      type: incident.type,
    };
  }
  // full (caregiver)
  return {
    title: incident.explain?.what ?? TYPE_LABEL[incident.type] ?? 'Event',
    subtitle: incident.explain?.why ?? '',
    location: incident.room,
    status: incident.status,
    type: incident.type,
  };
}

export function isActiveAlert(incident) {
  if (incident.view === 'consent_withheld') return false;
  // Isolation is a standing concern, not an emergency — it stays visible until
  // someone acts on it, but never as a red alarm.
  if (incident.type === 'isolation') return incident.status === 'confirmed';
  if (incident.type === 'wandering') {
    return incident.status === 'confirmed';
  }
  return ['candidate', 'suspected', 'confirmed'].includes(incident.status);
}

export function isUnresolved(incident) {
  return !['dismissed', 'resolved', 'acknowledged', 'escalated', 'logged'].includes(incident.status);
}
