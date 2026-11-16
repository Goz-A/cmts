import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, Link } from 'react-router-dom'
import { AlertTriangle, Bell, GitPullRequest, LayoutDashboard, LogOut, Menu, Plus, ShieldCheck, Users as UsersIcon } from 'lucide-react'
import { useAuth } from './auth'
import { api } from './api'
import { Avatar } from './components'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Changes from './pages/Changes'
import ChangeForm from './pages/ChangeForm'
import ChangeDetail from './pages/ChangeDetail'
import Incidents from './pages/Incidents'
import Notifications from './pages/Notifications'
import Users from './pages/Users'

const TITLES = { '/': 'Dashboard', '/changes': 'Changes', '/incidents': 'Incidents', '/notifications': 'Notifications', '/users': 'Users' }

function Shell({ children }) {
  const { user, logout } = useAuth()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => {
    setOpen(false)
    api('/notifications').then((n) => setUnread(n.filter((x) => !x.is_read).length)).catch(() => {})
  }, [loc.pathname])
  const canCreate = user.role === 'Support Engineer'
  const L = ({ to, icon: Ic, children, end, count }) => (
    <NavLink to={to} end={end}><Ic size={19} /><span>{children}</span>{count > 0 && <span className="count">{count}</span>}</NavLink>
  )
  const title = TITLES['/' + loc.pathname.split('/')[1]] || 'CMTS'
  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><div className="logo"><ShieldCheck size={20} /></div><div><b>CMTS</b><span>Change Tracking</span></div></div>
        {canCreate && <Link to="/changes/new" className="btn newbtn"><Plus size={18} />New change</Link>}
        <div className="navgroup">Workspace</div>
        <nav className="nav">
          <L to="/" icon={LayoutDashboard} end>Dashboard</L>
          <L to="/changes" icon={GitPullRequest}>Changes</L>
          <L to="/incidents" icon={AlertTriangle}>Incidents</L>
          <L to="/notifications" icon={Bell} count={unread}>Notifications</L>
        </nav>
        {user.role === 'Administrator' && <>
          <div className="navgroup">Administration</div>
          <nav className="nav"><L to="/users" icon={UsersIcon}>Users &amp; roles</L></nav></>}
        <div className="usercard">
          <Avatar name={user.name} />
          <div className="who"><b>{user.name}</b><span>{user.role}</span></div>
          <button className="iconbtn" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      <div className="content">
        <div className="topbar"><button className="iconbtn" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={22} /></button><b>{title}</b></div>
        <main className="page">{children}</main>
      </div>
    </div>
  )
}

export default function App() {
  const { user, ready } = useAuth()
  useEffect(() => { document.title = 'CMTS · Change Management & Tracking' }, [])
  if (!ready) return null
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/changes/new" element={<ChangeForm />} />
        <Route path="/changes/:id/edit" element={<ChangeForm />} />
        <Route path="/changes/:id" element={<ChangeDetail />} />
        <Route path="/incidents" element={<Incidents />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/users" element={user.role === 'Administrator' ? <Users /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Shell>
  )
}
