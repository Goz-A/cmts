// Integration tests: run the real Express app against the (seeded) development database.
// Usage: npm test   (requires `npm run seed` first)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/server');
const db = require('../src/db');
const { scoreChange } = require('../src/risk');
const workflow = require('../src/workflow');

let server, base;
const tokens = {};
before(async () => {
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
  for (const [k, e] of [['eng', 'engineer1@cmts.local'], ['eng2', 'engineer2@cmts.local'], ['rev', 'reviewer1@cmts.local'], ['app', 'approver1@cmts.local'], ['admin', 'admin@cmts.local']])
    tokens[k] = (await call('POST', '/auth/login', null, { email: e, password: 'Password123!' })).body.token;
});
after(async () => { server.close(); await db.pool.end(); });

async function call(method, path, who, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(who && { authorization: `Bearer ${tokens[who]}` }) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
}
const draft = (over = {}) => ({ title: 'Test change', description: 'd', reason: 'r', category: 'Batch Job', application: 'Finacle Core Banking',
  module: 'EOD Batch', environment: 'Production', affects_batch: true, tested: false, ...over });
async function newChange(over) { const r = await call('POST', '/changes', 'eng', draft(over)); assert.equal(r.status, 201); return r.body.id; }
async function toApproved(id, comment = 'ok') {
  assert.equal((await call('POST', `/changes/${id}/submit`, 'eng', {})).status, 200);
  assert.equal((await call('POST', `/changes/${id}/review`, 'rev', { decision: 'Recommended' })).status, 200);
  assert.equal((await call('POST', `/changes/${id}/decide`, 'app', { decision: 'Approved', comment })).status, 200);
}

// ---------- authentication ----------
test('AUTH-01 valid login returns a JWT and user', async () => {
  const r = await call('POST', '/auth/login', null, { email: 'admin@cmts.local', password: 'Password123!' });
  assert.equal(r.status, 200); assert.ok(r.body.token); assert.equal(r.body.user.role, 'Administrator');
});
test('AUTH-02 wrong password is rejected', async () => {
  assert.equal((await call('POST', '/auth/login', null, { email: 'admin@cmts.local', password: 'wrong' })).status, 401);
});
test('AUTH-03 protected route without a token is rejected', async () => {
  assert.equal((await call('GET', '/changes', null)).status, 401);
});
test('AUTH-04 security headers are set (helmet)', async () => {
  const r = await call('GET', '/health', null); assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

// ---------- RBAC ----------
test('RBAC-01 only Support Engineers can create changes', async () => {
  for (const who of ['rev', 'app', 'admin']) assert.equal((await call('POST', '/changes', who, draft())).status, 403, who);
});
test('RBAC-02 only Administrators can manage users', async () => {
  assert.equal((await call('POST', '/users', 'eng', { full_name: 'X', email: 'x@y.z', password: 'Password123!', role: 'Reviewer' })).status, 403);
  assert.equal((await call('PUT', '/users/1', 'app', { active: false })).status, 403);
});
test('RBAC-03 Administrator cannot act in the approval workflow', async () => {
  const id = await newChange(); await call('POST', `/changes/${id}/submit`, 'eng', {});
  assert.equal((await call('POST', `/changes/${id}/review`, 'admin', { decision: 'Recommended' })).status, 403);
});
test('RBAC-04 engineer cannot approve; reviewer cannot approve', async () => {
  const id = await newChange(); await call('POST', `/changes/${id}/submit`, 'eng', {});
  await call('POST', `/changes/${id}/review`, 'rev', { decision: 'Recommended' });
  assert.equal((await call('POST', `/changes/${id}/decide`, 'eng', { decision: 'Approved', comment: 'x' })).status, 403);
  assert.equal((await call('POST', `/changes/${id}/decide`, 'rev', { decision: 'Approved', comment: 'x' })).status, 403);
});
test('RBAC-05 segregation of duties: a requester cannot review their own change', async () => {
  const id = await newChange(); await call('POST', `/changes/${id}/submit`, 'eng', {});
  const me = (await call('GET', '/auth/me', 'eng')).body.id;
  await db.query(`UPDATE users SET role_id = (SELECT id FROM roles WHERE name='Reviewer') WHERE id=$1`, [me]);
  try {
    tokens.promoted = (await call('POST', '/auth/login', null, { email: 'engineer1@cmts.local', password: 'Password123!' })).body.token;
    const r = await call('POST', `/changes/${id}/review`, 'promoted', { decision: 'Recommended' });
    assert.equal(r.status, 403); assert.match(r.body.error, /Segregation of duties/);
  } finally { await db.query(`UPDATE users SET role_id = (SELECT id FROM roles WHERE name='Support Engineer') WHERE id=$1`, [me]); }
});

// ---------- workflow ----------
test('WF-01 full lifecycle Draft→Submitted→Under Review→Approved→Monitoring→Closed with audit trail', async () => {
  const id = await newChange();
  await toApproved(id, 'CAB approved');
  assert.equal((await call('POST', `/changes/${id}/implement`, 'eng', { outcome: 'Successful' })).status, 200);
  assert.equal((await call('GET', `/changes/${id}`, 'eng')).body.status, 'Monitoring');
  assert.equal((await call('POST', `/changes/${id}/close`, 'eng', {})).status, 200);
  const c = (await call('GET', `/changes/${id}`, 'eng')).body;
  assert.equal(c.status, 'Closed'); assert.equal(c.approvals.length, 2); assert.ok(c.history.length >= 7);
});
test('WF-02 high-risk change requires a CAB comment to approve', async () => {
  const id = await newChange(); assert.equal((await call('GET', `/changes/${id}`, 'eng')).body.requires_cab, true);
  await call('POST', `/changes/${id}/submit`, 'eng', {}); await call('POST', `/changes/${id}/review`, 'rev', { decision: 'Recommended' });
  assert.equal((await call('POST', `/changes/${id}/decide`, 'app', { decision: 'Approved' })).status, 400);
  assert.equal((await call('POST', `/changes/${id}/decide`, 'app', { decision: 'Approved', comment: 'CAB ok' })).status, 200);
});
test('WF-03 rejection and return require a comment; rejection is final', async () => {
  const id = await newChange({ category: 'Parameter', environment: 'UAT', tested: true, rollback_plan: 'restore' });
  await call('POST', `/changes/${id}/submit`, 'eng', {}); await call('POST', `/changes/${id}/review`, 'rev', { decision: 'Recommended' });
  assert.equal((await call('POST', `/changes/${id}/decide`, 'app', { decision: 'Rejected' })).status, 400);
  assert.equal((await call('POST', `/changes/${id}/decide`, 'app', { decision: 'Rejected', comment: 'No' })).status, 200);
  assert.equal((await call('POST', `/changes/${id}/submit`, 'eng', {})).status, 409);
});
test('WF-04 returned change can be edited and resubmitted', async () => {
  const id = await newChange(); await call('POST', `/changes/${id}/submit`, 'eng', {});
  assert.equal((await call('POST', `/changes/${id}/review`, 'rev', { decision: 'Returned' })).status, 400); // comment required
  assert.equal((await call('POST', `/changes/${id}/review`, 'rev', { decision: 'Returned', comment: 'Add rollback' })).status, 200);
  assert.equal((await call('PUT', `/changes/${id}`, 'eng', { rollback_plan: 'Restore backup', tested: true })).status, 200);
  assert.equal((await call('POST', `/changes/${id}/submit`, 'eng', {})).status, 200);
});
test('WF-05 transitions out of order are refused', async () => {
  const id = await newChange();
  assert.equal((await call('POST', `/changes/${id}/implement`, 'eng', { outcome: 'Successful' })).status, 409);
  assert.equal((await call('POST', `/changes/${id}/close`, 'eng', {})).status, 409);
  await call('POST', `/changes/${id}/submit`, 'eng', {});
  assert.equal((await call('PUT', `/changes/${id}`, 'eng', { title: 'edited after submit' })).status, 409);
});
test('WF-06 only the requester can edit/submit their draft', async () => {
  const id = await newChange();
  assert.equal((await call('POST', `/changes/${id}/submit`, 'eng2', {})).status, 403);
  assert.equal((await call('PUT', `/changes/${id}`, 'eng2', { title: 'hijack' })).status, 403);
});
test('WF-07 server tells the UI which actions are allowed', async () => {
  const id = await newChange();
  assert.ok((await call('GET', `/changes/${id}`, 'eng')).body.allowed_actions.includes('submit'));
  assert.deepEqual((await call('GET', `/changes/${id}`, 'rev')).body.allowed_actions, []);
});
test('WF-08 workflow definition is exposed and consistent', async () => {
  const d = (await call('GET', '/changes/workflow', 'eng')).body;
  assert.ok(d.find((t) => t.action === 'decide').segregation_of_duties); assert.equal(d.length, workflow.definition().length);
});
test('WF-09 mandatory fields are validated', async () => {
  assert.equal((await call('POST', '/changes', 'eng', { title: 'x' })).status, 400);
});

// ---------- risk scoring ----------
test('RISK-01 rule-based scoring is deterministic and explainable', () => {
  const hi = scoreChange({ category: 'Database', environment: 'Production', tested: false, rollback_plan: '', affects_batch: true, change_type: 'Emergency' });
  assert.equal(hi.level, 'High'); assert.equal(hi.requiresCab, true); assert.ok(hi.factors.length >= 5);
  const lo = scoreChange({ category: 'Parameter', environment: 'Development', tested: true, rollback_plan: 'restore', affects_batch: false, change_type: 'Standard' });
  assert.equal(lo.level, 'Low'); assert.equal(lo.score, 10);
});

// ---------- incident–change correlation ----------
test('COR-01 incident on same application/module within the window is auto-linked; others are not', async () => {
  const id = await newChange({ module: 'Treasury' }); await toApproved(id);
  const implAt = new Date(Date.now() - 24 * 3600e3).toISOString();
  await call('POST', `/changes/${id}/implement`, 'eng', { outcome: 'Successful', implemented_at: implAt });
  const mk = (module, hoursAfter) => call('POST', '/incidents', 'eng', { title: `corr ${module}`, application: 'Finacle Core Banking', module, priority: 'P2',
    opened_at: new Date(new Date(implAt).getTime() + hoursAfter * 3600e3).toISOString() });
  const same = await mk('Treasury', 5), otherModule = await mk('CASA', 5), before = await mk('Treasury', -3), late = await mk('Treasury', 100);
  assert.equal(same.body.auto_linked >= 1, true);
  const linked = (await call('GET', `/changes/${id}`, 'eng')).body.incidents.map((i) => i.id);
  assert.ok(linked.includes(same.body.id));
  assert.ok(!linked.includes(otherModule.body.id), 'different module must not link');
  assert.ok(!linked.includes(before.body.id), 'incident before implementation must not link');
  assert.ok(!linked.includes(late.body.id), 'incident outside the 72h window must not link');
});
test('COR-02 incidents can be linked and unlinked manually, and are labelled as Manual', async () => {
  const id = await newChange({ module: 'Loans' }); await toApproved(id);
  const implAt = new Date(Date.now() - 6 * 3600e3).toISOString();
  const inc = await call('POST', '/incidents', 'eng', { title: 'manual link target', application: 'Finacle Internet Banking', module: 'Transfers', priority: 'P3' });
  assert.equal((await call('POST', `/changes/${id}/implement`, 'eng', { outcome: 'Failed', implemented_at: implAt })).status, 200);
  assert.equal((await call('POST', '/incidents/link', 'rev', { change_id: id, incident_id: inc.body.id })).status, 200);
  let c = (await call('GET', `/changes/${id}`, 'eng')).body; const l = c.incidents.find((i) => i.id === inc.body.id);
  assert.equal(l.link_source, 'Manual');
  assert.equal((await call('DELETE', `/incidents/link/${l.link_id}`, 'rev')).status, 200);
});
test('COR-03 Administrator cannot log incidents', async () => {
  assert.equal((await call('POST', '/incidents', 'admin', { title: 'x', application: 'a', module: 'b', priority: 'P3' })).status, 403);
});

// ---------- analytics ----------
test('AN-01 analytics summary is consistent', async () => {
  const a = (await call('GET', '/analytics/summary', 'app')).body;
  assert.equal(a.changeFailureRate.failed, a.changeFailureRate.direct + a.changeFailureRate.incidentOnly);
  assert.ok(a.changeFailureRate.percent >= a.changeFailureRate.directPercent);
  assert.equal(a.byStatus.reduce((s, r) => s + r.value, 0), a.totals.total);
});

// ---------- user management ----------
test('USR-01 admin creates a user; duplicate email refused; weak password refused', async () => {
  const email = `t${Date.now()}@cmts.local`;
  assert.equal((await call('POST', '/users', 'admin', { full_name: 'T', email, password: 'Password123!', role: 'Reviewer' })).status, 201);
  assert.equal((await call('POST', '/users', 'admin', { full_name: 'T', email, password: 'Password123!', role: 'Reviewer' })).status, 409);
  assert.equal((await call('POST', '/users', 'admin', { full_name: 'T', email: 'z@z.z', password: 'short', role: 'Reviewer' })).status, 400);
  await db.query('DELETE FROM users WHERE email = $1', [email]);
});
