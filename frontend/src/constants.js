export const CATEGORIES = ['Parameter', 'Product/GL Configuration', 'Interface/API', 'Batch Job', 'Database', 'Patch']
export const ENVS = ['Development', 'SIT', 'UAT', 'Production']
export const TYPES = ['Standard', 'Normal', 'Emergency']
export const STATUSES = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Returned', 'Implemented', 'Monitoring', 'Closed']
export const SYSTEMS = {
  'Finacle Core Banking': ['CASA', 'Loans', 'GL', 'EOD Batch', 'Treasury'],
  'Finacle Internet Banking': ['Transfers', 'Bill Payments', 'Onboarding'],
  'Finacle Interface Hub': ['NIP Gateway', 'Card Switch', 'Mobile API'],
}
export const INCIDENT_TYPES = ['Batch Failure', 'Reconciliation', 'Interface Failure', 'GL Issue', 'Transaction Failure', 'Performance', 'Other']
export const ROLES = ['Support Engineer', 'Reviewer', 'Approver', 'Administrator']
export const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export const timeAgo = (d) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(d)) / 1000))
  const t = [[31536000, 'y'], [2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']]
  for (const [n, u] of t) if (s >= n) return `${Math.floor(s / n)}${u} ago`
  return 'just now'
}
export const initials = (n = '') => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
export const TONE = {
  Approved: 'ok', Successful: 'ok', Low: 'ok', Resolved: 'ok', Recommended: 'ok',
  Rejected: 'bad', Failed: 'bad', High: 'bad', P1: 'bad',
  'Rolled Back': 'warn', Medium: 'warn', Returned: 'warn', P2: 'warn', 'In Progress': 'warn',
  Submitted: 'info', 'Under Review': 'info', Implemented: 'info', Open: 'info', Auto: 'info', Emergency: 'bad',
  Monitoring: 'purple',
}
