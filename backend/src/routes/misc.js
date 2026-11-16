const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, authenticate, requireRole } = require('../auth');
const { correlateIncident, correlateChange, WINDOW_HOURS } = require('../correlation');

// ================= AUTH =================
const auth = require('express').Router();
auth.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const { rows } = await db.query(
    `SELECT u.*, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE lower(u.email) = lower($1)`, [email]);
  const u = rows[0];
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: sign(u), user: { id: u.id, name: u.full_name, email: u.email, role: u.role } });
});
auth.get('/me', authenticate, (req, res) => res.json(req.user));

// ================= INCIDENTS =================
const incidents = require('express').Router();
incidents.use(authenticate);

incidents.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT i.*, (SELECT COUNT(*) FROM change_incident_links l WHERE l.incident_id = i.id)::int AS change_count
     FROM incidents i ORDER BY i.opened_at DESC LIMIT 500`);
  res.json(rows);
});

incidents.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM incidents WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Incident not found' });
  const links = await db.query(
    `SELECT c.id, c.ref, c.title, c.status, c.implemented_at, l.link_source, l.match_reason, l.id AS link_id
     FROM change_incident_links l JOIN change_requests c ON c.id = l.change_id WHERE l.incident_id = $1`, [req.params.id]);
  res.json({ ...rows[0], changes: links.rows });
});

incidents.post('/', requireRole('Support Engineer'), async (req, res) => {
  const b = req.body;
  if (!b.title || !b.application || !b.module || !b.priority)
    return res.status(400).json({ error: 'title, application, module and priority are required' });
  const ins = await db.query(
    `INSERT INTO incidents (title, description, application, module, bank_instance, priority, incident_type, reported_by, opened_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, now())) RETURNING id`,
    [b.title, b.description, b.application, b.module, b.bank_instance, b.priority, b.incident_type || 'Other', req.user.id, b.opened_at || null]);
  const id = ins.rows[0].id;
  await db.query(`UPDATE incidents SET ref = 'INC-' || LPAD(id::text, 4, '0') WHERE id = $1`, [id]);
  const links = await correlateIncident(id, null);
  // tell requesters of any change this incident was auto-linked to
  for (const l of links) {
    await db.query(
      `INSERT INTO notifications (user_id, change_id, message)
       SELECT requester_id, id, 'Incident INC-' || LPAD($2::text,4,'0') || ' was auto-linked to ' || ref FROM change_requests WHERE id = $1`,
      [l.change_id, id]);
  }
  res.status(201).json({ id, auto_linked: links.length });
});

incidents.put('/:id/status', requireRole('Support Engineer'), async (req, res) => {
  const { status } = req.body;
  if (!['Open', 'In Progress', 'Resolved', 'Closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  await db.query(
    `UPDATE incidents SET status=$1, resolved_at = CASE WHEN $1 IN ('Resolved','Closed') THEN COALESCE(resolved_at, now()) ELSE NULL END WHERE id=$2`,
    [status, req.params.id]);
  res.json({ ok: true });
});

// manual link / unlink
incidents.post('/link', requireRole('Support Engineer', 'Reviewer', 'Approver'), async (req, res) => {
  const { change_id, incident_id } = req.body;
  if (!change_id || !incident_id) return res.status(400).json({ error: 'change_id and incident_id required' });
  try {
    await db.query(
      `INSERT INTO change_incident_links (change_id, incident_id, link_source, match_reason, linked_by)
       VALUES ($1,$2,'Manual','Linked manually by user',$3) ON CONFLICT DO NOTHING`, [change_id, incident_id, req.user.id]);
    await db.query(`INSERT INTO change_history (change_id, actor_id, action) VALUES ($1,$2,$3)`,
      [change_id, req.user.id, `Manually linked incident #${incident_id}`]);
    await db.query(
      `INSERT INTO notifications (user_id, change_id, message)
       SELECT requester_id, id, 'Incident INC-' || LPAD($2::text,4,'0') || ' was manually linked to ' || ref FROM change_requests WHERE id = $1`,
      [change_id, incident_id]);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
incidents.delete('/link/:linkId', requireRole('Support Engineer', 'Reviewer', 'Approver'), async (req, res) => {
  await db.query('DELETE FROM change_incident_links WHERE id = $1', [req.params.linkId]);
  res.json({ ok: true });
});
// re-run correlation for a change
incidents.post('/correlate/:changeId', requireRole('Support Engineer', 'Approver'), async (req, res) => {
  const links = await correlateChange(req.params.changeId, req.user.id);
  res.json({ new_links: links.length, window_hours: WINDOW_HOURS });
});

// ================= NOTIFICATIONS =================
const notifications = require('express').Router();
notifications.use(authenticate);
notifications.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT n.*, c.ref AS change_ref FROM notifications n LEFT JOIN change_requests c ON c.id = n.change_id
     WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 100`, [req.user.id]);
  res.json(rows);
});
notifications.post('/read', async (req, res) => {
  await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});

// ================= USERS (admin) =================
const users = require('express').Router();
users.use(authenticate);
users.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.full_name, u.email, u.active, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id`);
  res.json(rows);
});
users.post('/', requireRole('Administrator'), async (req, res) => {
  const { full_name, email, password, role } = req.body;
  if (!full_name || !email || !password || !role) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const r = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
  if (!r.rows[0]) return res.status(400).json({ error: 'Unknown role' });
  try {
    await db.query('INSERT INTO users (full_name, email, password_hash, role_id) VALUES ($1,$2,$3,$4)',
      [full_name, email, await bcrypt.hash(password, 10), r.rows[0].id]);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(409).json({ error: 'Email already exists' }); }
});
users.put('/:id', requireRole('Administrator'), async (req, res) => {
  const { role, active } = req.body;
  if (Number(req.params.id) === req.user.id && active === false)
    return res.status(400).json({ error: 'You cannot deactivate yourself' });
  if (role) {
    const r = await db.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (!r.rows[0]) return res.status(400).json({ error: 'Unknown role' });
    await db.query('UPDATE users SET role_id = $1 WHERE id = $2', [r.rows[0].id, req.params.id]);
  }
  if (typeof active === 'boolean') await db.query('UPDATE users SET active = $1 WHERE id = $2', [active, req.params.id]);
  res.json({ ok: true });
});

// ================= ANALYTICS =================
const analytics = require('express').Router();
analytics.use(authenticate);
analytics.get('/summary', async (req, res) => {
  const q = (sql) => db.query(sql).then((r) => r.rows);
  const [totals, byStatus, byCategory, byApp, byEnv, byRisk, monthly, turnaround, incidentProne, cfr] = await Promise.all([
    q(`SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status IN ('Implemented','Monitoring','Closed'))::int AS implemented,
         COUNT(*) FILTER (WHERE status IN ('Submitted','Under Review'))::int AS pending,
         (SELECT COUNT(*) FROM incidents)::int AS incidents,
         (SELECT COUNT(DISTINCT incident_id) FROM change_incident_links)::int AS linked_incidents
       FROM change_requests`),
    q(`SELECT status AS label, COUNT(*)::int AS value FROM change_requests GROUP BY status ORDER BY value DESC`),
    q(`SELECT category AS label, COUNT(*)::int AS value FROM change_requests GROUP BY category ORDER BY value DESC`),
    q(`SELECT application AS label, COUNT(*)::int AS value FROM change_requests GROUP BY application ORDER BY value DESC`),
    q(`SELECT environment AS label, COUNT(*)::int AS value FROM change_requests GROUP BY environment ORDER BY value DESC`),
    q(`SELECT risk_level AS label, COUNT(*)::int AS value FROM change_requests GROUP BY risk_level`),
    q(`SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS label, COUNT(*)::int AS value
       FROM change_requests GROUP BY 1 ORDER BY 1`),
    q(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (decided_at - submitted_at))/3600.0)::numeric, 1)::float AS avg_hours,
              ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (decided_at - submitted_at))/3600.0))::numeric,1)::float AS median_hours
       FROM change_requests WHERE decided_at IS NOT NULL AND submitted_at IS NOT NULL`),
    q(`SELECT c.application || ' / ' || c.module AS label, COUNT(DISTINCT l.incident_id)::int AS value
       FROM change_incident_links l JOIN change_requests c ON c.id = l.change_id
       GROUP BY 1 ORDER BY value DESC LIMIT 8`),
    // Change failure rate. A change counts as failed when it (a) was recorded Failed / Rolled Back, or
    // (b) has a P1/P2 incident linked to it by the correlation rules. Both parts are reported.
    q(`SELECT COUNT(*)::int AS implemented,
         COUNT(*) FILTER (WHERE c.outcome IN ('Failed','Rolled Back'))::int AS direct,
         COUNT(*) FILTER (WHERE c.outcome = 'Successful' AND EXISTS (SELECT 1 FROM change_incident_links l JOIN incidents i ON i.id = l.incident_id
                       WHERE l.change_id = c.id AND i.priority IN ('P1','P2')))::int AS incident_only
       FROM change_requests c WHERE c.implemented_at IS NOT NULL`),
  ]);
  const impl = cfr[0].implemented;
  res.json({
    totals: totals[0], byStatus, byCategory, byApp, byEnv, byRisk, monthly,
    turnaround: turnaround[0],
    incidentProne,
    changeFailureRate: (() => {
      const failed = cfr[0].direct + cfr[0].incident_only;
      return { implemented: impl, failed, direct: cfr[0].direct, incidentOnly: cfr[0].incident_only,
        percent: impl ? Math.round((failed / impl) * 1000) / 10 : 0,
        directPercent: impl ? Math.round((cfr[0].direct / impl) * 1000) / 10 : 0 };
    })(),
    correlationWindowHours: WINDOW_HOURS,
  });
});

module.exports = { auth, incidents, notifications, users, analytics };
