import { useCallback, useEffect, useState } from 'react';
import { attendanceApi, employeeApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';

export default function AttendancePage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('super_admin', 'hr', 'manager', 'finance');
  const [today, setToday] = useState(null);
  const [rows, setRows] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [report, setReport] = useState([]);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [correction, setCorrection] = useState({ attendance_id: '', corrected_check_in: '', corrected_check_out: '', reason: '' });

  const loadToday = () => attendanceApi.today().then(({ data }) => setToday(data.data)).catch(() => {});
  const loadMine = useCallback(() => {
    attendanceApi.my({ year, month }).then(({ data }) => setRows(data.data || [])).catch(() => {});
  }, [year, month]);

  useEffect(() => { loadToday(); loadMine(); }, [loadMine]);

  useEffect(() => {
    if (!isAdmin) return;
    attendanceApi.corrections({ status: 'pending' }).then(({ data }) => setCorrections(data.data || [])).catch(() => {});
  }, [isAdmin]);

  const punch = async (type) => {
    try {
      await attendanceApi[type]();
      toast.success(type === 'checkin' ? 'Checked in' : 'Checked out');
      loadToday();
      loadMine();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const submitCorrection = async (e) => {
    e.preventDefault();
    try {
      await attendanceApi.requestCorrection(correction);
      toast.success('Correction submitted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const review = async (id, status) => {
    try {
      await attendanceApi.approveCorrection(id, { status });
      setCorrections((c) => c.filter((x) => x.id !== id));
      toast.success(`Correction ${status}`);
    } catch {
      toast.error('Failed');
    }
  };

  const loadReport = async () => {
    try {
      const { data } = await attendanceApi.monthlyReport({ year, month });
      setReport(data.data || []);
    } catch {
      toast.error('Report failed');
    }
  };

  const loadTeam = async () => {
    try {
      const { data } = await attendanceApi.list({ from_date: from, to_date: to, limit: 100 });
      setRows(data.data || []);
    } catch {
      toast.error('Failed to load attendance');
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance</h1>
          <p className="page-subtitle">Check-in, working hours and corrections</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-primary btn" onClick={() => punch('checkin')} disabled={Boolean(today?.check_in)}>Check in</button>
          <button className="btn-secondary btn" onClick={() => punch('checkout')} disabled={!today?.check_in || Boolean(today?.check_out)}>Check out</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs text-slate-500">Today in</p>
          <p className="text-lg font-semibold">{today?.check_in ? new Date(today.check_in).toLocaleTimeString() : '—'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Today out</p>
          <p className="text-lg font-semibold">{today?.check_out ? new Date(today.check_out).toLocaleTimeString() : '—'}</p>
        </div>
        <div className="card">
          <p className="text-xs text-slate-500">Hours</p>
          <p className="text-lg font-semibold">{today?.working_hours ?? '—'}</p>
        </div>
      </div>

      {isAdmin && (
        <div className="card flex flex-wrap gap-3 items-end">
          <div>
            <label className="form-label">From</label>
            <input type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="form-label">To</label>
            <input type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn-secondary btn" onClick={loadTeam}>Team register</button>
          <button className="btn-primary btn" onClick={loadReport}>Monthly report</button>
        </div>
      )}

      <div className="table-container bg-white">
        <table className="table">
          <thead><tr><th>Date</th><th>Employee</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setCorrection((c) => ({ ...c, attendance_id: r.id }))}>
                <td>{r.date}</td>
                <td>{r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : 'You'}</td>
                <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString() : '—'}</td>
                <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString() : '—'}</td>
                <td>{r.working_hours ?? '—'}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={submitCorrection} className="card grid grid-cols-1 md:grid-cols-2 gap-3">
        <h2 className="font-semibold col-span-full">Request correction</h2>
        <input className="form-control" placeholder="Attendance ID (click a row)" value={correction.attendance_id} onChange={(e) => setCorrection({ ...correction, attendance_id: e.target.value })} required />
        <input className="form-control" type="datetime-local" value={correction.corrected_check_in} onChange={(e) => setCorrection({ ...correction, corrected_check_in: e.target.value })} required />
        <input className="form-control" type="datetime-local" value={correction.corrected_check_out} onChange={(e) => setCorrection({ ...correction, corrected_check_out: e.target.value })} required />
        <input className="form-control md:col-span-2" placeholder="Reason" value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} required />
        <button className="btn-primary btn">Submit</button>
      </form>

      {isAdmin && corrections.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Pending corrections</h2>
          {corrections.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 text-sm border-b pb-2">
              <div>
                <p>{c.attendance?.employees?.first_name} {c.attendance?.employees?.last_name}</p>
                <p className="text-slate-500">{c.reason}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-success btn-sm btn" onClick={() => review(c.id, 'approved')}>Approve</button>
                <button className="btn-danger btn-sm btn" onClick={() => review(c.id, 'rejected')}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {report.length > 0 && (
        <div className="table-container bg-white">
          <table className="table">
            <thead><tr><th>Employee</th><th>Present</th><th>Late</th><th>Half day</th><th>Absent</th><th>Hours</th></tr></thead>
            <tbody>
              {report.map((r) => (
                <tr key={r.employee.id}>
                  <td>{r.employee.first_name} {r.employee.last_name}</td>
                  <td>{r.present}</td><td>{r.late}</td><td>{r.half_day}</td><td>{r.absent}</td>
                  <td>{r.total_hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
