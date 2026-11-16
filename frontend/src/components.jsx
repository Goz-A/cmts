import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Check, CheckCircle2, ChevronRight, Loader2, X } from 'lucide-react'
import { TONE, initials } from './constants'

export const Badge = ({ v, dot = true, tone }) =>
  v ? <span className={`badge ${dot ? 'dot' : ''} t-${tone || TONE[v] || 'neutral'}`}>{v}</span> : null

export const Avatar = ({ name, sm }) => <span className={`avatar ${sm ? 'sm' : ''}`} title={name}>{initials(name)}</span>
export const Spinner = ({ size = 16 }) => <Loader2 size={size} className="spin" />

export function Alert({ kind = 'bad', children }) {
  if (!children) return null
  const Ic = kind === 'ok' ? CheckCircle2 : AlertCircle
  return <div className={`alert ${kind}`} role="alert"><Ic size={18} style={{ marginTop: 1 }} /><div>{children}</div></div>
}

export function PageHeader({ title, sub, actions, crumbs }) {
  return (
    <>
      {crumbs && <nav className="crumbs">{crumbs.map(([l, to], i) => (
        <span key={i} className="row" style={{ gap: 6 }}>{to ? <Link to={to}>{l}</Link> : <span>{l}</span>}{i < crumbs.length - 1 && <ChevronRight size={14} />}</span>))}</nav>}
      <div className="phead"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{actions && <div className="actions">{actions}</div>}</div>
    </>
  )
}

export function Card({ title, sub, actions, flush, children, className = '' }) {
  return (
    <section className={`card ${flush ? 'flush' : ''} ${className}`}>
      {(title || actions) && <div className="chead"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{actions}</div>}
      <div className="cbody">{children}</div>
    </section>
  )
}

export const Empty = ({ icon: Ic, title, text, children }) => (
  <div className="empty">{Ic && <div className="ei"><Ic size={22} /></div>}<b>{title}</b><div>{text}</div>{children && <div style={{ marginTop: 14 }}>{children}</div>}</div>
)

export const Skeleton = ({ rows = 5 }) => (
  <div style={{ padding: 20, display: 'grid', gap: 16 }}>{Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" style={{ width: `${95 - (i % 3) * 18}%` }} />)}</div>
)

export function Field({ label, req, hint, error, full, children }) {
  return (
    <div className={`field ${full ? 'full' : ''} ${error ? 'invalid' : ''}`}>
      <label>{label}{req && <span className="req"> *</span>}</label>
      {children}
      {error ? <span className="errtxt">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  )
}

/* ---------- toasts ---------- */
const ToastCtx = createContext(null)
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((kind, msg) => {
    const id = Math.random()
    setItems((l) => [...l, { id, kind, msg }])
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 4200)
  }, [])
  const api = { success: (m) => push('ok', m), error: (m) => push('bad', m) }
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">{items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>{t.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<div>{t.msg}</div></div>))}</div>
    </ToastCtx.Provider>
  )
}

/* ---------- modal & drawer ---------- */
function useEsc(onClose) {
  useEffect(() => { const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
}
export function Modal({ title, sub, onClose, children, footer, wide }) {
  useEsc(onClose)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh"><div><h3>{title}</h3>{sub && <p className="mute" style={{ margin: '4px 0 0' }}>{sub}</p>}</div><button className="iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="mb2">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  )
}
export function Drawer({ onClose, header, children }) {
  useEsc(onClose)
  return (
    <div className="overlay drawer-o" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="dh row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}><div style={{ minWidth: 0 }}>{header}</div><button className="iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="db">{children}</div>
      </aside>
    </div>
  )
}

/* Decision dialog: collects a comment (optionally required) before an irreversible workflow action */
export function DecisionModal({ cfg, onClose, onConfirm }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef()
  useEffect(() => ref.current?.focus(), [])
  const missing = cfg.required && !text.trim()
  const go = async () => { setBusy(true); try { await onConfirm(text) } finally { setBusy(false) } }
  return (
    <Modal title={cfg.title} sub={cfg.sub} onClose={onClose} footer={<>
      <button className="btn secondary" onClick={onClose}>Cancel</button>
      <button className={`btn ${cfg.danger ? 'danger' : ''}`} disabled={missing || busy} onClick={go}>{busy && <Spinner />}{cfg.confirm}</button></>}>
      {cfg.notice && <div style={{ marginBottom: 14 }}><Alert kind="warn">{cfg.notice}</Alert></div>}
      <Field label={cfg.label || 'Comment'} req={cfg.required} hint={cfg.hint}>
        <textarea ref={ref} rows="4" value={text} onChange={(e) => setText(e.target.value)} placeholder={cfg.placeholder} />
      </Field>
    </Modal>
  )
}

/* ---------- lifecycle stepper ---------- */
const STEPS = ['Draft', 'Submitted', 'Review', 'Approved', 'Monitoring', 'Closed']
const POS = { Draft: 0, Returned: 0, Submitted: 1, 'Under Review': 2, Rejected: 2, Approved: 3, Implemented: 4, Monitoring: 4, Closed: 5 }
export function Stepper({ status }) {
  const cur = POS[status] ?? 0
  return (
    <div className="stepper" aria-label={`Lifecycle: ${status}`}>
      {STEPS.map((s, i) => {
        let cls = i < cur ? 'done' : i === cur ? 'cur' : ''
        if (status === 'Closed') cls = 'done'
        if (i === cur && status === 'Rejected') cls = 'stop'
        if (i === cur && status === 'Returned') cls = 'ret'
        const label = i === cur && status === 'Rejected' ? 'Rejected' : i === cur && status === 'Returned' ? 'Returned' : s
        return (
          <div key={s} className={`step ${cls}`}>
            <span className="dotc">{cls === 'done' ? <Check size={15} /> : cls === 'stop' ? <X size={15} /> : i + 1}</span>
            <span className="nm">{label}</span>
            {i < STEPS.length - 1 && <span className="bar" />}
          </div>
        )
      })}
    </div>
  )
}
