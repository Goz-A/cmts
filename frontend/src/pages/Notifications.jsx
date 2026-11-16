import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, GitPullRequest } from 'lucide-react'
import { api } from '../api'
import { Card, Empty, PageHeader, Skeleton, useToast } from '../components'
import { timeAgo } from '../constants'

export default function Notifications() {
  const nav = useNavigate()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  useEffect(() => { api('/notifications').then(setRows) }, [])
  const markAll = async () => { await api('/notifications/read', { method: 'POST', body: {} }); setRows(rows.map((r) => ({ ...r, is_read: true }))); toast.success('All marked as read') }
  const unread = (rows || []).filter((r) => !r.is_read).length
  return (
    <>
      <PageHeader title="Notifications" sub={rows ? `${unread} unread` : ''} actions={<button className="btn secondary" disabled={!unread} onClick={markAll}><CheckCheck size={17} />Mark all as read</button>} />
      <Card flush>
        {!rows ? <Skeleton rows={5} /> : !rows.length ? <Empty icon={Bell} title="No notifications" text="Workflow updates will appear here." /> :
          rows.map((n) => (
            <div key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`} onClick={() => n.change_id && nav(`/changes/${n.change_id}`)}>
              <div className="nic"><GitPullRequest size={18} /></div>
              <div style={{ flex: 1 }}><b style={{ fontWeight: n.is_read ? 500 : 620 }}>{n.message}</b><div className="mute small">{timeAgo(n.created_at)}</div></div>
            </div>))}
      </Card>
    </>
  )
}
