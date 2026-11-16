import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Hourglass, Link2, Lock, Pencil, PlayCircle, RefreshCw, Send, ThumbsDown, ThumbsUp, Undo2, Unlink } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert, Avatar, Badge, Card, DecisionModal, Empty, Field, PageHeader, Skeleton, Stepper, useToast } from '../components'
import { fmt, timeAgo } from '../constants'

const LVL = { Low: '#1baf7a', Medium: '#eda100', High: '#e34948' }
const D = ({ k, children, full }) => <div className={full ? 'full' : ''}><dt>{k}</dt><dd>{children || <span className="mute">—</span>}</dd></div>

export default function ChangeDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const [c, setC] = useState(null)
  const [err, setErr] = useState('')
  const [dlg, setDlg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState('Successful')
  const [implAt, setImplAt] = useState('')
  const [allInc, setAllInc] = useState([])
  const [pick, setPick] = useState('')

  const load = useCallback(() => api(`/changes/${id}`).then(setC).catch((e) => setErr(e.message)), [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { api('/incidents').then(setAllInc).catch(() => {}) }, [])

  if (err && !c) return <Alert>{err}</Alert>
  if (!c) return <><PageHeader title="Loading…" /><Card><Skeleton rows={6} /></Card></>

  const run = async (path, body, okMsg, method = 'POST') => {
    setBusy(true)
    try { await api(path, { method, body }); toast.success(okMsg); await load(); return true } catch (e) { toast.error(e.message); return false } finally { setBusy(false) }
  }
  const decide = (cfg) => setDlg({
    ...cfg,
    onConfirm: async (text) => { if (await run(cfg.path, { ...cfg.body, comment: text }, cfg.ok)) setDlg(null) },
  })

  const r = user.role, own = c.requester_id === user.id
  const can = (a) => c.allowed_actions.includes(a) // decided by the server-side workflow engine
  const linked = new Set(c.incidents.map((i) => i.id))

  // ----- next-step panel: what is expected, and from whom -----
  let panel
  const who = (txt) => <div className="row" style={{ color: 'var(--ink-2)' }}><Hourglass size={18} />{txt}</div>
  if (['Draft', 'Returned'].includes(c.status)) {
    const last = [...c.approvals].reverse().find((a) => a.decision === 'Returned')
    panel = { title: c.status === 'Returned' ? 'Returned for changes' : 'Draft', note: c.status === 'Returned' && last ? `“${last.comment}” — ${last.approver_name}` : 'Complete the request and submit it for review.',
      body: can('submit') ? <><Link className="btn secondary" to={`/changes/${c.id}/edit`}><Pencil size={17} />Edit</Link>
        <button className="btn" disabled={busy} onClick={() => run(`/changes/${id}/submit`, {}, 'Submitted for review')}><Send size={17} />Submit for review</button></> : who(own ? 'Waiting for you to resubmit.' : 'Waiting for the requester to resubmit.') }
  } else if (c.status === 'Submitted') {
    panel = { title: 'Awaiting review', note: 'A reviewer checks the request is complete and recommends it for approval.',
      body: can('review') ? <>
        <button className="btn" disabled={busy} onClick={() => decide({ title: 'Recommend for approval', sub: `${c.ref} will move to the approver queue.`, confirm: 'Recommend', label: 'Comment (optional)', path: `/changes/${id}/review`, body: { decision: 'Recommended' }, ok: 'Recommended for approval' })}><ThumbsUp size={17} />Recommend</button>
        <button className="btn secondary" disabled={busy} onClick={() => decide({ title: 'Return to requester', sub: 'Explain what must be fixed before resubmission.', confirm: 'Return', required: true, label: 'What needs to change?', path: `/changes/${id}/review`, body: { decision: 'Returned' }, ok: 'Returned to requester' })}><Undo2 size={17} />Return</button></>
        : who(own ? 'You raised this change — a different reviewer must review it.' : 'Waiting for a Reviewer.') }
  } else if (c.status === 'Under Review') {
    panel = { title: 'Awaiting approval', note: c.requires_cab ? 'High-risk change: record the CAB outcome when approving.' : 'An approver makes the final decision.',
      body: can('decide') ? <>
        <button className="btn" disabled={busy} onClick={() => decide({ title: 'Approve change', sub: c.ref, confirm: 'Approve', required: c.requires_cab, label: c.requires_cab ? 'CAB outcome & conditions' : 'Comment (optional)', notice: c.requires_cab ? 'This is a High-risk change. Record the CAB decision and any conditions.' : null, path: `/changes/${id}/decide`, body: { decision: 'Approved' }, ok: 'Change approved' })}><ThumbsUp size={17} />Approve</button>
        <button className="btn danger-o" disabled={busy} onClick={() => decide({ title: 'Reject change', sub: 'Rejection is final and closes the request.', danger: true, confirm: 'Reject', required: true, label: 'Reason for rejection', path: `/changes/${id}/decide`, body: { decision: 'Rejected' }, ok: 'Change rejected' })}><ThumbsDown size={17} />Reject</button>
        <button className="btn secondary" disabled={busy} onClick={() => decide({ title: 'Return to requester', confirm: 'Return', required: true, label: 'What needs to change?', path: `/changes/${id}/decide`, body: { decision: 'Returned' }, ok: 'Returned to requester' })}><Undo2 size={17} />Return</button></>
        : who(own ? 'You raised this change — a different approver must decide.' : 'Waiting for an Approver.') }
  } else if (c.status === 'Approved') {
    panel = { title: 'Approved – ready to implement', note: 'Record the outcome once the change has been applied. Monitoring and incident correlation start automatically.',
      body: can('implement') ? <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Outcome"><select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ width: 160 }}><option>Successful</option><option>Failed</option><option>Rolled Back</option></select></Field>
        <Field label="Implemented at" hint="Blank = now"><input type="datetime-local" value={implAt} onChange={(e) => setImplAt(e.target.value)} style={{ width: 220 }} /></Field>
        <button className="btn" disabled={busy} onClick={() => run(`/changes/${id}/implement`, { outcome, implemented_at: implAt ? new Date(implAt).toISOString() : undefined }, 'Implementation recorded – monitoring started')}><PlayCircle size={17} />Record implementation</button></div>
        : who('Waiting for a Support Engineer to record implementation.') }
  } else if (c.status === 'Monitoring') {
    panel = { title: 'Monitoring', note: 'Incidents on the same application/module shortly after implementation are linked automatically. Close the change once it is stable.',
      body: can('close') ? <>
        <button className="btn secondary" disabled={busy} onClick={() => run(`/incidents/correlate/${id}`, {}, 'Correlation re-run')}><RefreshCw size={17} />Re-run correlation</button>
        <button className="btn" disabled={busy} onClick={() => decide({ title: 'Close change', sub: 'Runs a final incident correlation sweep.', confirm: 'Close change', label: 'Closure note (optional)', path: `/changes/${id}/close`, body: {}, ok: 'Change closed' })}><CheckCircle2 size={17} />Close change</button></> : who('Under monitoring by the support team.') }
  } else {
    panel = { title: c.status === 'Rejected' ? 'Rejected' : 'Closed', note: 'This change is complete. The record is retained for audit and analytics.', body: <div className="row mute"><Lock size={16} />No further actions available.</div> }
  }

  return (
    <>
      <PageHeader crumbs={[['Changes', '/changes'], [c.ref]]} title={c.title}
        sub={<span className="row" style={{ gap: 8, marginTop: 2 }}><span className="mute">{c.ref}</span><Badge v={c.status} /><Badge v={c.risk_level} tone={undefined} /><Badge v={c.outcome} />
          {c.change_type === 'Emergency' && <Badge v="Emergency" />}<span className="mute">· {c.environment}</span></span>} />
      <Card flush><Stepper status={c.status} /></Card>

      <div className="grid main-side">
        <div className="stack">
          <section className="card actionpanel"><div className="cbody">
            <div className="ah"><div><h3 style={{ fontSize: 16 }}>{panel.title}</h3><p className="mute" style={{ margin: '4px 0 14px' }}>{panel.note}</p></div></div>
            <div className="row">{panel.body}</div>
          </div></section>

          <Card title="Change details">
            <dl className="dl">
              <D k="Category">{c.category}</D><D k="Change type">{c.change_type}</D>
              <D k="Application">{c.application}</D><D k="Module">{c.module}</D>
              <D k="Bank instance">{c.bank_instance}</D><D k="Environment">{c.environment}</D>
              <D k="Planned window">{c.planned_start ? `${fmt(c.planned_start)} → ${fmt(c.planned_end)}` : null}</D><D k="Implemented">{c.implemented_at ? fmt(c.implemented_at) : null}</D>
              <D k="Description" full>{c.description}</D><D k="Reason" full>{c.reason}</D>
              <D k="Implementation plan" full>{c.implementation_plan}</D><D k="Rollback plan" full>{c.rollback_plan}</D>
            </dl>
          </Card>

          <Card title={`Related incidents (${c.incidents.length})`} sub="Incidents linked automatically by rule or manually by a user" flush>
            {!c.incidents.length ? <Empty icon={Link2} title="No incidents linked" text="Nothing has been reported against this change." /> :
              <div className="tblwrap"><table className="tbl"><thead><tr><th>Incident</th><th>Priority</th><th>How linked</th><th /></tr></thead><tbody>
                {c.incidents.map((i) => <tr key={i.id}><td><div className="title">{i.title}</div><div className="ref">{i.ref} · opened {fmt(i.opened_at)}</div></td><td><Badge v={i.priority} /></td>
                  <td style={{ maxWidth: 260 }}><Badge v={i.link_source} dot={false} /><div className="sub">{i.match_reason}</div></td>
                  <td>{r !== 'Administrator' && <button className="btn ghost sm" onClick={() => run(`/incidents/link/${i.link_id}`, undefined, 'Incident unlinked', 'DELETE')}><Unlink size={15} />Unlink</button>}</td></tr>)}</tbody></table></div>}
            {r !== 'Administrator' && <div className="row" style={{ padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
              <select style={{ flex: 1, minWidth: 220 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Incident to link">
                <option value="">Link another incident manually…</option>
                {allInc.filter((i) => !linked.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.ref} · {i.module} · {i.title}</option>)}</select>
              <button className="btn secondary" disabled={!pick || busy} onClick={async () => { if (await run('/incidents/link', { change_id: c.id, incident_id: Number(pick) }, 'Incident linked')) setPick('') }}><Link2 size={16} />Link</button>
            </div>}
          </Card>
        </div>

        <div className="stack">
          <Card title="Risk assessment" sub="Rule-based score, not a prediction">
            <div className="row between"><div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.02em' }}>{c.risk_score}<span className="mute" style={{ fontSize: 15, fontWeight: 500 }}>/100</span></div><Badge v={c.risk_level} /></div>
            <div className="gauge"><i style={{ width: `${c.risk_score}%`, background: LVL[c.risk_level] }} /></div>
            {c.risk_factors.map((x, i) => <div key={i} className="factor"><span>{x.label}</span><b>+{x.points}</b></div>)}
            {c.requires_cab && <div style={{ marginTop: 14 }}><Alert kind="warn"><b>CAB review required</b> before approval.</Alert></div>}
          </Card>

          <Card title="Review & approval">
            {!c.approvals.length ? <p className="mute" style={{ margin: 0 }}>No decisions recorded yet.</p> : c.approvals.map((a) => (
              <div key={a.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', marginBottom: 14 }}>
                <Avatar name={a.approver_name} /><div><div><b>{a.approver_name}</b> <span className="mute">· {a.stage}</span></div>
                  <div style={{ margin: '3px 0' }}><Badge v={a.decision} /></div>{a.comment && <div className="small" style={{ color: 'var(--ink-2)' }}>{a.comment}</div>}
                  <div className="mute small">{fmt(a.decided_at)}</div></div></div>))}
          </Card>

          <Card title="Audit trail" sub="Every status change and decision">
            <div className="timeline">{c.history.map((h) => (
              <div className="tl" key={h.id}><b>{h.action}</b>
                <div className="mute small">{h.actor_name || 'System'} · <span title={fmt(h.created_at)}>{timeAgo(h.created_at)}</span>{h.from_status && h.from_status !== h.to_status && <> · {h.from_status} → {h.to_status}</>}</div>
                {h.comment && <div className="small" style={{ color: 'var(--ink-2)', marginTop: 2 }}>{h.comment}</div>}</div>))}</div>
          </Card>
        </div>
      </div>
      {dlg && <DecisionModal cfg={dlg} onClose={() => setDlg(null)} onConfirm={dlg.onConfirm} />}
    </>
  )
}
