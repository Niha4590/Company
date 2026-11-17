import { useState, useEffect } from 'react';
import { exitApi, employeeApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

function StatusBadge({ status }) {
  const m = {
    submitted: 'badge-yellow', accepted: 'badge-green', rejected: 'badge-red',
    withdrawn: 'badge-gray', completed: 'badge-blue',
    pending: 'badge-yellow', cleared: 'badge-green', not_applicable: 'badge-gray',
  };
  return <span className={m[status] || 'badge-gray'}>{status}</span>;
}

export default function ExitsPage() {
  const { hasRole } = useAuth();
  const isHR = hasRole('super_admin', 'hr');
  const [resignations, setResignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [employees, setEmployees] = useState([]);

  // Form state
  const [form, setForm] = useState({ employee_id: '', reason: '', notice_period_days: 30, last_working_day: '' });

  const fetchAll = () => {
    setLoading(true);
    exitApi.resignations({})
      .then(({ data }) => setResignations(data.data || []))
      .catch(() => toast.error('Failed to load resignations'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
    if (isHR) {
      employeeApi.list({ status: 'active', limit: 200 })
        .then(({ data }) => setEmployees(data.data || []))
        .catch(() => {});
    }
  }, []);

  const openDetail = async (r) => {
    try {
      const { data } = await exitApi.getResignation(r.id);
      setDetail(data.data);
    } catch { toast.error('Failed to load details'); }
  };

  const handleReview = async (status) => {
    try {
      await exitApi.review(detail.id, { status });
      toast.success(`Resignation ${status}`);
      setDetail(null);
      fetchAll();
    } catch { toast.error('Failed to update'); }
  };

  const handleClearance = async (item, status) => {
    try {
      await exitApi.updateClearance(item.id, { status });
      toast.success(`${item.department_name} ${status}`);
      openDetail(detail);
    } catch { toast.error('Failed'); }
  };

  const downloadLetter = async () => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_API_URL}/exits/resignations/${detail.id}/experience-letter`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
      );
      if (!resp.ok) throw new Error();
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: 'experience_letter.pdf' }).click();
    } catch { toast.error('Failed to generate letter'); }
  };

  const submitResignation = async () => {
    if (!form.employee_id || !form.reason) return toast.error('Employee and reason are required');
    try {
      await exitApi.submit(form);
      toast.success('Resignation submitted');
      setShowForm(false);
      setForm({ employee_id: '', reason: '', notice_period_days: 30, last_working_day: '' });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Exit Management</h1>
          <p className="page-subtitle">Resignations, clearance & final settlement</p>
        </div>
        {isHR && (
          <button onClick={() => setShowForm(true)} className="btn-primary btn">
            + New Resignation
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="card p-12 flex justify-center"><div className="spinner" /></div>
      ) : resignations.length === 0 ? (
        <div className="card empty-state">
          <span className="text-5xl mb-4">🚪</span>
          <p className="text-slate-500 font-medium">No resignation records found</p>
        </div>
      ) : (
        <div className="table-container bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Submitted</th>
                <th>Last Working Day</th>
                <th>Notice (days)</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {resignations.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="avatar w-8 h-8 text-xs">
                        {r.employees?.first_name?.[0]}{r.employees?.last_name?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{r.employees?.first_name} {r.employees?.last_name}</p>
                        <p className="text-xs text-slate-400">{r.employees?.employee_code}</p>
                      </div>
                    </div>
                  </td>
                  <td>{r.submitted_on}</td>
                  <td>{r.last_working_day}</td>
                  <td>{r.notice_period_days}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>
                    <button onClick={() => openDetail(r)} className="btn-ghost btn-sm btn">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">
                Resignation — {detail.employees?.first_name} {detail.employees?.last_name}
              </h2>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="modal-body space-y-6">
              {/* Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-slate-500">Status:</span> <StatusBadge status={detail.status} /></div>
                <div><span className="text-slate-500">Submitted:</span> {detail.submitted_on}</div>
                <div><span className="text-slate-500">Last Day:</span> {detail.last_working_day}</div>
                <div><span className="text-slate-500">Notice:</span> {detail.notice_period_days} days</div>
              </div>
              {detail.reason && (
                <div>
                  <p className="text-sm font-medium text-slate-600 mb-1">Reason</p>
                  <p className="text-sm bg-slate-50 rounded-xl p-3">{detail.reason}</p>
                </div>
              )}

              {/* Clearance */}
              {detail.clearance_items?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">🧹 Clearance Checklist</p>
                  <div className="space-y-2">
                    {detail.clearance_items.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2">
                        <div>
                          <p className="text-sm font-medium">{c.department_name}</p>
                          <p className="text-xs text-slate-400">{c.item_description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={c.status} />
                          {c.status === 'pending' && isHR && (
                            <button onClick={() => handleClearance(c, 'cleared')} className="btn-success btn-sm btn">Clear</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Asset returns */}
              {detail.asset_returns?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">📦 Asset Returns</p>
                  <div className="space-y-1">
                    {detail.asset_returns.map((a) => (
                      <div key={a.id} className="flex justify-between text-sm bg-slate-50 rounded-xl px-4 py-2">
                        <span>{a.asset_name} {a.asset_code && `(${a.asset_code})`}</span>
                        <span className="text-slate-500">{a.returned_on || 'Pending'} — {a.condition || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Settlement */}
              {detail.final_settlements?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">💵 Final Settlement</p>
                  {detail.final_settlements.map((s) => (
                    <div key={s.id} className="bg-slate-50 rounded-xl p-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-500">Total Amount</span>
                        <span className="font-bold">₹{Number(s.total_amount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Status</span>
                        <StatusBadge status={s.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {detail.status === 'accepted' && isHR && (
                <button onClick={downloadLetter} className="btn-secondary btn">📄 Experience Letter</button>
              )}
              {detail.status === 'submitted' && isHR && (
                <>
                  <button onClick={() => handleReview('rejected')} className="btn-danger btn">Reject</button>
                  <button onClick={() => handleReview('accepted')} className="btn-success btn">Accept</button>
                </>
              )}
              <button onClick={() => setDetail(null)} className="btn-ghost btn">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Resignation Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-lg font-bold">Submit Resignation</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="form-label">Employee</label>
                <select value={form.employee_id} onChange={(e) => setForm(p => ({ ...p, employee_id: e.target.value }))} className="select-control">
                  <option value="">Select employee...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Notice Period (days)</label>
                <input type="number" value={form.notice_period_days}
                  onChange={(e) => setForm(p => ({ ...p, notice_period_days: +e.target.value }))}
                  className="form-control" />
              </div>
              <div>
                <label className="form-label">Last Working Day (optional)</label>
                <input type="date" value={form.last_working_day}
                  onChange={(e) => setForm(p => ({ ...p, last_working_day: e.target.value }))}
                  className="form-control" />
              </div>
              <div>
                <label className="form-label">Reason</label>
                <textarea rows={3} value={form.reason}
                  onChange={(e) => setForm(p => ({ ...p, reason: e.target.value }))}
                  className="form-control" placeholder="Reason for resignation..." />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowForm(false)} className="btn-ghost btn">Cancel</button>
              <button onClick={submitResignation} className="btn-primary btn">Submit Resignation</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
