// Declarative approval-workflow definition: the single source of truth for
// which status transitions exist, who may perform them and which rules apply.
// The routes call validate(); the UI is told allowedActions() so it never has to guess.
const OUTCOMES = ['Successful', 'Failed', 'Rolled Back'];
const mine = (c, u) => c.requester_id === u.id;
const notMine = (c, u) => !mine(c, u) || 'Segregation of duties: you cannot review or approve your own change';
const onlyMine = (c, u) => mine(c, u) || 'Only the requester can do this';

const TRANSITIONS = {
  edit:      { from: ['Draft', 'Returned'], roles: ['Support Engineer'], guard: onlyMine, internal: true },
  submit:    { from: ['Draft', 'Returned'], roles: ['Support Engineer'], guard: onlyMine, to: () => 'Submitted' },
  review:    { from: ['Submitted'], roles: ['Reviewer'], guard: notMine,
               decisions: { Recommended: 'Under Review', Returned: 'Returned' },
               comment: (c, d) => (d === 'Returned' ? 'A comment is required when returning a change' : null) },
  decide:    { from: ['Under Review'], roles: ['Approver'], guard: notMine,
               decisions: { Approved: 'Approved', Rejected: 'Rejected', Returned: 'Returned' },
               comment: (c, d) => (d !== 'Approved' ? 'A comment is required'
                 : c.requires_cab ? 'High-risk change: record the CAB outcome/conditions in the comment' : null) },
  implement: { from: ['Approved'], roles: ['Support Engineer'], to: () => 'Monitoring',
               input: (b) => (OUTCOMES.includes(b.outcome) ? null : "outcome must be 'Successful', 'Failed' or 'Rolled Back'") },
  correlate: { from: ['Monitoring'], roles: ['Support Engineer', 'Approver'], internal: true },
  close:     { from: ['Monitoring'], roles: ['Support Engineer', 'Approver'], to: () => 'Closed' },
};

const fail = (code, error) => ({ code, error });

function validate(change, action, user, body = {}) {
  const t = TRANSITIONS[action];
  if (!t) return fail(404, `Unknown action '${action}'`);
  if (!t.roles.includes(user.role)) return fail(403, `Role '${user.role}' cannot perform '${action}' (requires ${t.roles.join(' or ')})`);
  if (!t.from.includes(change.status)) return fail(409, `Cannot ${action} a change in status '${change.status}'`);
  const g = t.guard && t.guard(change, user);
  if (g !== undefined && g !== true) return fail(403, g);
  let to = t.to ? t.to(change) : change.status;
  if (t.decisions) {
    to = t.decisions[body.decision];
    if (!to) return fail(400, `decision must be one of: ${Object.keys(t.decisions).join(', ')}`);
    const c = t.comment && t.comment(change, body.decision);
    if (c && !String(body.comment || '').trim()) return fail(400, c);
  }
  const bad = t.input && t.input(body);
  if (bad) return fail(400, bad);
  return { ok: true, to };
}

function allowedActions(change, user) {
  return Object.entries(TRANSITIONS)
    .filter(([, t]) => t.roles.includes(user.role) && t.from.includes(change.status) && (!t.guard || t.guard(change, user) === true))
    .map(([k]) => k);
}

// Serialisable view (used by GET /api/changes/workflow and for the Chapter 4 table/diagram)
const definition = () => Object.entries(TRANSITIONS).map(([action, t]) => ({
  action, from: t.from, roles: t.roles, outcomes: t.decisions ? t.decisions : t.to ? { [action]: t.to({}) } : null,
  segregation_of_duties: t.guard === notMine,
}));

module.exports = { validate, allowedActions, definition, OUTCOMES };
