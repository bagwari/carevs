// FHIR R4 projection of an incident.
//
// Answers the "legacy interoperability" challenge (FHIR/HL7-compliant APIs) and
// the assessment slide's note that ABDM and the DPDP Act are the Indian
// equivalents of HL7-plus-HIPAA. ABDM's Health Information Exchange uses FHIR R4,
// so this is the shape an incident would need to take to leave the system.
//
// Falls map to SNOMED CT 1912002 (Fall). The Observation carries the detector
// confidence and the state-machine outcome, and the subject is a pseudonymous
// reference — identity resolution stays with the care provider, not the payload.

const SNOMED = {
  fall: { system: 'http://snomed.info/sct', code: '1912002', display: 'Fall' },
  wandering: { system: 'http://snomed.info/sct', code: '52448006', display: 'Wandering behaviour' },
};

function pseudoRef(incident) {
  return `Patient/carevs-${String(incident.elder?.id ?? 'unknown').replace(/\W/g, '')}`;
}

export function incidentToFhir(incident) {
  const coding = SNOMED[incident.type] ?? SNOMED.fall;
  const confirmed = ['confirmed', 'escalated', 'acknowledged'].includes(incident.status);

  return {
    resourceType: 'Observation',
    id: incident.id,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Observation'],
      source: 'urn:carevs:edge-detector',
    },
    status: incident.resolvedAt ? 'final' : 'preliminary',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'activity',
            display: 'Activity',
          },
        ],
      },
    ],
    code: { coding: [coding], text: incident.explain?.what ?? coding.display },
    subject: { reference: pseudoRef(incident), display: 'Pseudonymised resident reference' },
    effectiveDateTime: incident.createdAt,
    issued: incident.confirmedAt ?? incident.createdAt,
    performer: [{ display: 'CareVS edge detector' }],
    valueCodeableConcept: {
      coding: [
        {
          system: 'urn:carevs:outcome',
          code: confirmed ? 'confirmed' : incident.status,
          display: confirmed ? 'Event confirmed' : `Event ${incident.status}`,
        },
      ],
    },
    component: [
      {
        code: { coding: [{ system: 'urn:carevs:metric', code: 'detector-confidence', display: 'Detector confidence' }] },
        valueQuantity: { value: Number((incident.confidence ?? 0).toFixed(2)), system: 'http://unitsofmeasure.org', code: '1' },
      },
      {
        code: { coding: [{ system: 'urn:carevs:metric', code: 'evidence-frames', display: 'Evidence frames retained' }] },
        valueInteger: incident.evidenceFrames?.length ?? 0,
      },
      {
        code: { coding: [{ system: 'urn:carevs:metric', code: 'location', display: 'Location' }] },
        valueString: incident.room ?? 'Unknown',
      },
    ],
    note: [{ text: incident.explain?.why ?? 'No detector reasoning recorded.' }],
  };
}
