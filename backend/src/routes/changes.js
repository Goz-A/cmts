const router = require('express').Router();
const db = require('../db');
const { authenticate, requireRole } = require('../auth');
const { scoreChange } = require('../risk');
const { correlateChange } = require('../correlation');
const workflow = require('../workflow');

router.use(authenticate);

const EDITABLE = ['category', 'change_type', 'title', 'description', 'reason', 'application', 'module',
  'bank_instance', 'environment', 'implementation_plan', 'rollback_plan', 'tested', 'affects_batch',
  'planned_start', 'planned_end'];
const REQUIRED = ['title', 'description', 'reason', 'category', 'application', 'module', 'environment'];

// ---------- helpers ----------
async function history(client, changeId, actorId, action, from, to, comment) {
  await client.query(
    `INSERT INTO change_history (change_id, actor_id, action, from_status, to_status, comment)
     VALUES ($1,$2,$3,$4,$5,$6)`, [changeId, actorId, action, from, to, comment || null]);
}

async function notifyRoles(client, roleNames, changeId, message, excludeUserId) {
  await client.query(
    `INSERT INTO notifications (user_id, change_id, message)
     SELECT u.id, $2, $3 FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.name = ANY($1) AND u.active AND u.id <> COALESCE($4, -1)`,
    [roleNames, changeId, message, excludeUserId || null]);
}

async function notifyUser(client, userId, changeId, message) {
  await client.query(`INSERT INTO notifications (user_id, change_id, message) VALUES ($1,$2,$3)`,
    [userId, changeId, message]);
}

function validate(body) {
  const missing = REQUIRED.filter((f) => !body[f] || !String(body[f]).trim());
  return missing.length ? `Missing required fields: ${missing.join(', ')}` : null;
}

const BASE_SELECT = `
  SELECT c.*, u.full_name AS requester_name,
    (SELECT COUNT(*) FROM change_incident_links l WHERE l.change_id = c.id)::int AS incident_count
  FROM change_requests c JOIN users u ON u.id = c.requester_id`;

// ---------- workflow definition (for documentation / UI) ----------
router.get('/workflow', (_req, res) => res.json(workflow.definition()));

// ---------- live risk preview (used by the form; same rules as on save) ----------
router.post('/risk-preview', (req, res) => {
  const r = scoreChange(req.body || {});
  res.json({ score: r.score, level: r.level, factors: r.factors, requires_cab: r.requiresCab });
});

// ---------- list with search / filter ----------
router.get('/', async (req, res) => {
  const { q, status, application, environment, category, risk_level, requester_id, change_type, from, to } = req.query;
  const where = []; const p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (q) {
    p.push(`%${q}%`);
    const n = `$${p.length}`;
    where.push(`(c.title ILIKE ${n} OR c.ref ILIKE ${n} OR c.description ILIKE ${n})`);
  }
  if (status) add('c.status = ?', status);
  if (application) add('c.application = ?', application);
  if (environment) add('c.environment = ?', environment);
  if (category) add('c.category = ?', category);
  if (risk_level) add('c.risk_level = ?', risk_level);
  if (requester_id) add('c.requester_id = ?', requester_id);
  if (change_type) add('c.change_type = ?', change_type);
  if (from) add('c.created_at >= ?', from);
  if (to) add('c.created_at < (?::date + 1)', to);
  const sql = `${BASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.created_at DESC LIMIT 500`;
  const { rows } = await db.query(sql, p);
  res.json(rows);
});

// ---------- detail ----------
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(`${BASE_SELECT} WHERE c.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Change not found' });
  const id = rows[0].id;
  const [hist, appr, inc] = await Promise.all([
    db.query(`SELECT h.*, u.full_name AS actor_name FROM change_history h
              LEFT JOIN users u ON u.id = h.actor_id WHERE h.change_id = $1 ORDER BY h.created_at, h.id`, [id]),
    db.query(`SELECT a.*, u.full_name AS approver_name FROM approvals a
              JOIN users u ON u.id = a.approver_id WHERE a.change_id = $1 ORDER BY a.decided_at`, [id]),
    db.query(`SELECT i.*, l.link_source, l.match_reason, l.id AS link_id FROM change_incident_links l
              JOIN incidents i ON i.id = l.incident_id WHERE l.change_id = $1 ORDER BY i.opened_at`, [id]),
  ]);
  res.json({ ...rows[0], history: hist.rows, approvals: appr.rows, incidents: inc.rows, allowed_actions: workflow.allowedActions(rows[0], req.user) });
});

// ---------- create (Draft) ----------
router.post('/', requireRole('Support Engineer'), async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const r = scoreChange(b);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO change_requests
       (title, description, reason, category, change_type, application, module, bank_instance, environment,
        implementation_plan, rollback_plan, tested, affects_batch, planned_start, planned_end,
        risk_score, risk_level, risk_factors, requires_cab, requester_id)
       VALUES ($1,$2,$3,$4,COALESCE($5,'Normal'),$6,$7,$8,$9,$10,$11,COALESCE($12,false),COALESCE($13,false),$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,
      [b.title, b.description, b.reason, b.category, b.change_type, b.application, b.module, b.bank_instance,
        b.environment, b.implementation_plan, b.rollback_plan, b.tested, b.affects_batch,
        b.planned_start || null, b.planned_end || null, r.score, r.level, JSON.stringify(r.factors),
        r.requiresCab, req.user.id]);
    const id = ins.rows[0].id;
    await client.query(`UPDATE change_requests SET ref = 'CHG-' || LPAD(id::text, 4, '0') WHERE id = $1`, [id]);
    await history(client, id, req.user.id, 'Created', null, 'Draft', null);
    await client.query('COMMIT');
    res.status(201).json({ id });
  } catch (e) {
    await client.query('ROLLBACK'); res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

// ---------- update (only Draft/Returned, only by requester) ----------
router.put('/:id', requireRole('Support Engineer'), async (req, res) => {
  const cur = (await db.query('SELECT * FROM change_requests WHERE id = $1', [req.params.id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'Change not found' });
  const v = workflow.validate(cur, 'edit', req.user, req.body);
  if (v.error) return res.status(v.code).json({ error: v.error });

  const merged = { ...cur };
  for (const f of EDITABLE) if (f in req.body) merged[f] = req.body[f];
  const err = validate(merged);
  if (err) return res.status(400).json({ error: err });
  const r = scoreChange(merged);
  await db.query(
    `UPDATE change_requests SET title=$1, description=$2, reason=$3, category=$4, change_type=$5, application=$6,
       module=$7, bank_instance=$8, environment=$9, implementation_plan=$10, rollback_plan=$11, tested=$12,
       affects_batch=$13, planned_start=$14, planned_end=$15, risk_score=$16, risk_level=$17, risk_factors=$18,
       requires_cab=$19, updated_at=now() WHERE id=$20`,
    [merged.title, merged.description, merged.reason, merged.category, merged.change_type, merged.application,
      merged.module, merged.bank_instance, merged.environment, merged.implementation_plan, merged.rollback_plan,
      merged.tested, merged.affects_batch, merged.planned_start || null, merged.planned_end || null, r.score,
      r.level, JSON.stringify(r.factors), r.requiresCab, cur.id]);
  await history(db, cur.id, req.user.id, 'Updated', cur.status, cur.status, null);
  res.json({ ok: true });
});

// ---------- workflow transitions (rules live in ../workflow.js) ----------
router.post('/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  const body = req.body || {};
  const { decision, comment, outcome } = body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const cur = (await client.query('SELECT * FROM change_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Change not found' }); }
    const v = workflow.validate(cur, action, req.user, body);
    if (v.error) { await client.query('ROLLBACK'); return res.status(v.code).json({ error: v.error }); }
    const from = cur.status, to = v.to, label = `${cur.ref} "${cur.title}"`;

    if (action === 'submit') {
      await client.query(`UPDATE change_requests SET status='Submitted', submitted_at=now(), updated_at=now() WHERE id=$1`, [id]);
      await history(client, id, req.user.id, 'Submitted', from, to, comment);
      await notifyRoles(client, ['Reviewer'], id, `${label} submitted for review (${cur.risk_level} risk)`, req.user.id);

    } else if (action === 'review') {
      await client.query('UPDATE change_requests SET status=$1, updated_at=now() WHERE id=$2', [to, id]);
      await client.query(`INSERT INTO approvals (change_id, stage, decision, approver_id, comment) VALUES ($1,'Review',$2,$3,$4)`,
        [id, decision, req.user.id, comment || null]);
      await history(client, id, req.user.id, `Review: ${decision}`, from, to, comment);
      if (decision === 'Recommended') await notifyRoles(client, ['Approver'], id, `${label} recommended and awaiting approval${cur.requires_cab ? ' (CAB review required)' : ''}`, req.user.id);
      else await notifyUser(client, cur.requester_id, id, `${label} was returned by reviewer: ${comment}`);

    } else if (action === 'decide') {
      await client.query('UPDATE change_requests SET status=$1, decided_at=now(), updated_at=now() WHERE id=$2', [to, id]);
      await client.query(`INSERT INTO approvals (change_id, stage, decision, approver_id, comment) VALUES ($1,'Approval',$2,$3,$4)`,
        [id, decision, req.user.id, comment || null]);
      await history(client, id, req.user.id, `Approval: ${decision}`, from, to, comment);
      await notifyUser(client, cur.requester_id, id, `${label} was ${decision.toLowerCase()}${comment ? ': ' + comment : ''}`);

    } else if (action === 'implement') {
      const at = body.implemented_at || new Date().toISOString();
      await client.query(`UPDATE change_requests SET status='Monitoring', outcome=$1, implemented_at=$2, updated_at=now() WHERE id=$3`, [outcome, at, id]);
      await history(client, id, req.user.id, `Implemented (${outcome})`, from, 'Implemented', comment);
      await history(client, id, null, 'Monitoring started', 'Implemented', 'Monitoring', 'Incident correlation active');
      const links = await correlateChange(id, null);
      if (links.length) await history(client, id, null, `Auto-linked ${links.length} incident(s)`, 'Monitoring', 'Monitoring', null);
      await notifyUser(client, cur.requester_id, id, `${label} recorded as ${outcome}; now in monitoring`);

    } else if (action === 'close') {
      const links = await correlateChange(id, null); // final correlation sweep
      await client.query(`UPDATE change_requests SET status='Closed', closed_at=now(), updated_at=now() WHERE id=$1`, [id]);
      await history(client, id, req.user.id, `Closed (${links.length} new incident link(s))`, from, 'Closed', comment);
      await notifyUser(client, cur.requester_id, id, `${label} closed`);

    } else { // internal actions (edit/correlate) are not status transitions
      await client.query('ROLLBACK'); return res.status(404).json({ error: `Unknown action '${action}'` });
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK'); res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

module.exports = router;
