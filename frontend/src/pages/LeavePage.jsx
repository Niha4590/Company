import { useEffect, useState } from 'react';
import { leaveApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';

export default function LeavePage() {
  const { hasRole } = useAuth();
  const canReview = hasRole('super_admin', 'hr', 'manager');
  const [types, setTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
  const [status, setStatus] = useState('');

  const load = () => {
    leaveApi.types().then(({ data }) => setTypes(data.data || [])).catch(() => {});
    leaveApi.balances().then(({ data }) => setBalances(data.data || [])).catch(() => {});
    leaveApi.requests({ status }).then(({ data }) => setRequests(data.data || [])).catch(() => toast.error('Failed to load leaves'));
  };

  useEffect(() => { load(); }, [status]);

  const apply = async (e) => {
    e.preventDefault();
    try {
      await leaveApi.apply(form);
      toast.success('Leave applied');
      setForm({ leave_type_id: '', from_date: '', to_date: '', reason: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const review = async (id, next) => {
    const comments = window.prompt('Comments (optional)') || '';
    try {
      await leaveApi.review(id, { status: next, reviewer_comments: comments });
      toast.success(`Leave ${next}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const cancel = async (id) => {
    try {
      await leaveApi.cancel(id);
      toast.success('Cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave</h1>
          <p className="page-subtitle">Balances, applications and approvals</p>
        </div>
        <select className="select-control w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All requests</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {balances.map((b) => (
          <div key={b.id} className="card p-4">
            <p className="text-xs text-slate-500">{b.leave_types?.name}</p>
            <p className="text-2xl font-bold">{b.remaining_days}</p>
            <p className="text-xs text-slate-400">of {b.total_days} · used {b.used_days}</p>
          </div>
        ))}
      </div>

      <form onSubmit={apply} className="card grid grid-cols-1 md:grid-cols-2 gap-3">
        <h2 className="font-semibold col-span-full">Apply for leave</h2>
        <select className="select-control" required value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
          <option value="">Leave type</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input type="date" className="form-control" required value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} />
        <input type="date" className="form-control" required value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} />
        <textarea className="form-control md:col-span-2" rows={2} placeholder="Reason" required minLength={5} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <button className="btn-primary btn">Submit application</button>
      </form>

      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td>{r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : '—'}</td>
                <td>{r.leave_types?.name}</td>
                <td>{r.from_date}</td>
                <td>{r.to_date}</td>
                <td>{r.total_days}</td>
                <td><StatusBadge status={r.status} /></td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    {canReview && r.status === 'pending' && (
                      <>
                        <button className="btn-success btn-sm btn" onClick={() => review(r.id, 'approved')}>Approve</button>
                        <button className="btn-danger btn-sm btn" onClick={() => review(r.id, 'rejected')}>Reject</button>
                      </>
                    )}
                    {r.status === 'pending' && (
                      <button className="btn-ghost btn-sm btn" onClick={() => cancel(r.id)}>Cancel</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
