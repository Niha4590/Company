import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { employeeApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import EmployeeModal from '../components/EmployeeModal';

export default function EmployeesPage() {
  const { hasRole } = useAuth();
  const canCreate = hasRole('super_admin', 'hr');

  const [employees, setEmployees] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [salaryFilter, setSalaryFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);

  const fetchEmployees = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await employeeApi.list({
        page, limit: 20, search, department_id: deptFilter, status: statusFilter, salary_status: salaryFilter,
      });
      setEmployees(data.data || []);
      setMeta(data.meta || {});
    } catch {
      toast.error('Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, statusFilter, salaryFilter]);

  useEffect(() => {
    employeeApi.departments().then(({ data }) => setDepartments(data.data || [])).catch(() => {});
    fetchEmployees(1);
  }, [fetchEmployees]);

  const handleSave = () => {
    setShowModal(false);
    setEditEmployee(null);
    fetchEmployees(1);
  };

  const handleStatusChange = async (emp, newStatus) => {
    try {
      await employeeApi.updateStatus(emp.id, newStatus);
      toast.success(`Employee ${newStatus}`);
      fetchEmployees(meta.page);
    } catch { toast.error('Failed to update status'); }
  };

  const handleSalaryStatusChange = async (emp, newStatus) => {
    try {
      await employeeApi.updateSalaryStatus(emp.id, newStatus);
      toast.success(`Salary marked as ${newStatus === 'paid' ? 'Done' : 'Pending'}`);
      fetchEmployees(meta.page);
    } catch { toast.error('Failed to update salary status'); }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Employees</h1>
          <p className="page-subtitle">{meta.total} employees found</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowModal(true)} className="btn-primary btn">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Employee
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="search-box flex-1 min-w-[200px]">
            <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" placeholder="Search by name, email, ID..."
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="select-control w-36">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="resigned">Resigned</option>
            <option value="terminated">Terminated</option>
          </select>
          <select value={salaryFilter} onChange={(e) => setSalaryFilter(e.target.value)} className="select-control w-44">
            <option value="">All Salaries</option>
            <option value="pending">Salary: Pending</option>
            <option value="paid">Salary: Done (Paid)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-container bg-white">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Type</th>
              <th>Joining Date</th>
              <th>Status</th>
              {canCreate && <th>Actions</th>}
              <th>Salary</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: canCreate ? 6 : 5 }).map((_, j) => (
                    <td key={j}><div className="skeleton h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={canCreate ? 6 : 5} className="text-center py-12 text-slate-400">
                  No employees found
                </td>
              </tr>
            ) : employees.map((emp) => (
              <tr key={emp.id} onClick={() => setEditEmployee(emp)}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="avatar w-9 h-9 text-sm flex-shrink-0">
                      {emp.first_name?.[0]}{emp.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-slate-500">{emp.employee_code} • {emp.email}</p>
                    </div>
                  </div>
                </td>
                <td><span className="badge-gray">{emp.employment_type.replace('_', ' ')}</span></td>
                <td>{emp.joining_date ? new Date(emp.joining_date).toLocaleDateString() : '—'}</td>
                <td><StatusBadge status={emp.status} /></td>
                {canCreate && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => setEditEmployee(emp)} className="btn-ghost btn-sm btn">Edit</button>
                      <button
                        onClick={() => handleStatusChange(emp, emp.status === 'active' ? 'inactive' : 'active')}
                        className={emp.status === 'active' ? 'btn-danger btn-sm btn' : 'btn-success btn-sm btn'}
                      >
                        {emp.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                )}
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        ₹{Number(emp.salary_amount || 0).toLocaleString()}
                      </p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.salary_status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {emp.salary_status === 'paid' ? '● Done' : '○ Pending'}
                      </span>
                    </div>
                    {canCreate && (
                      <button
                        onClick={() => handleSalaryStatusChange(emp, emp.salary_status === 'paid' ? 'pending' : 'paid')}
                        className={`btn btn-xs ${
                          emp.salary_status === 'paid'
                            ? 'btn-ghost text-slate-500 hover:text-amber-700'
                            : 'btn-success text-white'
                        }`}
                      >
                        {emp.salary_status === 'paid' ? 'Undo' : 'Pay'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: meta.totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => fetchEmployees(i + 1)}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                meta.page === i + 1 ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showModal || editEmployee) && (
        <EmployeeModal
          employee={editEmployee}
          departments={departments}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditEmployee(null); }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { active: 'badge-green', inactive: 'badge-gray', resigned: 'badge-yellow', terminated: 'badge-red' };
  return <span className={map[status] || 'badge-gray'} onClick={e => e.stopPropagation()}>{status}</span>;
}
