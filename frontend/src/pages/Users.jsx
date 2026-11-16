import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Avatar, Badge, Card, Field, Modal, PageHeader, Skeleton, Spinner, useToast } from '../components'
import { ROLES } from '../constants'

const blank = { full_name: '', email: '', password: '', role: ROLES[0] }

export default function Users() {
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [show, setShow] = useState(false)
  const [f, setF] = useState(blank)
  const [errs, setErrs] = useState({})
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api('/users').then(setRows).catch((e) => toast.error(e.message)), [toast])
  useEffect(() => { load() }, [load])
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErrs({ ...errs, [k]: '' }) }
  const upd = async (u, body, msg) => { try { await api(`/users/${u.id}`, { method: 'PUT', body }); toast.success(msg); load() } catch (e) { toast.error(e.message) } }

  const add = async () => {
    const e = {}
    if (!f.full_name.trim()) e.full_name = 'Required'
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email'
    if (f.password.length < 8) e.password = 'At least 8 characters'
    setErrs(e); if (Object.keys(e).length) return
    setBusy(true)
    try { await api('/users', { method: 'POST', body: f }); toast.success('User created'); setShow(false); setF(blank); load() } catch (x) { toast.error(x.message) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="Users & roles" sub="Control who can raise, review, approve and administer changes." actions={<button className="btn" onClick={() => setShow(true)}><Plus size={18} />Add user</button>} />
      <Card flush>
        {!rows ? <Skeleton rows={6} /> : <div className="tblwrap"><table className="tbl"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Active</th></tr></thead><tbody>
          {rows.map((u) => <tr key={u.id}>
            <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar name={u.full_name} /><div><div className="title">{u.full_name}{u.id === user.id && <span className="mute"> (you)</span>}</div><div className="sub">{u.email}</div></div></div></td>
            <td><select style={{ width: 190 }} value={u.role} disabled={u.id === user.id} onChange={(e) => upd(u, { role: e.target.value }, `Role updated to ${e.target.value}`)} aria-label={`Role for ${u.full_name}`}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
            <td><Badge v={u.active ? 'Active' : 'Inactive'} tone={u.active ? 'ok' : 'neutral'} /></td>
            <td><button className={`toggle ${u.active ? 'on' : ''}`} disabled={u.id === user.id} onClick={() => upd(u, { active: !u.active }, u.active ? 'User deactivated' : 'User activated')} role="switch" aria-checked={u.active} aria-label={`Toggle ${u.full_name}`} /></td></tr>)}
        </tbody></table></div>}
      </Card>
      {show && <Modal title="Add user" onClose={() => setShow(false)} footer={<><button className="btn secondary" onClick={() => setShow(false)}>Cancel</button><button className="btn" disabled={busy} onClick={add}>{busy && <Spinner />}Create user</button></>}>
        <div className="stack" style={{ gap: 16, paddingBottom: 8 }}>
          <Field label="Full name" req error={errs.full_name}><input value={f.full_name} onChange={set('full_name')} autoFocus /></Field>
          <Field label="Email" req error={errs.email}><input type="email" value={f.email} onChange={set('email')} /></Field>
          <Field label="Temporary password" req error={errs.password}><input type="password" value={f.password} onChange={set('password')} /></Field>
          <Field label="Role" req><select value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        </div></Modal>}
    </>
  )
}
