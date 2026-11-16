import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Plus, Search } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert, Badge, Card, Drawer, Empty, Field, Modal, PageHeader, Skeleton, Spinner, useToast } from '../components'
import { INCIDENT_TYPES, SYSTEMS, fmt, timeAgo } from '../constants'

const blank = { title: '', description: '', application: Object.keys(SYSTEMS)[0], module: SYSTEMS[Object.keys(SYSTEMS)[0]][0], bank_instance: '', priority: 'P3', incident_type: 'Other', opened_at: '' }
const TABS = [['all', 'All', () => true], ['active', 'Active', (i) => ['Open', 'In Progress'].includes(i.status)], ['resolved', 'Resolved / closed', (i) => ['Resolved', 'Closed'].includes(i.status)], ['linked', 'Linked to a change', (i) => i.change_count > 0]]

export default function Incidents() {
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [show, setShow] = useState(false)
  const [f, setF] = useState(blank)
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const can = user.role === 'Support Engineer'
  const load = useCallback(() => api('/incidents').then(setRows).catch((e) => toast.error(e.message)), [toast])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k, , fn]) => [k, (rows || []).filter(fn).length])), [rows])
  const shown = useMemo(() => (rows || []).filter(TABS.find((t) => t[0] === tab)[2]).filter((i) => !q || `${i.ref} ${i.title} ${i.module}`.toLowerCase().includes(q.toLowerCase())), [rows, tab, q])
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErrs({ ...errs, [k]: '' }) }

  const save = async () => {
    if (!f.title.trim()) { setErrs({ title: 'Title is required' }); return }
    setBusy(true)
    try {
      const r = await api('/incidents', { method: 'POST', body: { ...f, opened_at: f.opened_at ? new Date(f.opened_at).toISOString() : undefined } })
      toast.success(r.auto_linked ? `Incident logged and auto-linked to ${r.auto_linked} recent change(s)` : 'Incident logged')
      setShow(false); setF(blank); load()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  const view = async (id) => setOpen(await api(`/incidents/${id}`))
  const status = async (s) => { await api(`/incidents/${open.id}/status`, { method: 'PUT', body: { status: s } }); toast.success(`Marked ${s}`); load(); setOpen(await api(`/incidents/${open.id}`)) }

  return (
    <>
      <PageHeader title="Incidents" sub="Operational incidents, and the changes they may be related to." actions={can && <button className="btn" onClick={() => setShow(true)}><Plus size={18} />Log incident</button>} />
      <Card flush>
        <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}<span className="n">{counts[k]}</span></button>)}</div>
        <div className="toolbar"><div className="inputicon"><Search size={17} /><input placeholder="Search incidents…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search incidents" /></div></div>
        {!rows ? <Skeleton rows={6} /> : !shown.length ? <Empty icon={AlertTriangle} title="No incidents found" text="Nothing matches this view." /> :
          <div className="tblwrap"><table className="tbl"><thead><tr><th>Incident</th><th className="hide-sm">System</th><th>Priority</th><th>Status</th><th className="hide-sm">Related changes</th><th className="hide-sm">Opened</th></tr></thead><tbody>
            {shown.map((i) => <tr key={i.id} className="click" onClick={() => view(i.id)}>
              <td style={{ maxWidth: 360 }}><div className="title">{i.title}</div><div className="ref">{i.ref} · {i.incident_type}</div></td>
              <td className="hide-sm nw"><div>{i.application.replace('Finacle ', '')}</div><div className="sub">{i.module}</div></td>
              <td><Badge v={i.priority} /></td><td><Badge v={i.status} /></td>
              <td className="hide-sm">{i.change_count ? <span className="badge t-info">{i.change_count} linked</span> : <span className="mute">—</span>}</td>
              <td className="nowrap hide-sm" title={fmt(i.opened_at)}>{timeAgo(i.opened_at)}</td></tr>)}</tbody></table></div>}
      </Card>

      {open && <Drawer onClose={() => setOpen(null)} header={<><div className="ref" style={{ color: 'var(--mute)', fontSize: 13 }}>{open.ref}</div><h3 style={{ fontSize: 18, margin: '2px 0 8px' }}>{open.title}</h3><div className="row" style={{ gap: 8 }}><Badge v={open.priority} /><Badge v={open.status} /></div></>}>
        <dl className="dl mb"><div><dt>System</dt><dd>{open.application}<br /><span className="mute">{open.module}</span></dd></div><div><dt>Type</dt><dd>{open.incident_type}</dd></div>
          <div><dt>Opened</dt><dd>{fmt(open.opened_at)}</dd></div><div><dt>Resolved</dt><dd>{open.resolved_at ? fmt(open.resolved_at) : '—'}</dd></div>
          {open.description && <div className="full"><dt>Description</dt><dd>{open.description}</dd></div>}</dl>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Related changes</h3>
        {!open.changes.length ? <p className="mute">No changes linked to this incident.</p> : open.changes.map((c) => (
          <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}><Link to={`/changes/${c.id}`}><b>{c.ref}</b> · {c.title}</Link>
            <div className="row" style={{ gap: 8, margin: '4px 0' }}><Badge v={c.status} /><Badge v={c.link_source} dot={false} /></div><div className="mute small">{c.match_reason}</div></div>))}
        {can && <><h3 style={{ fontSize: 15, margin: '22px 0 10px' }}>Update status</h3>
          <div className="row">{['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => <button key={s} disabled={open.status === s} className="btn secondary sm" onClick={() => status(s)}>{s}</button>)}</div></>}
      </Drawer>}

      {show && <Modal wide title="Log incident" sub="Matching recently implemented changes are linked automatically." onClose={() => setShow(false)}
        footer={<><button className="btn secondary" onClick={() => setShow(false)}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{busy && <Spinner />}Log incident</button></>}>
        <div className="fgrid" style={{ paddingBottom: 8 }}>
          <Field label="Title" req full error={errs.title}><input value={f.title} onChange={set('title')} autoFocus /></Field>
          <Field label="Description" full><textarea rows="2" value={f.description} onChange={set('description')} /></Field>
          <Field label="Application" req><select value={f.application} onChange={(e) => setF({ ...f, application: e.target.value, module: SYSTEMS[e.target.value][0] })}>{Object.keys(SYSTEMS).map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Module" req><select value={f.module} onChange={set('module')}>{SYSTEMS[f.application].map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Priority" req><select value={f.priority} onChange={set('priority')}>{['P1', 'P2', 'P3', 'P4'].map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Type"><select value={f.incident_type} onChange={set('incident_type')}>{INCIDENT_TYPES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Bank instance"><input value={f.bank_instance} onChange={set('bank_instance')} /></Field>
          <Field label="Opened at" hint="Leave blank for now"><input type="datetime-local" value={f.opened_at} onChange={set('opened_at')} /></Field>
        </div></Modal>}
    </>
  )
}
