// Central privacy control: masking and role-based access enforced in one place,
// mirroring the "PII masking layer" node in the solution architecture.
//
// Consent is enforced here too, so withdrawing a DPDP purpose actually changes
// what leaves the server rather than only hiding it in the interface.

import { hasConsent } from './consent.js';

function plainLanguageStatus(incident) {
  if (incident.type === 'fall') {
    if (incident.status === 'confirmed') return 'A possible fall was detected and the caregiver was notified.';
    if (incident.status === 'suspected') return 'A possible event is being verified.';
    if (incident.status === 'acknowledged') return 'The caregiver has acknowledged and is checking in.';
    if (incident.status === 'escalated') return 'The caregiver has escalated this for further help.';
    if (incident.status === 'dismissed') return 'Reviewed by the caregiver — no action needed.';
    if (incident.resolution === 'auto_reset') return 'A possible event was reviewed automatically — no fall occurred.';
    return 'An event was reviewed.';
  }
  if (incident.type === 'wandering') {
    return incident.context?.supervised
      ? 'A supervised movement was logged near the front door.'
      : 'An unsupervised exit was detected and the caregiver was notified.';
  }
  if (incident.type === 'isolation') {
    if (incident.status === 'dismissed') return 'Reviewed by the caregiver — no action needed.';
    if (['acknowledged', 'escalated'].includes(incident.status)) {
      return 'The caregiver has noticed she has had few visitors lately and is arranging for someone to check in.';
    }
    return `It has been ${incident.context?.daysSinceVisitor ?? 'several'} days since anyone visited. A call or a visit this week would help.`;
  }
  return 'An event was recorded.';
}

function pseudonymize(elder) {
  return `Resident #${String(elder.id).replace(/\D/g, '') || '1042'}`;
}

export function maskIncidentForRole(incident, role) {
  if (!incident) return null;

  // Purpose limitation: an incident produced for a purpose the data principal
  // has withdrawn is not released at all.
  if (incident.type === 'wandering' && !hasConsent('perimeter')) return null;
  if (incident.type === 'isolation' && !hasConsent('social_wellbeing')) return null;

  if (role === 'caregiver') {
    return {
      view: 'full',
      role,
      ...incident,
    };
  }

  if (role === 'family') {
    // Family sharing is a separate, withdrawable purpose.
    if (!hasConsent('family_sharing')) {
      return {
        view: 'consent_withheld',
        role,
        id: incident.id,
        note: 'Family updates are switched off. Kamala withdrew consent for this purpose under the DPDP Act.',
      };
    }
    return {
      view: 'masked_summary',
      role,
      id: incident.id,
      type: incident.type,
      status: incident.status,
      room: incident.room,
      elderName: incident.elder.name,
      createdAt: incident.createdAt,
      resolvedAt: incident.resolvedAt,
      summary: plainLanguageStatus(incident),
      handledBy: 'Primary caregiver',
      evidenceFrameCount: incident.evidenceFrames?.length ?? 0,
      evidenceAvailable: false,
      note: 'Detailed evidence and confidence scores are visible only to the caregiver, per privacy policy.',
    };
  }

  if (role === 'admin') {
    return {
      view: 'system_only',
      role,
      id: incident.id,
      detector: incident.detector,
      type: incident.type,
      status: incident.status,
      confidenceScore: incident.confidence,
      deviceId: incident.room === 'Bedroom' ? 'edge-node-02' : incident.room === 'Front door' ? 'edge-node-03' : 'edge-node-01',
      residentRef: pseudonymize(incident.elder),
      createdAt: incident.createdAt,
      stage: incident.stage,
      evidenceFrameCount: incident.evidenceFrames?.length ?? 0,
      evidenceAvailable: false,
      elderNameMasked: true,
      note: 'Admin access is scoped to system configuration and detector health — resident identity and evidence are masked.',
    };
  }

  return null;
}

export function maskListForRole(incidents, role) {
  return incidents.map((incident) => maskIncidentForRole(incident, role)).filter(Boolean);
}
