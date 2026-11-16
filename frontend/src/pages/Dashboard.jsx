import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, Line } from 'react-chartjs-2'
import { BarElement, CategoryScale, Chart, Filler, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, GitPullRequest, Inbox, Table2, BarChart3, TrendingDown } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Alert, Badge, Card, Empty, PageHeader, Skeleton } from '../components'
import { timeAgo } from '../constants'

Chart.register(BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip)
Chart.defaults.font.family = "'Inter Variable', system-ui, sans-serif"
Chart.defaults.font.size = 12
Chart.defaults.color = '#64748b'
Chart.defaults.plugins.tooltip.backgroundColor = '#0f172a'
Chart.defaults.plugins.tooltip.padding = 10
Chart.defaults.plugins.tooltip.cornerRadius = 8
Chart.defaults.plugins.tooltip.displayColors = false

const BLUE = '#2a78d6'
const RISK = { Low: '#1baf7a', Medium: '#eda100', High: '#e34948' }
const grid = { color: '#eef0f3', drawTicks: false }
const base = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } } }
const vOpts = { ...base, scales: { x: { grid: { display: false }, border: { display: false } }, y: { beginAtZero: true, grid, border: { display: false }, ticks: { precision: 0, padding: 8 } } } }
const hOpts = { ...base, indexAxis: 'y', scales: { y: { grid: { display: false }, border: { display: false } }, x: { beginAtZero: true, grid, border: { display: false }, ticks: { precision: 0 } } } }
const barSet = (rows, color = BLUE) => ({ labels: rows.map((r) => r.label), datasets: [{ data: rows.map((r) => r.value), backgroundColor: typeof color === 'function' ? rows.map((r) => color(r.label)) : color, borderRadius: 5, borderSkipped: false, maxBarThickness: 30 }] })

function ChartCard({ title, sub, rows, children, unit = 'Changes', tall }) {
  const [table, setTable] = useState(false)
  return (
    <Card title={title} sub={sub} actions={
      <button className="btn ghost sm" onClick={() => setTable(!table)} title={table ? 'Show chart' : 'Show data table'}>{table ? <BarChart3 size={16} /> : <Table2 size={16} />}{table ? 'Chart' : 'Table'}</button>}>
      {table
        ? <div className="tblwrap" style={{ maxHeight: 260, overflow: 'auto' }}><table className="tbl"><thead><tr><th>Label</th><th>{unit}</th></tr></thead><tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td>{r.value}</td></tr>)}</tbody></table></div>
        : <div className="chartbox" style={tall ? { height: 320 } : undefined}>{children}</div>}
    </Card>
  )
}

const Kpi = ({ icon: Ic, l, v, s, tone }) => (
  <div className="card kpi"><div className="ic" style={tone}><Ic size={20} /></div><div><div className="l">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div></div>
)

function Attention({ user }) {
  const nav = useNavigate()
  const [items, setItems] = useState(null)
  useEffect(() => {
    const need = { 'Support Engineer': [['Returned', 'Returned for rework'], ['Approved', 'Approved – ready to implement'], ['Monitoring', 'In monitoring – close when stable']],
      Reviewer: [['Submitted', 'Awaiting your review']], Approver: [['Under Review', 'Awaiting your decision']],
      Administrator: [['Submitted', 'Awaiting review'], ['Under Review', 'Awaiting approval']] }[user.role]
    Promise.all(need.map(([s, why]) => api(`/changes?status=${encodeURIComponent(s)}`).then((r) => r.map((c) => ({ ...c, why })))))
      .then((all) => setItems(all.flat().filter((c) => user.role !== 'Support Engineer' ? c.requester_id !== user.id : c.requester_id === user.id).slice(0, 4)))
      .catch(() => setItems([]))
  }, [user])
  return (
    <Card title="Needs your attention" sub={`Work waiting on you as ${user.role}`} flush>
      {!items ? <Skeleton rows={3} /> : !items.length
        ? <Empty icon={CheckCircle2} title="You're all caught up" text="Nothing is waiting on you right now." />
        : items.map((c) => (
          <div key={c.id} className="attn" onClick={() => nav(`/changes/${c.id}`)}>
            <Badge v={c.risk_level} />
            <div style={{ flex: 1, minWidth: 0 }}><div className="title" style={{ fontWeight: 580 }}>{c.ref} · {c.title}</div><div className="mute small">{c.why} · {timeAgo(c.updated_at)}</div></div>
            <ArrowRight size={16} className="mute" />
          </div>))}
    </Card>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('/analytics/summary').then(setD).catch((e) => setErr(e.message)) }, [])
  const line = useMemo(() => d && ({ labels: d.monthly.map((r) => new Date(r.label + '-01').toLocaleString('en', { month: 'short', year: '2-digit' })), datasets: [{ data: d.monthly.map((r) => r.value), borderColor: BLUE, backgroundColor: 'rgba(42,120,214,.12)', fill: true, tension: 0.35, pointRadius: 3.5, pointBackgroundColor: BLUE, pointBorderColor: '#fff', pointBorderWidth: 2 }] }), [d])
  if (err) return <Alert>{err}</Alert>
  if (!d) return <><PageHeader title="Dashboard" /><div className="grid g4 mb">{[1, 2, 3, 4].map((i) => <div key={i} className="card"><Skeleton rows={3} /></div>)}</div></>
  const t = d.totals, cfr = d.changeFailureRate
  const riskRows = ['Low', 'Medium', 'High'].map((k) => d.byRisk.find((r) => r.label === k) || { label: k, value: 0 })
  return (
    <>
      <PageHeader title={`Welcome back, ${user.name.split(' ')[0]}`} sub="Overview of change activity and change-related incidents (synthetic data)." />
      <div className="grid g4 mb">
        <Kpi icon={GitPullRequest} l="Total changes" v={t.total} s={`${t.pending} awaiting review or approval`} />
        <Kpi icon={TrendingDown} l="Change failure rate" v={`${cfr.percent}%`} s={`${cfr.failed} of ${cfr.implemented} implemented · ${cfr.directPercent}% failed or rolled back`} tone={{ background: '#fde8e6', color: '#b42318' }} />
        <Kpi icon={Clock} l="Avg approval turnaround" v={d.turnaround.avg_hours != null ? `${d.turnaround.avg_hours}h` : '—'} s={`median ${d.turnaround.median_hours ?? '—'}h, submission to decision`} tone={{ background: '#fff3d6', color: '#9a5b00' }} />
        <Kpi icon={AlertTriangle} l="Change-linked incidents" v={t.linked_incidents} s={`of ${t.incidents} total incidents`} tone={{ background: '#eee9fd', color: '#5b3fc4' }} />
      </div>

      <div className="grid main-side mb" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
        <ChartCard tall title="Monthly change volume" sub="Change requests created per month" rows={d.monthly}><Line data={line} options={vOpts} /></ChartCard>
        <Attention user={user} />
      </div>

      <div className="grid g2 mb">
        <ChartCard title="Incident-prone modules" sub="Distinct incidents linked to changes, by application / module" rows={d.incidentProne} unit="Incidents">
          <Bar data={barSet(d.incidentProne)} options={hOpts} /></ChartCard>
        <ChartCard title="Changes by status" sub="Current position in the lifecycle" rows={d.byStatus}><Bar data={barSet(d.byStatus)} options={hOpts} /></ChartCard>
        <ChartCard title="Changes by category" rows={d.byCategory}><Bar data={barSet(d.byCategory)} options={hOpts} /></ChartCard>
        <ChartCard title="Changes by risk level" sub="Rule-based risk score" rows={riskRows}>
          <Bar data={barSet(riskRows, (l) => RISK[l])} options={vOpts} /></ChartCard>
      </div>
      <Alert kind="info">Change failure rate = implemented changes that were recorded as failed or rolled back, plus those with a P1/P2 incident linked to them, divided by all implemented changes. Links are made within {d.correlationWindowHours}h of implementation on the same application and module and indicate proximity, not proven causation.</Alert>
    </>
  )
}
