// Rule-based incident-change correlation.
// An incident is a *candidate* related to a change when:
//   1. same application, AND
//   2. same module (strong match) -- module mismatch is excluded to avoid unrelated matches, AND
//   3. incident opened inside [implemented_at, implemented_at + window].
// This indicates temporal/system proximity, not proven causation.
const db = require('./db');

const WINDOW_HOURS = Number(process.env.CORRELATION_WINDOW_HOURS || 72);

// Link all matching incidents to one change. Returns newly created links.
async function correlateChange(changeId, linkedBy = null) {
  const { rows } = await db.query(
    `INSERT INTO change_incident_links (change_id, incident_id, link_source, match_reason, linked_by)
     SELECT c.id, i.id, 'Auto',
            'Same application/module; incident opened ' ||
            ROUND(EXTRACT(EPOCH FROM (i.opened_at - c.implemented_at))/3600.0, 1) ||
            'h after implementation (window ${WINDOW_HOURS}h)',
            $2
     FROM change_requests c
     JOIN incidents i
       ON i.application = c.application
      AND i.module = c.module
      AND i.opened_at >= c.implemented_at
      AND i.opened_at <= c.implemented_at + ($3 || ' hours')::interval
     WHERE c.id = $1 AND c.implemented_at IS NOT NULL
     ON CONFLICT (change_id, incident_id) DO NOTHING
     RETURNING incident_id`,
    [changeId, linkedBy, String(WINDOW_HOURS)]
  );
  return rows;
}

// When a new incident is logged, link it to any recently implemented matching changes.
async function correlateIncident(incidentId, linkedBy = null) {
  const { rows } = await db.query(
    `INSERT INTO change_incident_links (change_id, incident_id, link_source, match_reason, linked_by)
     SELECT c.id, i.id, 'Auto',
            'Same application/module; incident opened ' ||
            ROUND(EXTRACT(EPOCH FROM (i.opened_at - c.implemented_at))/3600.0, 1) ||
            'h after implementation (window ${WINDOW_HOURS}h)',
            $2
     FROM incidents i
     JOIN change_requests c
       ON c.application = i.application
      AND c.module = i.module
      AND c.implemented_at IS NOT NULL
      AND i.opened_at >= c.implemented_at
      AND i.opened_at <= c.implemented_at + ($3 || ' hours')::interval
     WHERE i.id = $1
     ON CONFLICT (change_id, incident_id) DO NOTHING
     RETURNING change_id`,
    [incidentId, linkedBy, String(WINDOW_HOURS)]
  );
  return rows;
}

module.exports = { correlateChange, correlateIncident, WINDOW_HOURS };
