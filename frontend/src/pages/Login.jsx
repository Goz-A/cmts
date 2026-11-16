import { useState } from 'react'
import { BarChart3, ClipboardCheck, Eye, EyeOff, GitMerge, Lock, Mail, ShieldCheck, UserCog, UserRound, UserCheck, Wrench } from 'lucide-react'
import { useAuth } from '../auth'
import { Alert, Spinner } from '../components'

const DEMO = [
  { role: 'Support Engineer', email: 'engineer1@cmts.local', icon: Wrench, d: 'Raise & implement' },
  { role: 'Reviewer', email: 'reviewer1@cmts.local', icon: UserCheck, d: 'Review requests' },
  { role: 'Approver', email: 'approver1@cmts.local', icon: ClipboardCheck, d: 'Approve / reject' },
  { role: 'Administrator', email: 'admin@cmts.local', icon: UserCog, d: 'Manage users' },
]

export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const go = async (e, p) => {
    setErr(''); setBusy(true)
    try { await login(e, p) } catch (x) { setErr(x.message); setBusy(false) }
  }
  const submit = (e) => { e.preventDefault(); go(email, password) }

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="brand"><div className="logo"><ShieldCheck size={20} /></div><div><b>CMTS</b><span>Change Management &amp; Tracking</span></div></div>
        <h1>Every change, traced to its outcome.</h1>
        <p className="lead">A single source of truth for core banking application support: request, approve, implement and learn from every change.</p>
        <div className="feat"><div className="fi"><ClipboardCheck size={20} /></div><div><b>Controlled approvals</b><span>Role-based review and approval, with CAB sign-off for high-risk changes.</span></div></div>
        <div className="feat"><div className="fi"><GitMerge size={20} /></div><div><b>Change–incident traceability</b><span>See what changed before an incident, who approved it, and what happened next.</span></div></div>
        <div className="feat"><div className="fi"><BarChart3 size={20} /></div><div><b>Evidence-based analytics</b><span>Change failure rate, approval turnaround and incident-prone modules.</span></div></div>
        <div className="foot">Academic prototype · MIVA University · All data shown is synthetic</div>
      </section>

      <section className="auth-form">
        <div className="auth-box">
          <h2>Welcome back</h2>
          <p>Sign in to your CMTS workspace.</p>
          <form onSubmit={submit} className="stack" style={{ gap: 16 }}>
            {err && <Alert>{err}</Alert>}
            <div className="field"><label htmlFor="em">Email</label>
              <div className="inputicon"><Mail size={17} /><input id="em" type="email" autoComplete="username" autoFocus placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></div>
            <div className="field"><label htmlFor="pw">Password</label>
              <div className="inputicon"><Lock size={17} /><input id="pw" type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="iconbtn eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></div>
            <button className="btn lg block" disabled={busy}>{busy ? <Spinner /> : null}Sign in</button>
          </form>

          <div className="divider">Demo accounts</div>
          <div className="demo">
            {DEMO.map((d) => (
              <button key={d.role} type="button" disabled={busy} onClick={() => go(d.email, 'Password123!')}>
                <span className="di"><d.icon size={16} /></span><span><b>{d.role}</b><span>{d.d}</span></span>
              </button>))}
          </div>
          <p className="mute small" style={{ textAlign: 'center', marginTop: 16 }}><UserRound size={12} style={{ verticalAlign: -1 }} /> One click signs you in with sample credentials.</p>
        </div>
      </section>
    </div>
  )
}
