import { useState, useEffect, useCallback } from 'react';
import { employeeApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

// ── Reusable Modal ──────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Department Form ─────────────────────────────────────────
function DepartmentForm({ dept, managers, onSave, onClose }) {
  const [form, setForm] = useState({
    name: dept?.name || '',
    description: dept?.description || '',
    head_employee_id: dept?.head_employee_id || '',
    is_active: dept?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Department name is required'); return; }
    setSaving(true);
    try {
      if (dept) {
        await employeeApi.updateDepartment(dept.id, form);
        toast.success('Department updated');
      } else {
        await employeeApi.createDepartment(form);
        toast.success('Department created');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save department');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="form-label">Department Name *</label>
        <input
          className="form-control" required
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Engineering"
        />
      </div>
      <div>
        <label className="form-label">Description</label>
        <textarea
          className="form-control" rows={2}
          value={form.description || ''}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Brief description of this department"
        />
      </div>
      <div>
        <label className="form-label">Department Head</label>
        <select
          className="select-control w-full"
          value={form.head_employee_id || ''}
          onChange={e => setForm(f => ({ ...f, head_employee_id: e.target.value || null }))}
        >
          <option value="">Select head (optional)</option>
          {managers.map(m => (
            <option key={m.id} value={m.id}>
              {m.first_name} {m.last_name} — {m.designations?.title || ''}
            </option>
          ))}
        </select>
      </div>
      {dept && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox" id="deptActive" checked={form.is_active}
            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
          />
          <label htmlFor="deptActive" className="text-sm text-slate-700">Active</label>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary btn flex-1">
          {saving ? 'Saving...' : (dept ? 'Update Department' : 'Create Department')}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary btn">Cancel</button>
      </div>
    </form>
  );
}

// ── Designation Form ────────────────────────────────────────
function DesignationForm({ desig, departments, onSave, onClose }) {
  const [form, setForm] = useState({
    title: desig?.title || '',
    department_id: desig?.department_id || '',
    grade: desig?.grade || '',
    is_active: desig?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      if (desig) {
        await employeeApi.updateDesignation(desig.id, form);
        toast.success('Designation updated');
      } else {
        await employeeApi.createDesignation(form);
        toast.success('Designation created');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save designation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="form-label">Designation Title *</label>
        <input
          className="form-control" required
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Software Engineer"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label">Department</label>
          <select
            className="select-control w-full"
            value={form.department_id || ''}
            onChange={e => setForm(f => ({ ...f, department_id: e.target.value || null }))}
          >
            <option value="">Select department</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Grade</label>
          <input
            className="form-control"
            value={form.grade || ''}
            onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}
            placeholder="e.g. E1, M2"
          />
        </div>
      </div>
      {desig && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox" id="desigActive" checked={form.is_active}
            onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
          />
          <label htmlFor="desigActive" className="text-sm text-slate-700">Active</label>
        </div>
      )}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary btn flex-1">
          {saving ? 'Saving...' : (desig ? 'Update Designation' : 'Create Designation')}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary btn">Cancel</button>
      </div>
    </form>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function DepartmentsPage() {
  const { hasRole } = useAuth();
  const canManage = hasRole('super_admin', 'hr');

  const [tab, setTab] = useState('departments'); // 'departments' | 'designations'
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deptModal, setDeptModal] = useState(null); // null | {} | record
  const [desigModal, setDesigModal] = useState(null);
  const [deptFilter, setDeptFilter] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [depts, desigs, mgrs] = await Promise.all([
        employeeApi.getDepartments(),
        employeeApi.getDesignations(deptFilter ? { department_id: deptFilter } : {}),
        employeeApi.managers(),
      ]);
      setDepartments(depts.data.data || []);
      setDesignations(desigs.data.data || []);
      setManagers(mgrs.data.data || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [deptFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDeleteDept = async (dept) => {
    if (!window.confirm(`Deactivate "${dept.name}"? Employees won't be reassigned automatically.`)) return;
    try {
      await employeeApi.deleteDepartment(dept.id);
      toast.success('Department deactivated');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate');
    }
  };

  const handleDeleteDesig = async (desig) => {
    if (!window.confirm(`Deactivate "${desig.title}"?`)) return;
    try {
      await employeeApi.deleteDesignation(desig.id);
      toast.success('Designation deactivated');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate');
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Departments & Designations</h1>
          <p className="page-subtitle">Manage your organizational structure</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {tab === 'departments' && (
              <button onClick={() => setDeptModal({})} className="btn-primary btn">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Department
              </button>
            )}
            {tab === 'designations' && (
              <button onClick={() => setDesigModal({})} className="btn-primary btn">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Designation
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {[
          { id: 'departments', label: `🏢 Departments (${departments.length})` },
          { id: 'designations', label: `🎯 Designations (${designations.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Departments Tab */}
      {tab === 'departments' && (
        <div className="table-container bg-white">
          <table className="table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Head</th>
                <th>Employees</th>
                <th>Status</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: canManage ? 5 : 4 }).map((_, j) => (
                      <td key={j}><div className="skeleton h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : departments.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="text-center py-12 text-slate-400">
                    No departments yet. {canManage && 'Click "Add Department" to create one.'}
                  </td>
                </tr>
              ) : departments.map(dept => (
                <tr key={dept.id}>
                  <td>
                    <div>
                      <p className="font-medium text-slate-900">{dept.name}</p>
                      {dept.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{dept.description}</p>
                      )}
                    </div>
                  </td>
                  <td>
                    {dept.head ? (
                      <span className="text-sm">{dept.head.first_name} {dept.head.last_name}</span>
                    ) : <span className="text-slate-400 text-sm">—</span>}
                  </td>
                  <td>
                    <span className="badge-blue">{dept.employee_count} active</span>
                  </td>
                  <td>
                    <span className={dept.is_active ? 'badge-green' : 'badge-gray'}>
                      {dept.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDeptModal(dept)}
                          className="btn-ghost btn-sm btn"
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteDept(dept)}
                          className="btn-danger btn-sm btn"
                          disabled={dept.employee_count > 0}
                          title={dept.employee_count > 0 ? 'Has active employees' : 'Deactivate'}
                        >Deactivate</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Designations Tab */}
      {tab === 'designations' && (
        <>
          <div className="card p-3">
            <select
              className="select-control w-56"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div className="table-container bg-white">
            <table className="table">
              <thead>
                <tr>
                  <th>Designation Title</th>
                  <th>Department</th>
                  <th>Grade</th>
                  <th>Status</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: canManage ? 5 : 4 }).map((_, j) => (
                        <td key={j}><div className="skeleton h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))
                ) : designations.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 5 : 4} className="text-center py-12 text-slate-400">
                      No designations found.
                    </td>
                  </tr>
                ) : designations.map(d => (
                  <tr key={d.id}>
                    <td className="font-medium text-slate-900">{d.title}</td>
                    <td>{d.departments?.name || <span className="text-slate-400">—</span>}</td>
                    <td>{d.grade ? <span className="badge-gray">{d.grade}</span> : '—'}</td>
                    <td>
                      <span className={d.is_active ? 'badge-green' : 'badge-gray'}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="flex gap-1">
                          <button onClick={() => setDesigModal(d)} className="btn-ghost btn-sm btn">Edit</button>
                          <button onClick={() => handleDeleteDesig(d)} className="btn-danger btn-sm btn">Deactivate</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Department Modal */}
      {deptModal !== null && (
        <Modal
          title={deptModal.id ? 'Edit Department' : 'Add Department'}
          onClose={() => setDeptModal(null)}
        >
          <DepartmentForm
            dept={deptModal.id ? deptModal : null}
            managers={managers}
            onSave={() => { setDeptModal(null); fetchAll(); }}
            onClose={() => setDeptModal(null)}
          />
        </Modal>
      )}

      {/* Designation Modal */}
      {desigModal !== null && (
        <Modal
          title={desigModal.id ? 'Edit Designation' : 'Add Designation'}
          onClose={() => setDesigModal(null)}
        >
          <DesignationForm
            desig={desigModal.id ? desigModal : null}
            departments={departments}
            onSave={() => { setDesigModal(null); fetchAll(); }}
            onClose={() => setDesigModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
