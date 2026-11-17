import { useEffect, useState } from 'react';
import { payrollApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import StatusBadge from '../components/StatusBadge';
import toast from 'react-hot-toast';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PayrollPage() {
  const { hasPermission, hasRole } = useAuth();
  const canApprove = hasPermission('approve_payroll') || hasRole('super_admin', 'finance');
  const [runs, setRuns] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const load = () => payrollApi.runs({ year }).then(({ data }) => setRuns(data.data || [])).catch(() => toast.error('Failed to load payroll'));
  useEffect(() => { load(); }, [year]);

  const createRun = async () => {
    try {
      const { data } = await payrollApi.createRun({ month: Number(month), year: Number(year) });
      toast.success(data.message || 'Draft payroll created');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const advance = async (id, status) => {
    try {
      await payrollApi.updateRunStatus(id, status);
      toast.success(`Moved to ${status}`);
      load();
      if (selected?.id === id) openRun({ ...selected, status });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const openRun = async (run) => {
    setSelected(run);
    const { data } = await payrollApi.runPayslips(run.id);
    setPayslips(data.data || []);
  };

  const pay = async (slip) => {
    try {
      await payrollApi.recordPayment({
        payslip_id: slip.id,
        amount: slip.net_salary,
        payment_mode: 'bank_transfer',
        payment_date: new Date().toISOString().split('T')[0],
      });
      toast.success('Payment recorded');
      openRun(selected);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const download = async (id) => {
    const res = await payrollApi.downloadPayslip(id);
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payslip-${id}.pdf`;
    a.click();
  };

  const nextStatus = (status) => {
    if (status === 'draft') return 'review';
    if (status === 'review' && canApprove) return 'approved';
    return null;
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">Draft, review, approve and pay monthly salary</p>
        </div>
        <div className="flex gap-2">
          <select className="select-control w-28" value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input className="form-control w-24" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          <button className="btn-primary btn" onClick={createRun}>Create draft</button>
        </div>
      </div>

      <div className="table-container bg-white">
        <table className="table">
          <thead><tr><th>Period</th><th>Status</th><th>Employees</th><th>Net</th><th></th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{MONTHS[r.month - 1]} {r.year}</td>
                <td><StatusBadge status={r.status} /></td>
                <td>{r.total_employees}</td>
                <td>₹{Number(r.total_net).toLocaleString()}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button className="btn-ghost btn-sm btn" onClick={() => openRun(r)}>Payslips</button>
                    {nextStatus(r.status) && (
                      <button className="btn-secondary btn-sm btn" onClick={() => advance(r.id, nextStatus(r.status))}>
                        Move to {nextStatus(r.status)}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Payslips · {MONTHS[selected.month - 1]} {selected.year}</h2>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Employee</th><th>Total Salary</th><th>Cut Salary</th><th>Final Payoff</th><th>Worked Days</th><th>Payment</th><th></th></tr></thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p.id}>
                    <td>{p.employees?.first_name} {p.employees?.last_name}</td>
                    <td>₹{Number(p.gross_salary || 0).toLocaleString()}</td>
                    <td className="text-red-600">-₹{Number(p.total_deductions || 0).toLocaleString()}</td>
                    <td className="font-semibold text-emerald-700">₹{Number(p.net_salary || 0).toLocaleString()}</td>
                    <td>{p.present_days}/{p.working_days}</td>
                    <td><StatusBadge status={p.payment_status} /></td>
                    <td>
                      <button className="btn-ghost btn-sm btn" onClick={() => download(p.id)}>PDF</button>
                      {selected.status === 'approved' && p.payment_status !== 'paid' && (
                        <button className="btn-success btn-sm btn" onClick={() => pay(p)}>Mark paid</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
