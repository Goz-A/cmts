import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ShieldAlert, Send, Save } from 'lucide-react'
import { api } from '../api'
import { Alert, Badge, Card, Field, PageHeader, Spinner, useToast } from '../components'
import { CATEGORIES, ENVS, SYSTEMS, TYPES } from '../constants'

const blank = {
  title: '', description: '', reason: '', category: CATEGORIES[0], change_type: 'Normal',
  application: Object.keys(SYSTEMS)[0], module: SYSTEMS[Object.keys(SYSTEMS)[0]][0], bank_instance: '',
  environment: 'UAT', implementation_plan: '', rollback_plan: '', tested: false, affects_batch: false, planned_start: '', planned_end: '',
}
const REQ = ['title', 'description', 'reason']
const local = (d) => (d ? new Date(new Date(d) - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const LVL = { Low: '#1baf7a', Medium: '#eda100', High: '#e34948' }

export default function ChangeForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [f, setF] = useState(blank)
  const [ref, setRef] = useState('')
  const [errs, setErrs] = useState({})
  const [apiErr, setApiErr] = useState('')
  const [busy, setBusy] = useState('')
  const [risk, setRisk] = useState(null)

  useEffect(() => {
    if (id) api(`/changes/${id}`).then((c) => { setRef(c.ref); setF({ ...blank, ...c, bank_instance: c.bank_instance || '', implementation_plan: c.implementation_plan || '', rollback_plan: c.rollback_plan || '', planned_start: local(c.planned_start), planned_end: local(c.planned_end) }) }).catch((e) => setApiErr(e.message))
  }, [id])

  useEffect(() => { // live risk preview, same rules as the server applies on save
    const t = setTimeout(() => api('/changes/risk-preview', { method: 'POST', body: f }).then(setRisk).catch(() => {}), 200)
    return () => clearTimeout(t)
  }, [f.category, f.environment, f.tested, f.affects_batch, f.rollback_plan, f.change_type]) // eslint-disable-line

  const set = (k) => (e) => { setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }); setErrs({ ...errs, [k]: '' }) }
  const save = async (submit) => {
    const e = {}; REQ.forEach((k) => { if (!String(f[k]).trim()) e[k] = 'This field is required' })
    if (f.planned_start && f.planned_end && f.planned_end < f.planned_start) e.planned_end = 'End must be after start'
    setErrs(e); setApiErr('')
    if (Object.keys(e).length) { toast.error('Please fix the highlighted fields'); return }
    setBusy(submit ? 'submit' : 'save')
    try {
      const body = { ...f, planned_start: f.planned_start || null, planned_end: f.planned_end || null }
      const cid = id ? (await api(`/changes/${id}`, { method: 'PUT', body }), id) : (await api('/changes', { method: 'POST', body })).id
      if (submit) await api(`/changes/${cid}/submit`, { method: 'POST', body: {} })
      toast.success(submit ? 'Change submitted for review' : 'Draft saved')
      nav(`/changes/${cid}`)
    } catch (x) { setApiErr(x.message); setBusy('') }
  }
  const sel = (k, opts, onCh) => <select value={f[k]} onChange={onCh || set(k)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>

  return (
    <>
      <PageHeader crumbs={[['Changes', '/changes'], [id ? ref || 'Edit' : 'New change']]} title={id ? `Edit ${ref}` : 'New change request'} sub="Describe the change, where it will be applied and how it will be controlled." />
      {apiErr && <div className="mb"><Alert>{apiErr}</Alert></div>}
      <div className="grid main-side">
        <div className="stack">
          <Card title="1. What is changing?">
            <div className="fgrid">
              <Field label="Title" req full error={errs.title}><input value={f.title} onChange={set('title')} placeholder="e.g. Update NIP gateway endpoint timeout" /></Field>
              <Field label="Description" req full error={errs.description} hint="What exactly will be changed?"><textarea rows="3" value={f.description} onChange={set('description')} /></Field>
              <Field label="Reason for change" req full error={errs.reason} hint="Business, regulatory or operational justification."><textarea rows="2" value={f.reason} onChange={set('reason')} /></Field>
              <Field label="Category" req>{sel('category', CATEGORIES)}</Field>
              <Field label="Change type" hint="Emergency changes carry extra risk weight.">{sel('change_type', TYPES)}</Field>
            </div>
          </Card>
          <Card title="2. Where will it be applied?">
            <div className="fgrid">
              <Field label="Application" req>{sel('application', Object.keys(SYSTEMS), (e) => setF({ ...f, application: e.target.value, module: SYSTEMS[e.target.value][0] }))}</Field>
              <Field label="Module" req>{sel('module', SYSTEMS[f.application] || [f.module])}</Field>
              <Field label="Bank instance"><input value={f.bank_instance} onChange={set('bank_instance')} placeholder="e.g. Bank A (Tier 1)" /></Field>
              <Field label="Target environment" req>{sel('environment', ENVS)}</Field>
              <Field label="Planned start"><input type="datetime-local" value={f.planned_start} onChange={set('planned_start')} /></Field>
              <Field label="Planned end" error={errs.planned_end}><input type="datetime-local" value={f.planned_end} onChange={set('planned_end')} /></Field>
            </div>
          </Card>
          <Card title="3. Plan, testing & rollback">
            <div className="fgrid">
              <Field label="Implementation plan" full><textarea rows="3" value={f.implementation_plan} onChange={set('implementation_plan')} /></Field>
              <Field label="Rollback plan" full hint="Leaving this blank increases the risk score."><textarea rows="3" value={f.rollback_plan} onChange={set('rollback_plan')} /></Field>
              <label className="switchrow"><input type="checkbox" checked={f.tested} onChange={set('tested')} /><div><b>Tested before submission</b><span>Evidence available from SIT/UAT.</span></div></label>
              <label className="switchrow"><input type="checkbox" checked={f.affects_batch} onChange={set('affects_batch')} /><div><b>Affects EOD / batch</b><span>Touches scheduled batch processing.</span></div></label>
            </div>
          </Card>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn ghost" onClick={() => nav(-1)}>Cancel</button>
            <button className="btn secondary" disabled={!!busy} onClick={() => save(false)}>{busy === 'save' ? <Spinner /> : <Save size={17} />}Save draft</button>
            <button className="btn" disabled={!!busy} onClick={() => save(true)}>{busy === 'submit' ? <Spinner /> : <Send size={17} />}Submit for review</button>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 20 }}>
          <Card title="Risk preview" sub="Updates as you fill the form">
            {!risk ? <div className="skel" /> : <>
              <div className="row between"><div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.02em' }}>{risk.score}<span className="mute" style={{ fontSize: 15, fontWeight: 500 }}>/100</span></div><Badge v={risk.level} /></div>
              <div className="gauge"><i style={{ width: `${risk.score}%`, background: LVL[risk.level] }} /></div>
              {risk.factors.map((x, i) => <div key={i} className="factor"><span>{x.label}</span><b>+{x.points}</b></div>)}
              {risk.requires_cab && <div style={{ marginTop: 14 }}><Alert kind="warn"><b>CAB review required.</b> High-risk changes need Change Advisory Board sign-off recorded at approval.</Alert></div>}
              <p className="mute small" style={{ marginBottom: 0 }}><ShieldAlert size={12} style={{ verticalAlign: -1 }} /> Transparent rule-based score, a decision aid and not a prediction.</p></>}
          </Card>
        </div>
      </div>
    </>
  )
}
