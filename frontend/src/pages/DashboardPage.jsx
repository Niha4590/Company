import { useEffect, useState } from 'react';
import { reportApi } from '../api';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
         XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function StatCard({ icon, label, value, color, to, subtitle }) {
  const content = (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value ?? <span className="skeleton w-16 h-6 inline-block" />}</p>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{content}</Link> : content;
}

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'student') {
    return <Navigate to="/student/portal" replace />;
  }
  const [attChart, setAttChart] = useState([]);
  const [payrollChart, setPayrollChart] = useState([]);
  const [leaveChart, setLeaveChart] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const year = new Date().getFullYear();
    Promise.all([
      reportApi.dashboard(),
      reportApi.attendanceSummary({ year }),
      reportApi.payrollSummary({ year }),
      reportApi.leaveSummary({ year }),
    ])
      .then(([dash, att, pay, leave]) => {
        setSummary(dash.data.data);
        setAttChart((att.data.data || []).map(d => ({
          month: MONTHS[d.month - 1],
          Present: d.present,
          Late: d.late,
          Absent: d.absent,
        })));
        setPayrollChart((pay.data.data || []).map(d => ({
          month: MONTHS[d.month - 1],
          Gross: +d.total_gross,
          Net: +d.total_net,
        })));
        setLeaveChart(leave.data.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Good {getGreeting()}, {user?.profile?.full_name?.split(' ')[0] || 'Admin'} 👋</h1>
        <p className="page-subtitle">{today}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="👥" label="Active Employees" value={summary?.employees}
          color="bg-blue-100 text-blue-600" to="/employees"
          subtitle="Total workforce"
        />
        <StatCard
          icon="🎓" label="Active Students" value={summary?.students}
          color="bg-violet-100 text-violet-600" to="/students"
          subtitle="Currently enrolled"
        />
        <StatCard
          icon="🌴" label="Pending Leaves" value={summary?.pending_leaves}
          color="bg-amber-100 text-amber-600" to="/leave"
          subtitle="Awaiting approval"
        />
        <StatCard
          icon="🧳" label="Pending Expenses" value={summary?.pending_expenses}
          color="bg-orange-100 text-orange-600" to="/expenses"
          subtitle="Awaiting review"
        />
      </div>

      {/* Today's Attendance Summary */}
      {summary?.today_attendance && (
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">📅 Today's Attendance</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Present', value: summary.today_attendance.present, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Late', value: summary.today_attendance.late, color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Absent', value: summary.today_attendance.absent, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'On Leave', value: summary.today_attendance.on_leave, color: 'text-blue-600', bg: 'bg-blue-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-xl p-4 ${bg} text-center`}>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Attendance Chart */}
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">📊 Monthly Attendance</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={attChart}>
              <defs>
                <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
              <Legend />
              <Area type="monotone" dataKey="Present" stroke="#3b82f6" fill="url(#colorPresent)" strokeWidth={2} />
              <Area type="monotone" dataKey="Late" stroke="#f59e0b" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
              <Area type="monotone" dataKey="Absent" stroke="#ef4444" fill="transparent" strokeWidth={2} strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Payroll Chart */}
        <div className="card">
          <h2 className="font-semibold text-slate-800 mb-4">💰 Monthly Payroll</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={payrollChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                formatter={v => `₹${v.toLocaleString()}`}
              />
              <Legend />
              <Bar dataKey="Gross" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Net" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Leave types pie + Payroll runs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leave Distribution */}
        {leaveChart.length > 0 && (
          <div className="card">
            <h2 className="font-semibold text-slate-800 mb-4">🌴 Leave Distribution</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={leaveChart} dataKey="days" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  {leaveChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Payroll runs this year */}
        <div className={`card ${leaveChart.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <h2 className="font-semibold text-slate-800 mb-4">💼 This Year's Payroll Runs</h2>
          {summary?.payroll_runs?.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Status</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.payroll_runs.map((run, i) => (
                    <tr key={i}>
                      <td>{MONTHS[run.month - 1] || run.month} {run.year}</td>
                      <td><StatusBadge status={run.status} /></td>
                      <td className="font-medium">₹{Number(run.total_net).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p className="text-slate-400 text-sm">No payroll runs yet this year</p>
              <Link to="/payroll" className="btn-primary btn-sm mt-2 btn">Go to Payroll</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft: 'badge-gray',
    review: 'badge-yellow',
    approved: 'badge-blue',
    paid: 'badge-green',
    pending: 'badge-yellow',
    active: 'badge-green',
    completed: 'badge-blue',
  };
  return <span className={map[status] || 'badge-gray'}>{status}</span>;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
