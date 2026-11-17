import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { attendanceApi, employeeApi, exitApi, leaveApi, payrollApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';

const TABS = ['Overview', 'Attendance', 'Leaves', 'Salary', 'Payslips', 'Documents', 'Exit'];

export default function EmployeeProfilePage({ self }) {
  const { id: routeId } = useParams();
  const { user, hasRole, hasPermission } = useAuth();
  const [employeeId, setEmployeeId] = useState(self ? user?.employee?.id : routeId);
  const [tab, setTab] = useState('Overview');
  const [emp, setEmp] = useState(null);
  const [loading, setLoading] = useState(true);
  const canFinance = hasRole('super_admin', 'hr', 'finance') || hasPermission('view_payroll');

  useEffect(() => {
    const loadId = async () => {
      if (self && !employeeId) {
        const { data } = await employeeApi.me();
        setEmployeeId(data.data?.id);
      }
    };
    loadId();
  }, [self, employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    employeeApi.get(employeeId)
      .then(({ data }) => setEmp(data.data))
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  if (loading || !emp) {
    return <div className="card"><div className="skeleton h-40 w-full" /></div>;
  }

  const probation = emp.probation_end_date
    ? (new Date(emp.probation_end_date) >= new Date() ? 'On probation' : 'Confirmed')
    : 'Not set';

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div className="flex items-center gap-4">
          <div className="avatar w-14 h-14 text-lg">{emp.first_name?.[0]}{emp.last_name?.[0]}</div>
          <div>
            <h1 className="page-title">{emp.first_name} {emp.last_name}</h1>
            <p className="page-subtitle">{emp.employee_code} · {emp.designations?.title || '—'} · {emp.departments?.name || '—'}</p>
          </div>
        </div>
        <StatusBadge status={emp.status} />
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`btn-sm btn ${tab === t ? 'btn-primary' : 'btn-secondary'} whitespace-nowrap`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card space-y-2 text-sm">
            <h2 className="font-semibold">Employment</h2>
            <Row label="Type" value={emp.employment_type?.replace('_', ' ')} />
            <Row label="Joining date" value={emp.joining_date} />
            <Row label="Probation" value={`${probation}${emp.probation_end_date ? ` (${emp.probation_end_date})` : ''}`} />
            <Row label="Manager" value={emp.manager ? `${emp.manager.first_name} ${emp.manager.last_name}` : '—'} />
            <Row label="Email" value={emp.email} />
            <Row label="Phone" value={emp.phone || '—'} />
            <Row label="Address" value={emp.address || '—'} />
          </div>
          <div className="card space-y-2 text-sm">
            <h2 className="font-semibold">Emergency contacts</h2>
            {(emp.employee_contacts || []).length === 0 && <p className="text-slate-400">None on file</p>}
            {(emp.employee_contacts || []).map((c) => (
              <div key={c.id} className="border border-slate-100 rounded-xl p-3">
                <p className="font-medium">{c.name} <span className="badge-gray ml-2">{c.contact_type}</span></p>
                <p className="text-slate-500">{c.relation || '—'} · {c.phone}</p>
              </div>
            ))}
            {canFinance && (
              <div className="pt-2 border-t">
                <h3 className="font-semibold mb-2">Banking</h3>
                <Row label="Bank" value={emp.bank_name || '—'} />
                <Row label="Account" value={emp.bank_account_no || '—'} />
                <Row label="IFSC" value={emp.bank_ifsc || '—'} />
                <Row label="PAN" value={emp.pan_number || '—'} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Attendance' && <AttendanceTab employeeId={emp.id} />}
      {tab === 'Leaves' && <LeavesTab employeeId={emp.id} />}
      {tab === 'Salary' && <SalaryTab employeeId={emp.id} canManage={canFinance} />}
      {tab === 'Payslips' && <PayslipsTab employeeId={emp.id} canManage={canFinance} self={self} />}
      {tab === 'Documents' && <DocumentsTab employeeId={emp.id} canManage={hasRole('super_admin', 'hr')} />}
      {tab === 'Exit' && <ExitTab employeeId={emp.id} />}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 text-right">{value}</span>
    </div>
  );
}

function AttendanceTab({ employeeId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    attendanceApi.list({ employee_id: employeeId, limit: 40 })
      .then(({ data }) => setRows(data.data || []))
      .catch(() => setRows([]));
  }, [employeeId]);
  return (
    <div className="table-container bg-white">
      <table className="table">
        <thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.date}</td>
              <td>{r.check_in ? new Date(r.check_in).toLocaleTimeString() : '—'}</td>
              <td>{r.check_out ? new Date(r.check_out).toLocaleTimeString() : '—'}</td>
              <td>{r.working_hours ?? '—'}</td>
              <td><StatusBadge status={r.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeavesTab({ employeeId }) {
  const [rows, setRows] = useState([]);
  const [balances, setBalances] = useState([]);
  useEffect(() => {
    leaveApi.requests({ employee_id: employeeId }).then(({ data }) => setRows(data.data || [])).catch(() => {});
    leaveApi.balances({ employee_id: employeeId }).then(({ data }) => setBalances(data.data || [])).catch(() => {});
  }, [employeeId]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {balances.map((b) => (
          <div key={b.id} className="card p-4">
            <p className="text-xs text-slate-500">{b.leave_types?.name}</p>
            <p className="text-xl font-bold">{b.remaining_days} <span className="text-sm font-normal text-slate-400">/ {b.total_days}</span></p>
          </div>
        ))}
      </div>
      <div className="table-container bg-white">
        <table className="table">
          <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.leave_types?.name}</td>
                <td>{r.from_date}</td>
                <td>{r.to_date}</td>
                <td>{r.total_days}</td>
                <td><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SalaryTab({ employeeId, canManage }) {
  const [rows, setRows] = useState([]);
  const [increments, setIncrements] = useState([]);
  const [form, setForm] = useState({ effective_date: '', basic_salary: '', hra: '', transport_allowance: '', medical_allowance: '', other_allowances: '' });

  const load = () => {
    payrollApi.structures({ employee_id: employeeId }).then(({ data }) => setRows(data.data || [])).catch(() => setRows([]));
    payrollApi.increments({ employee_id: employeeId }).then(({ data }) => setIncrements(data.data || [])).catch(() => {});
  };
  useEffect(load, [employeeId]);

  const save = async (e) => {
    e.preventDefault();
    try {
      await payrollApi.createStructure({
        employee_id: employeeId,
        ...form,
        basic_salary: Number(form.basic_salary),
        hra: Number(form.hra || 0),
        transport_allowance: Number(form.transport_allowance || 0),
        medical_allowance: Number(form.medical_allowance || 0),
        other_allowances: Number(form.other_allowances || 0),
      });
      toast.success('Salary structure saved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  if (!canManage && !rows.length) {
    return <p className="text-slate-400">Salary details are restricted to authorized roles.</p>;
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={save} className="card grid grid-cols-2 md:grid-cols-3 gap-3">
          <h2 className="font-semibold col-span-full">New structure / revision</h2>
          {['effective_date','basic_salary','hra','transport_allowance','medical_allowance','other_allowances'].map((k) => (
            <div key={k}>
              <label className="form-label">{k.replace(/_/g, ' ')}</label>
              <input className="form-control" type={k.includes('date') ? 'date' : 'number'} required={k === 'effective_date' || k === 'basic_salary'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div className="col-span-full"><button className="btn-primary btn">Save structure</button></div>
        </form>
      )}
      {rows.map((s) => (
        <div key={s.id} className="card text-sm">
          <div className="flex justify-between"><span>Effective {s.effective_date}</span>{s.is_current && <span className="badge-green">current</span>}</div>
          <p className="mt-2">Basic ₹{Number(s.basic_salary).toLocaleString()} · Gross ₹{Number(s.gross_salary).toLocaleString()}</p>
        </div>
      ))}
      {increments.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-2">Revision history</h3>
          {increments.map((i) => (
            <p key={i.id} className="text-sm">{i.effective_date}: ₹{i.old_basic} → ₹{i.new_basic} ({i.reason || '—'})</p>
          ))}
        </div>
      )}
    </div>
  );
}

function PayslipsTab({ employeeId, canManage, self }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const req = self ? payrollApi.myPayslips() : payrollApi.employeePayslips(employeeId);
    req.then(({ data }) => setRows(data.data || [])).catch(() => setRows([]));
  }, [employeeId, self]);

  const download = async (id) => {
    try {
      const res = await payrollApi.downloadPayslip(id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${id}.pdf`;
      a.click();
    } catch {
      toast.error('Download failed');
    }
  };

  if (!canManage && !self) return <p className="text-slate-400">Payslips are restricted.</p>;

  return (
    <div className="table-container bg-white">
      <table className="table">
        <thead><tr><th>Period</th><th>Total Salary</th><th>Cut Salary</th><th>Final Payoff</th><th>Payment</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.payroll_runs ? `${r.payroll_runs.month}/${r.payroll_runs.year}` : '—'}</td>
              <td>₹{Number(r.gross_salary || 0).toLocaleString()}</td>
              <td className="text-red-600">-₹{Number(r.total_deductions || 0).toLocaleString()}</td>
              <td className="font-semibold text-emerald-700">₹{Number(r.net_salary || 0).toLocaleString()}</td>
              <td><StatusBadge status={r.payment_status} /></td>
              <td><button className="btn-ghost btn-sm btn" onClick={() => download(r.id)}>PDF</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocumentsTab({ employeeId, canManage }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ document_type: 'id_proof', file_name: '', file_url: '' });
  const load = () => employeeApi.getDocuments(employeeId).then(({ data }) => setRows(data.data || [])).catch(() => {});
  useEffect(load, [employeeId]);
  const add = async (e) => {
    e.preventDefault();
    try {
      await employeeApi.addDocument(employeeId, form);
      toast.success('Document saved');
      setForm({ document_type: 'id_proof', file_name: '', file_url: '' });
      load();
    } catch {
      toast.error('Failed');
    }
  };
  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={add} className="card grid grid-cols-1 md:grid-cols-4 gap-3">
          <select className="select-control" value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })}>
            <option value="id_proof">ID proof</option>
            <option value="resume">Resume</option>
            <option value="offer_letter">Offer letter</option>
            <option value="certificate">Certificate</option>
          </select>
          <input className="form-control" placeholder="File name" value={form.file_name} onChange={(e) => setForm({ ...form, file_name: e.target.value })} required />
          <input className="form-control" placeholder="https://..." value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} required />
          <button className="btn-primary btn">Add</button>
        </form>
      )}
      <div className="card space-y-2">
        {rows.length === 0 && <p className="text-slate-400">No documents</p>}
        {rows.map((d) => (
          <a key={d.id} href={d.file_url} target="_blank" rel="noreferrer" className="flex justify-between text-sm hover:text-blue-600">
            <span>{d.file_name}</span>
            <span className="badge-gray">{d.document_type}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function ExitTab({ employeeId }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    exitApi.resignations()
      .then(({ data }) => setRows((data.data || []).filter((r) => r.employee_id === employeeId)))
      .catch(() => setRows([]));
  }, [employeeId]);
  return (
    <div className="card">
      {rows.length === 0 && <p className="text-slate-400">No resignation on file. <Link to="/exits" className="text-blue-600">Open exit management</Link></p>}
      {rows.map((r) => (
        <div key={r.id} className="text-sm space-y-1">
          <p>Submitted {r.submitted_on} · Last day {r.last_working_day}</p>
          <StatusBadge status={r.status} />
        </div>
      ))}
    </div>
  );
}
