const MAP = {
  active: 'badge-green',
  inactive: 'badge-gray',
  resigned: 'badge-yellow',
  terminated: 'badge-red',
  present: 'badge-green',
  absent: 'badge-red',
  late: 'badge-yellow',
  half_day: 'badge-purple',
  on_leave: 'badge-blue',
  holiday: 'badge-gray',
  pending: 'badge-yellow',
  approved: 'badge-green',
  rejected: 'badge-red',
  cancelled: 'badge-gray',
  draft: 'badge-gray',
  review: 'badge-yellow',
  paid: 'badge-green',
  submitted: 'badge-blue',
  accepted: 'badge-green',
  withdrawn: 'badge-gray',
  completed: 'badge-blue',
  cleared: 'badge-green',
};

export default function StatusBadge({ status }) {
  if (!status) return <span className="badge-gray">—</span>;
  return <span className={MAP[status] || 'badge-gray'}>{String(status).replace(/_/g, ' ')}</span>;
}
