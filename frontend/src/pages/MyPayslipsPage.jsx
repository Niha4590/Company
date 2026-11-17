import { useState, useEffect } from 'react';
import { payrollApi } from '../api';
import toast from 'react-hot-toast';

const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function MyPayslipsPage() {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    payrollApi.myPayslips()
      .then(({ data }) => setPayslips(data.data || []))
      .catch(() => toast.error('Failed to fetch payslips'))
      .finally(() => setLoading(false));
  }, []);

  const download = async (slip) => {
    try {
      const { data } = await payrollApi.downloadPayslip(slip.id);
      const url = window.URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip_${slip.payroll_runs?.month}_${slip.payroll_runs?.year}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Payslips</h1>
          <p className="page-subtitle">Your monthly salary slips</p>
        </div>
      </div>

      {loading ? (
        <div className="card p-12 flex justify-center"><div className="spinner" /></div>
      ) : payslips.length === 0 ? (
        <div className="card empty-state">
          <span className="text-5xl mb-4">🧾</span>
          <p className="text-slate-500 font-medium">No payslips available yet</p>
          <p className="text-slate-400 text-sm mt-1">Payslips will appear here after payroll is processed</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {payslips.map((slip) => {
            const run = slip.payroll_runs || {};
            return (
              <div key={slip.id} className="card-hover flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {MONTHS[run.month]} {run.year}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Status: <span className={`font-medium ${run.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {run.status || 'N/A'}
                      </span>
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                    slip.payment_status === 'paid' ? 'bg-emerald-100' : 'bg-amber-100'
                  }`}>
                    {slip.payment_status === 'paid' ? '✅' : '⏳'}
                  </div>
                </div>

                <div className="space-y-2 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total Salary</span>
                    <span className="font-medium">₹{Number(slip.gross_salary || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Cut Salary</span>
                    <span className="font-medium text-red-600">-₹{Number(slip.total_deductions || 0).toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-2 mt-2 flex justify-between">
                    <span className="font-semibold text-slate-800">Final Payoff</span>
                    <span className="font-bold text-lg text-emerald-700">₹{Number(slip.net_salary || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-4 pt-3 border-t text-xs text-slate-400">
                  <span>Days: {slip.present_days}/{slip.working_days}</span>
                  <button
                    onClick={() => download(slip)}
                    className="btn-primary btn-sm btn"
                  >
                    📥 Download PDF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
