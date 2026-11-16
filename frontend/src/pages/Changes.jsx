import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronLeft, ChevronRight, GitPullRequest, Plus, Search, X } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert, Avatar, Badge, Card, Empty, PageHeader, Skeleton } from '../components'
import { CATEGORIES, ENVS, SYSTEMS, TYPES, fmt, timeAgo } from '../constants'

const TABS = [
  ['all', 'All', () => true],
  ['pending', 'In review', (c) => ['Submitted', 'Under Review'].includes(c.status)],
  ['draft', 'Draft / returned', (c) => ['Draft', 'Returned'].includes(c.status)],
  ['approved', 'Approved', (c) => c.status === 'Approved'],
  ['monitoring', 'Monitoring', (c) => c.status === 'Monitoring'],
  ['closed', 'Closed', (c) => c.status === 'Closed'],
  ['rejected', 'Rejected', (c) => c.status === 'Rejected'],
]
const PAGE = 12

export default function Changes() {
  const nav = useNavigate()
  const { user } = useAuth()
  const EMPTY = { q: '', application: '', environment: '', category: '', risk_level: '', change_type: '', requester_id: '', from: '', to: '' }
  const [f, setF] = useState(EMPTY)
  const [people, setPeople] = useState([])
  useEffect(() => { api('/users').then((u) => setPeople(u.filter((x) => x.role === 'Support Engineer'))).catch(() => {}) }, [])
  const [tab, setTab] = useState('all')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString()
      api('/changes?' + qs).then((r) => { setRows(r); setPage(0) }).catch((e) => setErr(e.message))
    }, 250)
    return () => clearTimeout(t)
  }, [f])

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k, , fn]) => [k, (rows || []).filter(fn).length])), [rows])
  const shown = useMemo(() => (rows || []).filter(TABS.find((t) => t[0] === tab)[2]), [rows, tab])
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const LABEL = { requester_id: (v) => people.find((p) => String(p.id) === String(v))?.full_name || v, from: (v) => `From ${v}`, to: (v) => `To ${v}` }
  const active = Object.entries(f).filter(([k, v]) => v && k !== 'q')
  const sel = (k, label, opts) => <select value={f[k]} onChange={set(k)} aria-label={label}><option value="">{label}</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>

  return (
    <>
      <PageHeader title="Changes" sub="Search the full history of change requests, approvals and outcomes."
        actions={user.role === 'Support Engineer' && <Link to="/changes/new" className="btn"><Plus size={18} />New change</Link>} />
      {err && <Alert>{err}</Alert>}
      <Card flush>
        <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => { setTab(k); setPage(0) }}>{l}<span className="n">{counts[k]}</span></button>)}</div>
        <div className="toolbar">
          <div className="inputicon"><Search size={17} /><input placeholder="Search by title, reference or description…" value={f.q} onChange={set('q')} aria-label="Search changes" /></div>
          {sel('application', 'Application', Object.keys(SYSTEMS))}
          {sel('environment', 'Environment', ENVS)}
          {sel('category', 'Category', CATEGORIES)}
          {sel('risk_level', 'Risk', ['Low', 'Medium', 'High'])}
          {sel('change_type', 'Type', TYPES)}
          <select value={f.requester_id} onChange={set('requester_id')} aria-label="Requester"><option value="">Requester</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
          <input type="date" value={f.from} onChange={set('from')} aria-label="Created from" title="Created from" style={{ width: 150 }} />
          <input type="date" value={f.to} onChange={set('to')} aria-label="Created to" title="Created to" style={{ width: 150 }} />
        </div>
        {active.length > 0 && <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)' }}>
          {active.map(([k, v]) => <span key={k} className="chip">{LABEL[k] ? LABEL[k](v) : v}<button onClick={() => setF({ ...f, [k]: '' })} aria-label={`Remove filter ${k}`}><X size={14} /></button></span>)}
          <button className="btn ghost sm" onClick={() => setF({ ...EMPTY, q: f.q })}>Clear filters</button></div>}
        {!rows ? <Skeleton rows={7} /> : !slice.length
          ? <Empty icon={GitPullRequest} title="No changes found" text="Try a different tab, search term or filter." />
          : <div className="tblwrap"><table className="tbl">
            <thead><tr><th>Change</th><th className="hide-sm">System</th><th className="hide-sm">Risk</th><th>Status</th><th className="hide-sm">Incidents</th><th className="hide-sm">Requester</th><th className="hide-sm">Created</th></tr></thead>
            <tbody>{slice.map((c) => (
              <tr key={c.id} className="click" onClick={() => nav(`/changes/${c.id}`)}>
                <td style={{ minWidth: 260 }}><div className="title">{c.title}</div><div className="ref">{c.ref} · {c.category}</div></td>
                <td className="hide-sm nw"><div>{c.application.replace('Finacle ', '')}</div><div className="sub">{c.module} · {c.environment}</div></td>
                <td className="hide-sm"><Badge v={c.risk_level} /></td>
                <td><div className="row" style={{ gap: 6 }}><Badge v={c.status} />{c.outcome && c.outcome !== 'Successful' && <Badge v={c.outcome} dot={false} />}</div></td>
                <td className="hide-sm">{c.incident_count > 0 ? <span className="badge t-warn"><AlertTriangle size={12} />{c.incident_count}</span> : <span className="mute">—</span>}</td>
                <td className="hide-sm"><div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><Avatar name={c.requester_name} sm /><span className="nowrap">{c.requester_name}</span></div></td>
                <td className="nowrap hide-sm" title={fmt(c.created_at)}>{timeAgo(c.created_at)}</td>
              </tr>))}</tbody></table></div>}
        {rows && shown.length > 0 && <div className="pager"><span>Showing {page * PAGE + 1}–{Math.min(shown.length, (page + 1) * PAGE)} of {shown.length}</span>
          <div className="row" style={{ gap: 6 }}><button className="btn secondary sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={16} />Prev</button>
            <button className="btn secondary sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next<ChevronRight size={16} /></button></div></div>}
      </Card>
    </>
  )
}
