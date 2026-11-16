// Seeds synthetic (non-confidential) core-banking change & incident data.
// Usage: node db/seed.js   (re-creates the schema first)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { scoreChange } = require('../src/risk');
const { correlateChange } = require('../src/correlation');

// deterministic PRNG so the demo data is reproducible
let s = 20260101;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
const H = 3600 * 1000, D = 24 * H;

const SYSTEMS = [
  { application: 'Finacle Core Banking', modules: ['CASA', 'Loans', 'GL', 'EOD Batch', 'Treasury'] },
  { application: 'Finacle Internet Banking', modules: ['Transfers', 'Bill Payments', 'Onboarding'] },
  { application: 'Finacle Interface Hub', modules: ['NIP Gateway', 'Card Switch', 'Mobile API'] },
];
const FRAGILE = new Set(['EOD Batch', 'NIP Gateway', 'GL']); // modules that fail more -> visible patterns
const BANKS = ['Bank A (Tier 1)', 'Bank B (Tier 2)', 'Bank C (MFB)', 'Bank D (Tier 1)'];

const TEMPLATES = {
  'Parameter': ['Update daily transfer limit parameter', 'Adjust interest accrual parameter (CRR/INTPAR)', 'Change charge waiver parameter', 'Update inactive-account dormancy threshold'],
  'Product/GL Configuration': ['Configure new savings product scheme code', 'Add GL sub-head for new fee income', 'Amend loan product repayment schedule rule', 'Map new GL to regulatory return'],
  'Interface/API': ['Update NIP gateway endpoint timeout', 'Roll out revised mobile balance-enquiry API', 'Change card switch routing rule', 'Update bill-payment aggregator API version'],
  'Batch Job': ['Reschedule EOD interest posting job', 'Modify EOD reconciliation script', 'Add new statement-generation batch job', 'Tune EOD GL consolidation job'],
  'Database': ['Add index to transaction history table', 'Archive old audit tables', 'Alter column length on narration field'],
  'Patch': ['Apply Finacle service pack hotfix', 'Deploy security patch to web tier', 'Apply vendor fix for statement rounding defect'],
};
const INC = {
  'EOD Batch': [['Batch Failure', 'EOD batch abended during interest posting'], ['Batch Failure', 'EOD overran into business hours']],
  'NIP Gateway': [['Interface Failure', 'NIP transfers timing out'], ['Transaction Failure', 'Duplicate NIP debits observed']],
  'GL': [['GL Issue', 'GL balances not tying to subledger'], ['Reconciliation', 'Reconciliation breaks on suspense GL']],
  default: [['Transaction Failure', 'Customer transactions failing intermittently'], ['Performance', 'Slow response on enquiry screens'], ['Other', 'User-reported error on screen']],
};

(async () => {
  await db.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  // ---- users ----
  const roleId = Object.fromEntries((await db.query('SELECT id, name FROM roles')).rows.map((r) => [r.name, r.id]));
  const pw = await bcrypt.hash('Password123!', 10);
  const U = [
    ['Admin User', 'admin@cmts.local', 'Administrator'],
    ['Chinedu Okafor', 'engineer1@cmts.local', 'Support Engineer'],
    ['Amaka Eze', 'engineer2@cmts.local', 'Support Engineer'],
    ['Tunde Bello', 'engineer3@cmts.local', 'Support Engineer'],
    ['Ngozi Adeyemi', 'reviewer1@cmts.local', 'Reviewer'],
    ['Ibrahim Musa', 'reviewer2@cmts.local', 'Reviewer'],
    ['Funke Alade', 'approver1@cmts.local', 'Approver'],
    ['Emeka Obi', 'approver2@cmts.local', 'Approver'],
  ];
  const ids = { eng: [], rev: [], app: [], admin: null };
  for (const [name, email, role] of U) {
    const r = await db.query('INSERT INTO users (full_name,email,password_hash,role_id) VALUES ($1,$2,$3,$4) RETURNING id', [name, email, pw, roleId[role]]);
    const id = r.rows[0].id;
    if (role === 'Support Engineer') ids.eng.push(id);
    if (role === 'Reviewer') ids.rev.push(id);
    if (role === 'Approver') ids.app.push(id);
    if (role === 'Administrator') ids.admin = id;
  }

  const now = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const hist = (cid, actor, action, from, to, at, comment = null) =>
    db.query('INSERT INTO change_history (change_id,actor_id,action,from_status,to_status,comment,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [cid, actor, action, from, to, comment, iso(at)]);

  const implemented = [];
  const N = 70;
  for (let n = 0; n < N; n++) {
    const sys = pick(SYSTEMS), module = pick(sys.modules);
    const category = pick(Object.keys(TEMPLATES));
    const title = `${pick(TEMPLATES[category])} - ${module}`;
    const tested = chance(0.8);
    const c = {
      category, change_type: chance(0.08) ? 'Emergency' : chance(0.2) ? 'Standard' : 'Normal',
      environment: chance(0.6) ? 'Production' : pick(['UAT', 'SIT', 'Development']),
      affects_batch: module === 'EOD Batch' || chance(0.15), tested,
      rollback_plan: chance(0.85) ? 'Restore previous parameter/script version from backup; re-run affected job.' : '',
    };
    const risk = scoreChange(c);
    const created = now - Math.floor(rnd() * 175) * D - Math.floor(rnd() * 20) * H - 5 * D;

    // lifecycle outcome
    const roll = rnd();
    const status = roll < 0.55 ? 'Closed' : roll < 0.65 ? 'Monitoring' : roll < 0.70 ? 'Approved' : roll < 0.77 ? 'Under Review'
      : roll < 0.83 ? 'Submitted' : roll < 0.88 ? 'Draft' : roll < 0.95 ? 'Rejected' : 'Returned';
    const requester = pick(ids.eng);
    const submitted = ['Draft'].includes(status) ? null : created + Math.floor(rnd() * 20) * H;
    const reviewed = submitted && !['Submitted'].includes(status) ? submitted + (2 + rnd() * 20) * H : null;
    const decided = reviewed && ['Approved', 'Rejected', 'Monitoring', 'Closed'].includes(status) ? reviewed + (2 + rnd() * 40) * H : null;
    let implAt = null, outcome = null;
    if (['Monitoring', 'Closed'].includes(status)) {
      implAt = decided + (6 + rnd() * 96) * H;
      const failP = FRAGILE.has(module) ? 0.35 : 0.08 + (risk.level === 'High' ? 0.12 : 0);
      outcome = chance(failP) ? pick(['Failed', 'Rolled Back']) : 'Successful';
      if (implAt > now - 2 * H) implAt = now - (3 + rnd() * 70) * H; // keep in the past
    }
    const closedAt = status === 'Closed' ? implAt + 3 * D : null;

    const ins = await db.query(
      `INSERT INTO change_requests (title,description,reason,category,change_type,application,module,bank_instance,environment,
         implementation_plan,rollback_plan,tested,affects_batch,planned_start,planned_end,risk_score,risk_level,risk_factors,requires_cab,
         status,outcome,requester_id,submitted_at,decided_at,implemented_at,closed_at,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$27) RETURNING id`,
      [title, `${title}. Synthetic change record for prototype demonstration.`, 'Business/regulatory requirement or operational improvement',
        category, c.change_type, sys.application, module, pick(BANKS), c.environment,
        'Apply change during agreed window, validate, notify stakeholders.', c.rollback_plan, tested, c.affects_batch,
        iso(created + 3 * D), iso(created + 3 * D + 2 * H), risk.score, risk.level, JSON.stringify(risk.factors), risk.requiresCab,
        status, outcome, requester, submitted && iso(submitted), decided && iso(decided), implAt && iso(implAt), closedAt && iso(closedAt), iso(created)]);
    const cid = ins.rows[0].id;
    await db.query(`UPDATE change_requests SET ref='CHG-'||LPAD(id::text,4,'0') WHERE id=$1`, [cid]);

    await hist(cid, requester, 'Created', null, 'Draft', created);
    const rev = pick(ids.rev), app = pick(ids.app);
    if (submitted) await hist(cid, requester, 'Submitted', 'Draft', 'Submitted', submitted);
    if (reviewed) {
      const returned = status === 'Returned';
      await db.query(`INSERT INTO approvals (change_id,stage,decision,approver_id,comment,decided_at) VALUES ($1,'Review',$2,$3,$4,$5)`,
        [cid, returned ? 'Returned' : 'Recommended', rev, returned ? 'Please attach test evidence and rollback steps.' : 'Reviewed; scope and plan acceptable.', iso(reviewed)]);
      await hist(cid, rev, returned ? 'Review: Returned' : 'Review: Recommended', 'Submitted', returned ? 'Returned' : 'Under Review', reviewed);
    }
    if (decided) {
      const dec = status === 'Rejected' ? 'Rejected' : 'Approved';
      const cm = dec === 'Rejected' ? 'Insufficient testing for production window.' : risk.requires_cab || risk.requiresCab ? 'CAB reviewed and approved with conditions: monitor EOD.' : 'Approved.';
      await db.query(`INSERT INTO approvals (change_id,stage,decision,approver_id,comment,decided_at) VALUES ($1,'Approval',$2,$3,$4,$5)`,
        [cid, dec, app, cm, iso(decided)]);
      await hist(cid, app, `Approval: ${dec}`, 'Under Review', dec, decided, cm);
    }
    if (implAt) {
      await hist(cid, requester, `Implemented (${outcome})`, 'Approved', 'Implemented', implAt);
      await hist(cid, null, 'Monitoring started', 'Implemented', 'Monitoring', implAt);
      if (closedAt) await hist(cid, requester, 'Closed', 'Monitoring', 'Closed', closedAt);
      implemented.push({ cid, implAt, outcome, ...sys, module, risk: risk.level });
    }
    if (status === 'Under Review' || status === 'Submitted')
      await db.query(`INSERT INTO notifications (user_id,change_id,message,is_read) VALUES ($1,$2,$3,false)`,
        [status === 'Submitted' ? rev : app, cid, `CHG-${String(cid).padStart(4, '0')} awaiting your action`]);
  }

  // ---- incidents: caused by failed/fragile changes + background noise ----
  let incN = 0;
  const addIncident = async (application, module, at, priority, resolvedAfterH) => {
    const recent = at > now - 4 * D; // very recent incidents are still active
    const [type, title] = pick(INC[module] || INC.default);
    const r = await db.query(
      `INSERT INTO incidents (title,description,application,module,bank_instance,priority,incident_type,status,reported_by,opened_at,resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [`${title} (${module})`, 'Synthetic incident for prototype demonstration.', application, module, pick(BANKS), priority, type,
        recent ? pick(['Open', 'In Progress']) : 'Resolved', pick(ids.eng), iso(at), recent ? null : iso(at + resolvedAfterH * H)]);
    await db.query(`UPDATE incidents SET ref='INC-'||LPAD(id::text,4,'0') WHERE id=$1`, [r.rows[0].id]);
    incN++;
  };
  for (const ch of implemented) {
    const p = ch.outcome !== 'Successful' ? 0.8 : FRAGILE.has(ch.module) ? 0.35 : ch.risk === 'High' ? 0.25 : 0.07;
    if (chance(p)) {
      const at = ch.implAt + (1 + rnd() * 60) * H;
      if (at < now) await addIncident(ch.application, ch.module, at, pick(['P1', 'P2', 'P2', 'P3']), 2 + rnd() * 20);
    }
  }
  for (let i = 0; i < 25; i++) { // unrelated background incidents
    const sys = pick(SYSTEMS);
    await addIncident(sys.application, pick(sys.modules), now - (i < 5 ? rnd() * 3 : rnd() * 170) * D, pick(['P2', 'P3', 'P3', 'P4']), 1 + rnd() * 30);
  }

  // ---- run correlation over all implemented changes (same engine the app uses) ----
  let links = 0;
  for (const ch of implemented) links += (await correlateChange(ch.cid, null)).length;

  console.log(`Seeded ${U.length} users, ${N} changes, ${incN} incidents, ${links} auto-links.`);
  console.log('Login with any @cmts.local user, password: Password123!');
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
