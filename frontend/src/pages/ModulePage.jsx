import { useState, useEffect, useCallback } from 'react';
import { studentApi, operationApi, reportApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

// ─── Reusable sub-components ─────────────────────────────────
function DataTable({ columns, rows, loading, onRowClick, emptyIcon, emptyText }) {
  return (
    <div className="table-container bg-white">
      <table className="table">
        <thead><tr>{columns.map((c, i) => <th key={i}>{c.header}</th>)}</tr></thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>{columns.map((_, j) => <td key={j}><div className="skeleton h-4 w-full" /></td>)}</tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-12 text-slate-400">
                <span className="text-4xl block mb-2">{emptyIcon || '📭'}</span>{emptyText || 'No data'}
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={row.id || i} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c, j) => <td key={j}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormModal({ title, children, onClose, onSave, saving }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>
        <div className="modal-body space-y-4">{children}</div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn-ghost btn">Cancel</button>
          <button onClick={onSave} disabled={saving} className="btn-primary btn">
            {saving ? <><div className="spinner w-4 h-4" /> Saving...</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Badge({ status }) {
  const m = {
    active: 'badge-green', completed: 'badge-blue', withdrawn: 'badge-red', suspended: 'badge-red',
    upcoming: 'badge-yellow', cancelled: 'badge-gray', unpaid: 'badge-red', partial: 'badge-yellow',
    paid: 'badge-green', overdue: 'badge-red', open: 'badge-yellow', resolved: 'badge-green', closed: 'badge-gray',
    in_progress: 'badge-blue', todo: 'badge-gray', in_review: 'badge-purple', done: 'badge-green',
    pending: 'badge-yellow', approved: 'badge-green', rejected: 'badge-red',
    planning: 'badge-gray', on_hold: 'badge-yellow',
    low: 'badge-gray', medium: 'badge-yellow', high: 'badge-red', urgent: 'badge-red',
    offered: 'badge-blue', joined: 'badge-green', declined: 'badge-red',
  };
  return <span className={m[status] || 'badge-gray'}>{status?.replace(/_/g, ' ')}</span>;
}

// ─── STUDENTS PAGE ───────────────────────────────────────────
function StudentsModule() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '',
    date_of_birth: '', gender: '', address: '',
    guardian_name: '', guardian_phone: '',
    admission_date: new Date().toISOString().split('T')[0],
  });

  const fetch_ = useCallback(() => {
    setLoading(true);
    studentApi.list({ search, limit: 50 })
      .then(({ data }) => setStudents(data.data || []))
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const save = async () => {
    if (!form.first_name || !form.last_name || !form.email) return toast.error('Name and email required');
    setSaving(true);
    try {
      const { data } = await studentApi.create(form);
      toast.success(data.message || 'Student created');
      setShowCreate(false);
      setForm({ first_name: '', last_name: '', email: '', phone: '', date_of_birth: '', gender: '', address: '', guardian_name: '', guardian_phone: '', admission_date: new Date().toISOString().split('T')[0] });
      fetch_();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const columns = [
    { header: 'Student', render: (r) => (
      <div className="flex items-center gap-3">
        <div className="avatar w-8 h-8 text-xs">{r.first_name?.[0]}{r.last_name?.[0]}</div>
        <div>
          <p className="font-medium text-sm">{r.first_name} {r.last_name}</p>
          <p className="text-xs text-slate-400">{r.student_code} · {r.email}</p>
        </div>
      </div>
    )},
    { header: 'Phone', key: 'phone' },
    { header: 'Admission', render: (r) => r.admission_date || '—' },
    { header: 'Status', render: (r) => <Badge status={r.status} /> },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="search-box flex-1 min-w-[200px]">
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary btn">+ Add Student</button>
      </div>
      <DataTable columns={columns} rows={students} loading={loading} emptyIcon="🎓" emptyText="No students found" />
      {showCreate && (
        <FormModal title="Add Student" onClose={() => setShowCreate(false)} onSave={save} saving={saving}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">First Name *</label><input className="form-control" value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} /></div>
            <div><label className="form-label">Last Name *</label><input className="form-control" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} /></div>
            <div className="col-span-2"><label className="form-label">Email *</label><input type="email" className="form-control" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div><label className="form-label">DOB</label><input type="date" className="form-control" value={form.date_of_birth} onChange={e => setForm(p => ({ ...p, date_of_birth: e.target.value }))} /></div>
            <div><label className="form-label">Gender</label>
              <select className="select-control" value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}>
                <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </div>
            <div><label className="form-label">Admission Date</label><input type="date" className="form-control" value={form.admission_date} onChange={e => setForm(p => ({ ...p, admission_date: e.target.value }))} /></div>
            <div className="col-span-2"><label className="form-label">Address</label><textarea className="form-control" rows={2} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div><label className="form-label">Guardian Name</label><input className="form-control" value={form.guardian_name} onChange={e => setForm(p => ({ ...p, guardian_name: e.target.value }))} /></div>
            <div><label className="form-label">Guardian Phone</label><input className="form-control" value={form.guardian_phone} onChange={e => setForm(p => ({ ...p, guardian_phone: e.target.value }))} /></div>
          </div>
        </FormModal>
      )}
    </>
  );
}

// ─── COURSES & BATCHES PAGE ──────────────────────────────────
const GST_PERCENT = 18;
const EMI_MONTHS_LIST = [4, 6, 8, 15];

function calculateFeeDetails(baseAmount, allowedPlans) {
  const base = Math.max(0, Number(baseAmount) || 0);
  const gst = Math.round(base * (GST_PERCENT / 100));
  const total = base + gst;

  const cash = {
    key: 'cash',
    label: 'Cash',
    fullName: 'Full Cash Payment',
    months: 1,
    baseAmount: base,
    gstAmount: gst,
    totalAmount: total,
    installmentAmount: total,
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  };

  const allEmiPlans = EMI_MONTHS_LIST.map(months => {
    const installmentTotal = Math.round(total / months);
    const installmentBase = Math.round(base / months);
    const installmentGst = installmentTotal - installmentBase;
    return {
      key: `emi_${months}`,
      months,
      label: `${months} EMI`,
      fullName: `${months} Months EMI Plan`,
      baseAmount: base,
      gstAmount: gst,
      totalAmount: total,
      installmentTotal,
      installmentBase,
      installmentGst,
      badgeClass:
        months === 4 ? 'bg-blue-50 text-blue-800 border-blue-300' :
        months === 6 ? 'bg-indigo-50 text-indigo-800 border-indigo-300' :
        months === 8 ? 'bg-purple-50 text-purple-800 border-purple-300' :
        'bg-amber-50 text-amber-800 border-amber-300',
    };
  });

  const emiOptions = allowedPlans && allowedPlans.length > 0
    ? allEmiPlans.filter(p => allowedPlans.includes(p.key) || allowedPlans.includes(String(p.months)))
    : allEmiPlans;

  return {
    base,
    gst,
    total,
    cash,
    allEmiPlans,
    emiOptions: emiOptions.length > 0 ? emiOptions : allEmiPlans,
  };
}

function parseCoursePlans(description) {
  if (!description) return ['emi_4', 'emi_6', 'emi_8', 'emi_15'];
  const match = description.match(/\[emi_plans:([^\]]+)\]/);
  if (match && match[1]) {
    const list = match[1].split(',').filter(Boolean);
    if (list.length > 0) return list;
  }
  return ['emi_4', 'emi_6', 'emi_8', 'emi_15'];
}

function stripPlansFromDesc(description) {
  if (!description) return '';
  return description.replace(/\[(plans|emi_plans):[^\]]+\]/g, '').trim();
}

function PaymentOptionsCell({ fee, description, onOpenModal }) {
  const base = Number(fee) || 0;
  if (!base) return <span className="text-slate-400 text-xs">—</span>;

  const allowedEmi = parseCoursePlans(description);
  const details = calculateFeeDetails(base, allowedEmi);
  const minEmi = details.emiOptions[details.emiOptions.length - 1];

  return (
    <div className="flex flex-col gap-1.5 py-1">
      {/* 1. Cash Option */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Cash:</span>
          <span className="font-bold">₹{details.cash.totalAmount.toLocaleString()}</span>
          <span className="text-[10px] text-emerald-600 font-normal">(inc. 18% GST)</span>
        </span>
      </div>

      {/* 2. EMI Option */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-300">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>EMI:</span>
          <span className="font-normal text-blue-700">4, 6, 8, 15 Months</span>
          <span className="font-bold text-blue-900">from ₹{minEmi?.installmentTotal.toLocaleString()}/mo</span>
        </span>

        {onOpenModal && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenModal(); }}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            title="View all EMI options and schedule breakdown"
          >
            All EMI Options ➔
          </button>
        )}
      </div>
    </div>
  );
}

function CoursesModule() {
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('courses');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedEmiCourse, setSelectedEmiCourse] = useState(null);
  const [cForm, setCForm] = useState({
    name: '',
    code: '',
    description: '',
    duration_months: 6,
    fee_amount: 0,
    emiPlans: ['emi_4', 'emi_6', 'emi_8', 'emi_15'],
  });
  const [bForm, setBForm] = useState({ course_id: '', name: '', start_date: '', end_date: '', capacity: 30 });

  useEffect(() => {
    Promise.all([studentApi.courses(), studentApi.batches({})])
      .then(([c, b]) => { setCourses(c.data.data || []); setBatches(b.data.data || []); })
      .catch(() => toast.error('Failed to load courses and batches'))
      .finally(() => setLoading(false));
  }, []);

  const saveCourse = async () => {
    if (!cForm.name || !cForm.code) return toast.error('Name and Code are required');
    setSaving(true);
    try {
      const plansTag = `[emi_plans:${(cForm.emiPlans || []).join(',')}]`;
      const descPayload = cForm.description
        ? `${stripPlansFromDesc(cForm.description)}\n${plansTag}`
        : plansTag;

      await studentApi.createCourse({
        name: cForm.name,
        code: cForm.code,
        duration_months: Number(cForm.duration_months) || 6,
        fee_amount: Number(cForm.fee_amount) || 0,
        description: descPayload,
      });
      toast.success('Course created successfully');
      setShowForm(false);
      setCForm({
        name: '',
        code: '',
        description: '',
        duration_months: 6,
        fee_amount: 0,
        emiPlans: ['emi_4', 'emi_6', 'emi_8', 'emi_15'],
      });
      const { data } = await studentApi.courses();
      setCourses(data.data || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create course');
    } finally {
      setSaving(false);
    }
  };

  const saveBatch = async () => {
    if (!bForm.course_id || !bForm.name) return toast.error('Course and Batch Name are required');
    setSaving(true);
    try {
      await studentApi.createBatch(bForm);
      toast.success('Batch created successfully');
      setShowForm(false);
      setBForm({ course_id: '', name: '', start_date: '', end_date: '', capacity: 30 });
      const { data } = await studentApi.batches({});
      setBatches(data.data || []);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create batch');
    } finally {
      setSaving(false);
    }
  };

  const selectedCourseForBatch = courses.find(c => c.id === bForm.course_id);
  const addCourseFeeDetails = calculateFeeDetails(cForm.fee_amount, cForm.emiPlans);

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('courses')} className={`btn ${tab === 'courses' ? 'btn-primary' : 'btn-ghost'}`}>
          📚 Courses ({courses.length})
        </button>
        <button onClick={() => setTab('batches')} className={`btn ${tab === 'batches' ? 'btn-primary' : 'btn-ghost'}`}>
          📋 Batches ({batches.length})
        </button>
        <div className="flex-1" />
        <button onClick={() => setShowForm(true)} className="btn-primary btn">
          + Add {tab === 'courses' ? 'Course' : 'Batch'}
        </button>
      </div>

      {tab === 'courses' ? (
        <DataTable
          columns={[
            { header: 'Name', render: (r) => (
              <div>
                <p className="font-semibold text-slate-800">{r.name}</p>
                {r.description && <p className="text-xs text-slate-500 line-clamp-1">{stripPlansFromDesc(r.description)}</p>}
              </div>
            )},
            { header: 'Code', key: 'code' },
            { header: 'Duration', render: (r) => `${r.duration_months} months` },
            {
              header: 'Fee & 18% GST',
              render: (r) => {
                const details = calculateFeeDetails(r.fee_amount);
                return (
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      ₹{details.total.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Base: ₹{details.base.toLocaleString()} + 18% GST (₹{details.gst.toLocaleString()})
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Payment Structure (Cash & EMI)',
              render: (r) => (
                <PaymentOptionsCell
                  fee={r.fee_amount}
                  description={r.description}
                  onOpenModal={() => setSelectedEmiCourse(r)}
                />
              ),
            },
          ]}
          rows={courses}
          loading={loading}
          emptyIcon="📚"
          emptyText="No courses yet"
        />
      ) : (
        <DataTable
          columns={[
            { header: 'Batch', render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
            { header: 'Course', render: (r) => r.courses?.name || '—' },
            {
              header: 'Fee & 18% GST',
              render: (r) => {
                if (!r.courses?.fee_amount) return '—';
                const details = calculateFeeDetails(r.courses.fee_amount);
                return (
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      ₹{details.total.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Base: ₹{details.base.toLocaleString()} + 18% GST (₹{details.gst.toLocaleString()})
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Payment Structure (Cash & EMI)',
              render: (r) => (
                <PaymentOptionsCell
                  fee={r.courses?.fee_amount}
                  description={r.courses?.description}
                  onOpenModal={() => setSelectedEmiCourse({
                    name: `${r.name} · ${r.courses?.name || 'Course'}`,
                    code: r.name,
                    fee_amount: r.courses?.fee_amount,
                    description: r.courses?.description,
                  })}
                />
              ),
            },
            { header: 'Start Date', render: (r) => r.start_date || '—' },
            { header: 'Capacity', render: (r) => `${r.capacity || 0} students` },
            { header: 'Status', render: (r) => <Badge status={r.status} /> },
          ]}
          rows={batches}
          loading={loading}
          emptyIcon="📋"
          emptyText="No batches yet"
        />
      )}

      {/* Add Course Modal */}
      {showForm && tab === 'courses' && (
        <FormModal title="Add Course" onClose={() => setShowForm(false)} onSave={saveCourse} saving={saving}>
          <div>
            <label className="form-label font-semibold text-slate-700">Course Name *</label>
            <input
              className="form-control"
              placeholder="e.g. Full Stack Web Development"
              value={cForm.name}
              onChange={e => setCForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label font-semibold text-slate-700">Code *</label>
              <input
                className="form-control"
                placeholder="e.g. FSWD-101"
                value={cForm.code}
                onChange={e => setCForm(p => ({ ...p, code: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label font-semibold text-slate-700">Duration (months)</label>
              <input
                type="number"
                className="form-control"
                value={cForm.duration_months}
                onChange={e => setCForm(p => ({ ...p, duration_months: +e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="form-label font-semibold text-slate-700">Base Fee (₹) *</label>
            <input
              type="number"
              className="form-control"
              placeholder="e.g. 50000"
              value={cForm.fee_amount || ''}
              onChange={e => setCForm(p => ({ ...p, fee_amount: Math.max(0, +e.target.value) }))}
            />
          </div>

          {/* Fee + 18% GST Summary */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Base Fee: ₹{addCourseFeeDetails.base.toLocaleString()}</span>
              <span className="text-amber-700 font-bold">+ 18% GST: ₹{addCourseFeeDetails.gst.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-sm font-black text-slate-900">
              <span>Total Payable with 18% GST:</span>
              <span className="text-blue-600 text-base">₹{addCourseFeeDetails.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Payment Structure (Only Cash and EMI with all options) */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Payment Options (Cash & EMI)
            </label>

            {/* Option 1: Cash */}
            <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50/70 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-900">💵 Option 1: Cash (Full Payment)</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">Single upfront settlement including 18% GST</div>
              </div>
              <div className="text-right font-black text-emerald-950 text-base">
                ₹{addCourseFeeDetails.total.toLocaleString()}
              </div>
            </div>

            {/* Option 2: EMI (All Options) */}
            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-blue-900">💳 Option 2: EMI (All Options)</div>
                  <div className="text-[11px] text-slate-500">Select which EMI durations to offer (with 18% GST)</div>
                </div>
              </div>

              {/* Checkboxes for 4, 6, 8, 15 EMI */}
              <div className="flex flex-wrap gap-2">
                {addCourseFeeDetails.allEmiPlans.map(plan => {
                  const isChecked = cForm.emiPlans?.includes(plan.key);
                  return (
                    <label
                      key={plan.key}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-white text-blue-800 border-blue-400 shadow-xs'
                          : 'bg-slate-100 text-slate-400 border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...(cForm.emiPlans || []), plan.key]
                            : (cForm.emiPlans || []).filter(k => k !== plan.key);
                          setCForm(p => ({ ...p, emiPlans: next }));
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>{plan.label}</span>
                    </label>
                  );
                })}
              </div>

              {/* Live EMI Cards Grid */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {addCourseFeeDetails.allEmiPlans
                  .filter(p => cForm.emiPlans?.includes(p.key))
                  .map(plan => (
                    <div key={plan.key} className="bg-white border border-blue-100 rounded-lg p-2.5 text-center shadow-xs">
                      <div className="text-[11px] font-bold text-slate-600">{plan.label} ({plan.months} Months)</div>
                      <div className="text-base font-extrabold text-blue-700 mt-0.5">
                        ₹{plan.installmentTotal.toLocaleString()}
                        <span className="text-[10px] text-slate-500 font-normal"> / mo</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Base: ₹{plan.installmentBase.toLocaleString()} + 18% GST: ₹{plan.installmentGst.toLocaleString()}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div>
            <label className="form-label font-semibold text-slate-700">Description</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="Course overview or prerequisites..."
              value={cForm.description}
              onChange={e => setCForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>
        </FormModal>
      )}

      {/* Add Batch Modal */}
      {showForm && tab === 'batches' && (
        <FormModal title="Add Batch" onClose={() => setShowForm(false)} onSave={saveBatch} saving={saving}>
          <div>
            <label className="form-label font-semibold text-slate-700">Course *</label>
            <select
              className="select-control"
              value={bForm.course_id}
              onChange={e => setBForm(p => ({ ...p, course_id: e.target.value }))}
            >
              <option value="">Select course</option>
              {courses.map(c => {
                const det = calculateFeeDetails(c.fee_amount);
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code}) — ₹{det.total.toLocaleString()} (inc. 18% GST)
                  </option>
                );
              })}
            </select>
          </div>

          {selectedCourseForBatch && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900">Course Total Fee (inc. 18% GST):</span>
                <span className="text-sm font-bold text-blue-700">
                  ₹{calculateFeeDetails(selectedCourseForBatch.fee_amount).total.toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">Payment Options (Cash & EMI):</div>
              <PaymentOptionsCell
                fee={selectedCourseForBatch.fee_amount}
                description={selectedCourseForBatch.description}
                onOpenModal={() => setSelectedEmiCourse(selectedCourseForBatch)}
              />
            </div>
          )}

          <div>
            <label className="form-label font-semibold text-slate-700">Batch Name *</label>
            <input
              className="form-control"
              placeholder="e.g. Batch A - Morning"
              value={bForm.name}
              onChange={e => setBForm(p => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label font-semibold text-slate-700">Start Date</label>
              <input
                type="date"
                className="form-control"
                value={bForm.start_date}
                onChange={e => setBForm(p => ({ ...p, start_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label font-semibold text-slate-700">End Date</label>
              <input
                type="date"
                className="form-control"
                value={bForm.end_date}
                onChange={e => setBForm(p => ({ ...p, end_date: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="form-label font-semibold text-slate-700">Capacity</label>
            <input
              type="number"
              className="form-control"
              value={bForm.capacity}
              onChange={e => setBForm(p => ({ ...p, capacity: +e.target.value }))}
            />
          </div>
        </FormModal>
      )}

      {/* Detailed Payment & All EMI Options Modal */}
      {selectedEmiCourse && (() => {
        const allowedPlans = parseCoursePlans(selectedEmiCourse.description);
        const modalDetails = calculateFeeDetails(selectedEmiCourse.fee_amount, allowedPlans);

        return (
          <div className="modal-overlay" onClick={() => setSelectedEmiCourse(null)}>
            <div className="modal max-w-xl" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Payment & EMI Options Breakdown</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedEmiCourse.name}</p>
                </div>
                <button onClick={() => setSelectedEmiCourse(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
              </div>

              <div className="modal-body space-y-4">
                {/* GST & Fee Card */}
                <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Base Fee</div>
                      <div className="text-base font-bold text-slate-900 mt-0.5">₹{modalDetails.base.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">GST (18%)</div>
                      <div className="text-base font-bold text-amber-700 mt-0.5">+₹{modalDetails.gst.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">Total with GST</div>
                      <div className="text-lg font-black text-blue-950 mt-0.5">₹{modalDetails.total.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Option 1: Cash Payment */}
                <div>
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    💵 Option 1: Cash Payment
                  </div>
                  <div className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-emerald-950">One-Time Full Settlement</div>
                      <div className="text-xs text-emerald-700 mt-0.5">
                        Base: ₹{modalDetails.base.toLocaleString()} + 18% GST: ₹{modalDetails.gst.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase font-semibold text-emerald-700">Total Payable</div>
                      <div className="text-xl font-black text-emerald-950">₹{modalDetails.total.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {/* Option 2: EMI Options */}
                <div>
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    💳 Option 2: EMI Payment (All Options: 4, 6, 8, 15 Months)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {modalDetails.emiOptions.map(plan => (
                      <div key={plan.key} className={`p-3 rounded-xl border ${plan.badgeClass} flex flex-col justify-between shadow-xs`}>
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-slate-900">{plan.fullName}</span>
                            <span className="text-[11px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white/80 border border-black/5">
                              {plan.label}
                            </span>
                          </div>
                          <div className="text-xl font-black text-slate-900 mt-2">
                            ₹{plan.installmentTotal.toLocaleString()}
                            <span className="text-xs font-medium text-slate-600"> / month</span>
                          </div>
                          <div className="text-[11px] text-slate-600 mt-1">
                            Base: ₹{plan.installmentBase.toLocaleString()} + 18% GST: ₹{plan.installmentGst.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-xs mt-3 pt-2 border-t border-black/10 flex justify-between text-slate-600 font-medium">
                          <span>{plan.months} Monthly Installments</span>
                          <span className="font-semibold text-slate-800">Total: ₹{plan.totalAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button onClick={() => setSelectedEmiCourse(null)} className="btn-primary btn">
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

// ─── PROJECTS & TASKS ────────────────────────────────────────
function ProjectsModule() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('projects');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pForm, setPForm] = useState({ name: '', description: '', start_date: '', end_date: '' });
  const [tForm, setTForm] = useState({ project_id: '', title: '', description: '', priority: 'medium', due_date: '' });

  useEffect(() => {
    Promise.all([operationApi.projects({}), operationApi.tasks({})])
      .then(([p, t]) => { setProjects(p.data.data || []); setTasks(t.data.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveProject = async () => {
    setSaving(true);
    try { await operationApi.createProject(pForm); toast.success('Created'); setShowForm(false); operationApi.projects({}).then(({ data }) => setProjects(data.data || [])); }
    catch { toast.error('Failed'); } finally { setSaving(false); }
  };

  const saveTask = async () => {
    setSaving(true);
    try { await operationApi.createTask(tForm); toast.success('Created'); setShowForm(false); operationApi.tasks({}).then(({ data }) => setTasks(data.data || [])); }
    catch { toast.error('Failed'); } finally { setSaving(false); }
  };

  const updateTask = async (task, status) => {
    try {
      await operationApi.updateTask(task.id, { status });
      toast.success('Updated');
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
    } catch { toast.error('Failed'); }
  };

  return (
    <>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('projects')} className={`btn ${tab === 'projects' ? 'btn-primary' : 'btn-ghost'}`}>📁 Projects ({projects.length})</button>
        <button onClick={() => setTab('tasks')} className={`btn ${tab === 'tasks' ? 'btn-primary' : 'btn-ghost'}`}>✅ Tasks ({tasks.length})</button>
        <div className="flex-1" />
        <button onClick={() => setShowForm(true)} className="btn-primary btn">+ Add {tab === 'projects' ? 'Project' : 'Task'}</button>
      </div>

      {tab === 'projects' ? (
        <DataTable
          columns={[
            { header: 'Project', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-400">{r.departments?.name || ''}</p></div> },
            { header: 'Lead', render: (r) => r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : '—' },
            { header: 'Period', render: (r) => `${r.start_date || '—'} → ${r.end_date || '—'}` },
            { header: 'Status', render: (r) => <Badge status={r.status} /> },
          ]}
          rows={projects} loading={loading} emptyIcon="📁" emptyText="No projects"
        />
      ) : (
        <DataTable
          columns={[
            { header: 'Task', render: (r) => <div><p className="font-medium text-sm">{r.title}</p><p className="text-xs text-slate-400">{r.projects?.name || 'No project'}</p></div> },
            { header: 'Assignee', render: (r) => r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : 'Unassigned' },
            { header: 'Priority', render: (r) => <Badge status={r.priority} /> },
            { header: 'Due', key: 'due_date' },
            { header: 'Status', render: (r) => (
              <select className="select-control text-xs py-1 px-2 w-28" value={r.status} onChange={(e) => updateTask(r, e.target.value)}>
                <option value="todo">To Do</option><option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option><option value="done">Done</option>
              </select>
            )},
          ]}
          rows={tasks} loading={loading} emptyIcon="✅" emptyText="No tasks"
        />
      )}

      {showForm && tab === 'projects' && (
        <FormModal title="New Project" onClose={() => setShowForm(false)} onSave={saveProject} saving={saving}>
          <div><label className="form-label">Name *</label><input className="form-control" value={pForm.name} onChange={e => setPForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div><label className="form-label">Description</label><textarea className="form-control" rows={2} value={pForm.description} onChange={e => setPForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Start</label><input type="date" className="form-control" value={pForm.start_date} onChange={e => setPForm(p => ({ ...p, start_date: e.target.value }))} /></div>
            <div><label className="form-label">End</label><input type="date" className="form-control" value={pForm.end_date} onChange={e => setPForm(p => ({ ...p, end_date: e.target.value }))} /></div>
          </div>
        </FormModal>
      )}
      {showForm && tab === 'tasks' && (
        <FormModal title="New Task" onClose={() => setShowForm(false)} onSave={saveTask} saving={saving}>
          <div><label className="form-label">Project</label>
            <select className="select-control" value={tForm.project_id} onChange={e => setTForm(p => ({ ...p, project_id: e.target.value }))}>
              <option value="">No project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="form-label">Title *</label><input className="form-control" value={tForm.title} onChange={e => setTForm(p => ({ ...p, title: e.target.value }))} /></div>
          <div><label className="form-label">Description</label><textarea className="form-control" rows={2} value={tForm.description} onChange={e => setTForm(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Priority</label>
              <select className="select-control" value={tForm.priority} onChange={e => setTForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
            <div><label className="form-label">Due Date</label><input type="date" className="form-control" value={tForm.due_date} onChange={e => setTForm(p => ({ ...p, due_date: e.target.value }))} /></div>
          </div>
        </FormModal>
      )}
    </>
  );
}

// ─── ANNOUNCEMENTS ───────────────────────────────────────────
function AnnouncementsModule() {
  const { hasRole } = useAuth();
  const canCreate = hasRole('super_admin', 'hr');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });

  useEffect(() => {
    operationApi.announcements()
      .then(({ data }) => setItems(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try {
      await operationApi.createAnnouncement(form);
      toast.success('Published');
      setShowForm(false);
      operationApi.announcements().then(({ data }) => setItems(data.data || []));
    } catch { toast.error('Failed'); }
  };

  if (loading) return <div className="card p-12 flex justify-center"><div className="spinner" /></div>;
  return (
    <>
      {canCreate && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowForm(true)} className="btn-primary btn">📢 New Announcement</button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="card empty-state"><span className="text-5xl mb-4">📢</span><p className="text-slate-500">No announcements</p></div>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <div key={a.id} className={`card-hover ${a.is_pinned ? 'border-l-4 border-blue-500' : ''}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-slate-900">{a.is_pinned && '📌 '}{a.title}</h3>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{a.body}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap ml-4">
                  {a.published_at ? new Date(a.published_at).toLocaleDateString() : ''}
                </span>
              </div>
              {a.users?.user_profiles?.full_name && (
                <p className="text-xs text-slate-400 mt-2">— {a.users.user_profiles.full_name}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <FormModal title="New Announcement" onClose={() => setShowForm(false)} onSave={save}>
          <div><label className="form-label">Title *</label><input className="form-control" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
          <div><label className="form-label">Body *</label><textarea className="form-control" rows={4} value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} /></div>
        </FormModal>
      )}
    </>
  );
}

// ─── EXPENSES ────────────────────────────────────────────────
function ExpensesModule() {
  const { hasRole } = useAuth();
  const canApprove = hasRole('super_admin', 'hr', 'finance', 'manager');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ category: 'travel', amount: '', expense_date: new Date().toISOString().split('T')[0], description: '' });

  const fetch_ = () => {
    setLoading(true);
    operationApi.expenses({})
      .then(({ data }) => setItems(data.data || []))
      .catch(() => toast.error('Failed'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetch_(); }, []);

  const save = async () => {
    try { await operationApi.submitExpense({ ...form, amount: +form.amount }); toast.success('Submitted'); setShowForm(false); fetch_(); }
    catch { toast.error('Failed'); }
  };

  const review = async (id, status) => {
    try { await operationApi.reviewExpense(id, { status }); toast.success(`Expense ${status}`); fetch_(); }
    catch { toast.error('Failed'); }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowForm(true)} className="btn-primary btn">+ Submit Expense</button>
      </div>
      <DataTable
        columns={[
          { header: 'Employee', render: (r) => r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : '—' },
          { header: 'Category', key: 'category' },
          { header: 'Amount', render: (r) => `₹${Number(r.amount).toLocaleString()}` },
          { header: 'Date', key: 'expense_date' },
          { header: 'Status', render: (r) => <Badge status={r.status} /> },
          ...(canApprove ? [{ header: 'Action', render: (r) => r.status === 'pending' ? (
            <div className="flex gap-1">
              <button onClick={() => review(r.id, 'approved')} className="btn-success btn-sm btn">✓</button>
              <button onClick={() => review(r.id, 'rejected')} className="btn-danger btn-sm btn">✗</button>
            </div>
          ) : '—' }] : []),
        ]}
        rows={items} loading={loading} emptyIcon="🧳" emptyText="No expenses"
      />
      {showForm && (
        <FormModal title="Submit Expense" onClose={() => setShowForm(false)} onSave={save}>
          <div><label className="form-label">Category</label>
            <select className="select-control" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
              <option value="travel">Travel</option><option value="meals">Meals</option><option value="supplies">Supplies</option><option value="training">Training</option><option value="other">Other</option>
            </select>
          </div>
          <div><label className="form-label">Amount (₹) *</label><input type="number" className="form-control" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
          <div><label className="form-label">Date</label><input type="date" className="form-control" value={form.expense_date} onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))} /></div>
          <div><label className="form-label">Description</label><textarea className="form-control" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
        </FormModal>
      )}
    </>
  );
}

// ─── ASSETS ──────────────────────────────────────────────────
function AssetsModule() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', asset_code: '', category: '', serial_number: '', purchase_date: '', purchase_price: '' });

  useEffect(() => {
    operationApi.assets()
      .then(({ data }) => setItems(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    try { await operationApi.createAsset({ ...form, purchase_price: +form.purchase_price || 0 }); toast.success('Created'); setShowForm(false); operationApi.assets().then(({ data }) => setItems(data.data || [])); }
    catch { toast.error('Failed'); }
  };

  return (
    <>
      <div className="flex justify-end mb-4"><button onClick={() => setShowForm(true)} className="btn-primary btn">+ Add Asset</button></div>
      <DataTable
        columns={[
          { header: 'Name', render: (r) => <div><p className="font-medium">{r.name}</p><p className="text-xs text-slate-400">{r.asset_code || ''} {r.serial_number ? `· SN: ${r.serial_number}` : ''}</p></div> },
          { header: 'Category', key: 'category' },
          { header: 'Assigned To', render: (r) => r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : 'Unassigned' },
          { header: 'Condition', render: (r) => <Badge status={r.condition} /> },
          { header: 'Value', render: (r) => r.purchase_price ? `₹${Number(r.purchase_price).toLocaleString()}` : '—' },
        ]}
        rows={items} loading={loading} emptyIcon="🖥️" emptyText="No assets"
      />
      {showForm && (
        <FormModal title="Add Asset" onClose={() => setShowForm(false)} onSave={save}>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="form-label">Name *</label><input className="form-control" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label className="form-label">Code</label><input className="form-control" value={form.asset_code} onChange={e => setForm(p => ({ ...p, asset_code: e.target.value }))} /></div>
            <div><label className="form-label">Category</label><input className="form-control" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} /></div>
            <div><label className="form-label">Serial No.</label><input className="form-control" value={form.serial_number} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))} /></div>
            <div><label className="form-label">Purchase Date</label><input type="date" className="form-control" value={form.purchase_date} onChange={e => setForm(p => ({ ...p, purchase_date: e.target.value }))} /></div>
            <div><label className="form-label">Price (₹)</label><input type="number" className="form-control" value={form.purchase_price} onChange={e => setForm(p => ({ ...p, purchase_price: e.target.value }))} /></div>
          </div>
        </FormModal>
      )}
    </>
  );
}

// ─── REPORTS & EXPORTS ───────────────────────────────────────
function ReportsModule() {
  const download = async (type) => {
    try {
      let resp;
      if (type === 'employees') resp = await reportApi.exportEmployees({});
      else if (type === 'attendance') resp = await reportApi.exportAttendance({ from_date: `${new Date().getFullYear()}-01-01`, to_date: new Date().toISOString().split('T')[0] });
      const blob = new Blob([resp.data]);
      const url = window.URL.createObjectURL(blob);
      const ext = type === 'attendance' ? 'csv' : 'xlsx';
      Object.assign(document.createElement('a'), { href: url, download: `${type}_export.${ext}` }).click();
      window.URL.revokeObjectURL(url);
      toast.success(`${type} exported`);
    } catch { toast.error('Export failed'); }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {[
        { icon: '👥', title: 'Employee Report', desc: 'Export all employees to Excel', action: () => download('employees') },
        { icon: '🕒', title: 'Attendance Report', desc: 'Export attendance records as CSV', action: () => download('attendance') },
        { icon: '📊', title: 'Dashboard Analytics', desc: 'View charts and KPIs on the Dashboard', action: null, link: '/' },
      ].map((card, i) => (
        <div key={i} className="card-hover flex flex-col items-center text-center">
          <span className="text-4xl mb-3">{card.icon}</span>
          <h3 className="font-semibold text-slate-800">{card.title}</h3>
          <p className="text-sm text-slate-500 mt-1">{card.desc}</p>
          {card.action && <button onClick={card.action} className="btn-primary btn mt-4">📥 Export</button>}
        </div>
      ))}
    </div>
  );
}

// ─── AUDIT LOGS ──────────────────────────────────────────────
function AuditModule() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    operationApi.auditLogs({ limit: 100 })
      .then(({ data }) => setLogs(data.data || []))
      .catch(() => toast.error('Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DataTable
      columns={[
        { header: 'Time', render: (r) => <span className="text-xs">{new Date(r.created_at).toLocaleString()}</span> },
        { header: 'User', render: (r) => r.users?.user_profiles?.full_name || r.users?.email || '—' },
        { header: 'Action', render: (r) => <Badge status={r.action?.toLowerCase()} /> },
        { header: 'Table', key: 'table_name' },
        { header: 'IP', key: 'ip_address' },
      ]}
      rows={logs} loading={loading} emptyIcon="🔍" emptyText="No audit logs"
    />
  );
}

// ─── MAIN MODULE PAGE (Generic Router) ───────────────────────
export default function ModulePage({ title, kind }) {
  const Module = {
    students: StudentsModule,
    courses: CoursesModule,
    projects: ProjectsModule,
    announcements: AnnouncementsModule,
    expenses: ExpensesModule,
    assets: AssetsModule,
    reports: ReportsModule,
    audit: AuditModule,
  }[kind];

  return (
    <div className="animate-fade-in space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
        </div>
      </div>
      {Module ? <Module /> : <div className="card empty-state"><p className="text-slate-400">Module not found</p></div>}
    </div>
  );
}
