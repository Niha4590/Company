import { useState, useEffect, useCallback } from 'react';
import { studentApi, operationApi, reportApi } from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  GST_PERCENT,
  EMI_MONTHS_LIST,
  calculateFeeDetails,
  parseCoursePlans,
  stripPlansFromDesc,
  parsePlanFromInvoice,
} from '../utils/feeCalculator';

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
            <tr key={row.id || i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? "cursor-pointer hover:bg-slate-50/80 transition-colors" : ""}>
              {columns.map((c, j) => <td key={j}>{c.render ? c.render(row) : row[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormModal({ title, children, onClose, onSave, saving, maxWidth = "max-w-lg" }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${maxWidth} max-h-[88vh] flex flex-col my-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header sticky top-0 bg-white z-20 px-6 py-4 border-b border-slate-200 shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl font-bold cursor-pointer transition-all"
          >
            &times;
          </button>
        </div>
        <div className="modal-body overflow-y-auto flex-1 p-6 space-y-4">{children}</div>
        <div className="modal-footer sticky bottom-0 bg-white z-20 px-6 py-3.5 border-t border-slate-200 shrink-0 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost btn">Cancel</button>
          <button type="button" onClick={onSave} disabled={saving} className="btn-primary btn">
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

// ─── STUDENTS PAGE (Admin Management & In-Page Admission View) ────────
function StudentsModule() {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // In-Page Active Student State (No Modal, No Scrolling)
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [detailTab, setDetailTab] = useState('fees'); // 'fees' | 'profile' | 'change_plan'

  // Payment Recording Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoiceForPay, setSelectedInvoiceForPay] = useState(null);
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_mode: 'cash',
    transaction_reference: '',
    payment_date: new Date().toISOString().split('T')[0],
  });
  const [recordingPay, setRecordingPay] = useState(false);

  // Plan Assignment/Change State
  const [changePlanForm, setChangePlanForm] = useState({
    course_id: '',
    batch_id: '',
    payment_plan: 'cash',
  });
  const [savingPlan, setSavingPlan] = useState(false);

  // Add Student Form State
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    address: '',
    guardian_name: '',
    guardian_phone: '',
    admission_date: new Date().toISOString().split('T')[0],
    course_id: '',
    batch_id: '',
    payment_plan: 'cash', // 'cash' | 'emi_4' | 'emi_6' | 'emi_8' | 'emi_15'
  });

  const fetch_ = useCallback(() => {
    setLoading(true);
    Promise.all([
      studentApi.list({ search, limit: 100 }),
      studentApi.courses(),
      studentApi.batches({}),
    ])
      .then(([sRes, cRes, bRes]) => {
        const sList = sRes.data.data || [];
        setStudents(sList);
        setCourses(cRes.data.data || []);
        setBatches(bRes.data.data || []);
        if (sList.length > 0) setActiveStudentId(prev => prev || sList[0].id);
      })
      .catch(() => toast.error('Failed to load students data'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const activeStudent = students.find(s => s.id === activeStudentId) || students[0] || null;
  const enr = activeStudent?.enrollments?.[0] || null;
  const batch = enr?.batches || null;
  const course = batch?.courses || null;
  const invoices = activeStudent?.fee_invoices || [];
  const invoice = invoices[0] || null;
  const plan = parsePlanFromInvoice(invoice);

  const allPayments = invoices.flatMap(inv => inv.fee_payments || []);
  const totalPaid = allPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPayable = invoice ? Number(invoice.total_amount) : (plan?.net_payable || 0);
  const balanceDue = Math.max(0, totalPayable - totalPaid);
  const paymentPct = totalPayable > 0
    ? (balanceDue === 0 ? 100 : Math.min(99, Math.floor((totalPaid / totalPayable) * 100)))
    : 0;
  const paymentPctExact = totalPayable > 0
    ? (balanceDue === 0 ? '100' : (totalPaid / totalPayable * 100).toFixed(1))
    : '0';

  // Sync changePlanForm when active student changes
  useEffect(() => {
    if (activeStudent) {
      const e = activeStudent.enrollments?.[0];
      const i = activeStudent.fee_invoices?.[0];
      const p = parsePlanFromInvoice(i);
      setChangePlanForm({
        course_id: e?.batches?.course_id || e?.batches?.courses?.id || '',
        batch_id: e?.batch_id || '',
        payment_plan: p?.plan_key || 'cash',
      });
    }
  }, [activeStudent?.id]);

  // Calculation for Add Student form
  const addFormCourse = courses.find(c => c.id === form.course_id);
  const addFormBatches = batches.filter(b => !form.course_id || b.course_id === form.course_id);
  const addFormFeeDetails = addFormCourse ? calculateFeeDetails(addFormCourse.fee_amount) : null;

  const save = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      return toast.error('First Name, Last Name and Email are required');
    }
    setSaving(true);
    try {
      let planDetails = null;
      if (addFormCourse && addFormFeeDetails) {
        if (form.payment_plan === 'cash') {
          const c = addFormFeeDetails.cash;
          planDetails = {
            plan_key: 'cash',
            plan_name: 'Cash Settlement (15% Special Discount)',
            base_fee: c.baseAmount,
            gst: c.gstAmount,
            standard_total: c.originalTotal,
            discount_percent: c.discountPercent,
            discount_amount: c.discountAmount,
            net_payable: c.totalAmount,
            monthly_installment: c.totalAmount,
            months: 1,
            payment_type: 'cash',
          };
        } else {
          const p = addFormFeeDetails.emiOptions.find(o => o.key === form.payment_plan);
          if (p) {
            planDetails = {
              plan_key: p.key,
              plan_name: p.fullName,
              base_fee: p.baseAmount,
              gst: p.gstAmount,
              standard_total: p.originalTotal,
              discount_percent: p.discountPercent,
              discount_amount: p.discountAmount,
              net_payable: p.totalAmount,
              monthly_installment: p.installmentTotal,
              months: p.months,
              payment_type: 'emi',
            };
          }
        }
      }

      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        address: form.address,
        guardian_name: form.guardian_name,
        guardian_phone: form.guardian_phone,
        admission_date: form.admission_date,
        batch_id: form.batch_id || null,
        payment_plan: form.payment_plan || null,
        plan_details: planDetails,
      };

      const { data } = await studentApi.create(payload);
      toast.success(data.message || 'Student enrolled successfully');
      setShowCreate(false);
      setForm({
        first_name: '', last_name: '', email: '', phone: '',
        date_of_birth: '', gender: '', address: '',
        guardian_name: '', guardian_phone: '',
        admission_date: new Date().toISOString().split('T')[0],
        course_id: '', batch_id: '', payment_plan: 'cash',
      });
      fetch_();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create student');
    } finally {
      setSaving(false);
    }
  };

  // Change / Assign Plan Handler in Admin View
  const handleAssignPlan = async () => {
    if (!activeStudent) return;
    setSavingPlan(true);
    try {
      const targetBatch = batches.find(b => b.id === changePlanForm.batch_id);
      const targetCourse = targetBatch?.courses || courses.find(c => c.id === changePlanForm.course_id || c.id === targetBatch?.course_id);

      let planDetails = null;
      if (targetCourse?.fee_amount) {
        const details = calculateFeeDetails(targetCourse.fee_amount);
        if (changePlanForm.payment_plan === 'cash') {
          const c = details.cash;
          planDetails = {
            plan_key: 'cash',
            plan_name: 'Cash Settlement (15% Special Discount)',
            base_fee: c.baseAmount,
            gst: c.gstAmount,
            standard_total: c.originalTotal,
            discount_percent: c.discountPercent,
            discount_amount: c.discountAmount,
            net_payable: c.totalAmount,
            monthly_installment: c.totalAmount,
            months: 1,
            payment_type: 'cash',
          };
        } else {
          const p = details.emiOptions.find(o => o.key === changePlanForm.payment_plan);
          if (p) {
            planDetails = {
              plan_key: p.key,
              plan_name: p.fullName,
              base_fee: p.baseAmount,
              gst: p.gstAmount,
              standard_total: p.originalTotal,
              discount_percent: p.discountPercent,
              discount_amount: p.discountAmount,
              net_payable: p.totalAmount,
              monthly_installment: p.installmentTotal,
              months: p.months,
              payment_type: 'emi',
            };
          }
        }
      }

      await studentApi.assignPlan(activeStudent.id, {
        batch_id: changePlanForm.batch_id || null,
        payment_plan: changePlanForm.payment_plan,
        plan_details: planDetails,
      });

      toast.success('Payment plan and batch updated successfully');
      setDetailTab('fees');
      fetch_();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update plan');
    } finally {
      setSavingPlan(false);
    }
  };

  // Record Payment Handler
  const handleRecordPayment = async (targetInv = null) => {
    const invToPay = targetInv || selectedInvoiceForPay || invoice;
    if (!invToPay) return toast.error('No invoice found to record payment against');
    const amount = Number(payForm.amount);
    if (!amount || amount <= 0) return toast.error('Please enter a valid payment amount');

    const invPayments = invToPay.fee_payments || [];
    const currPaid = invPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const currRem = Math.max(0, Number(invToPay.total_amount || 0) - currPaid);
    if (amount > currRem) {
      return toast.error(`Amount exceeds remaining balance of ₹${currRem.toLocaleString()}`);
    }

    setRecordingPay(true);
    try {
      const res = await studentApi.recordPayment(invToPay.id, {
        amount,
        payment_mode: payForm.payment_mode,
        transaction_reference: payForm.transaction_reference,
        payment_date: payForm.payment_date,
      });
      const remainingMsg = res.data?.remaining_balance !== undefined
        ? `Remaining Balance: ₹${Number(res.data.remaining_balance).toLocaleString()}`
        : '';
      toast.success(`Payment of ₹${amount.toLocaleString()} recorded! ${remainingMsg}`);
      setShowPayModal(false);
      setPayForm({
        amount: '',
        payment_mode: 'cash',
        transaction_reference: '',
        payment_date: new Date().toISOString().split('T')[0],
      });
      fetch_();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to record payment');
    } finally {
      setRecordingPay(false);
    }
  };

  const columns = [
    {
      header: 'Student',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="avatar w-9 h-9 text-xs font-bold text-white bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shrink-0">
            {r.first_name?.[0]}{r.last_name?.[0]}
          </div>
          <div>
            <p className="font-semibold text-sm text-slate-900">{r.first_name} {r.last_name}</p>
            <p className="text-xs text-slate-500">{r.student_code} • {r.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Enrolled Course & Batch',
      render: (r) => {
        const enr = r.enrollments?.[0];
        const batch = enr?.batches;
        const course = batch?.courses;
        if (!course) {
          return <span className="text-xs text-slate-400 italic">Not Enrolled</span>;
        }
        return (
          <div>
            <p className="text-xs font-bold text-slate-800">{course.name}</p>
            <p className="text-[11px] text-blue-600 font-medium">
              {batch?.name || 'Batch'} {course.duration_months ? `(${course.duration_months} mos)` : ''}
            </p>
          </div>
        );
      },
    },
    {
      header: 'Selected Payment Plan',
      render: (r) => {
        const inv = r.fee_invoices?.[0];
        const plan = parsePlanFromInvoice(inv);
        if (!plan) {
          return <span className="text-xs text-slate-400">—</span>;
        }
        if (plan.payment_type === 'cash' || plan.plan_key === 'cash') {
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-300">
              <span>💵</span> Cash (15% OFF)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-300">
            <span>💳</span> {plan.months || 6} EMI {plan.discount_percent > 0 ? `(${plan.discount_percent}% OFF)` : ''}
            <span className="text-slate-500 font-normal">· ₹{Number(plan.monthly_installment || 0).toLocaleString()}/mo</span>
          </span>
        );
      },
    },
    {
      header: 'Fee & Remaining',
      render: (r) => {
        const inv = r.fee_invoices?.[0];
        if (!inv) return <span className="text-xs text-slate-400">—</span>;
        const payments = (r.fee_invoices || []).flatMap(i => i.fee_payments || []);
        const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
        const total = Number(inv.total_amount || 0);
        const remaining = Math.max(0, total - paid);
        return (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-900">
                ₹{total.toLocaleString()}
              </span>
              <Badge status={inv.status} />
            </div>
            <div className="text-[11px] flex items-center gap-1.5 flex-wrap">
              <span className="text-emerald-700 font-semibold">Paid: ₹{paid.toLocaleString()}</span>
              <span className="text-slate-300">•</span>
              <span className={`font-bold ${remaining === 0 ? 'text-emerald-700' : 'text-amber-800'}`}>
                {remaining === 0 ? '✓ Cleared' : `Remaining: ₹${remaining.toLocaleString()}`}
              </span>
            </div>
          </div>
        );
      },
    },
    { header: 'Admission', render: (r) => <span className="text-xs text-slate-600">{r.admission_date || '—'}</span> },
    {
      header: 'Actions',
      render: (r) => {
        const inv = r.fee_invoices?.[0];
        const payments = (r.fee_invoices || []).flatMap(i => i.fee_payments || []);
        const paid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
        const total = Number(inv?.total_amount || 0);
        const remaining = Math.max(0, total - paid);
        const isSelected = r.id === activeStudent?.id;

        return (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveStudentId(r.id);
                setDetailTab('fees');
                document.getElementById('in-page-student-structure')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-200'
              }`}
            >
              {isSelected ? '✓ Showing Below' : 'View Details ↓'}
            </button>

            {inv && remaining > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveStudentId(r.id);
                  setSelectedInvoiceForPay(inv);
                  setPayForm({
                    amount: '',
                    payment_mode: 'cash',
                    transaction_reference: '',
                    payment_date: new Date().toISOString().split('T')[0],
                  });
                  setShowPayModal(true);
                }}
                className="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 cursor-pointer shadow-2xs"
                title="Quick record payment for this student"
              >
                + Add Pay
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="search-box flex-1 min-w-[200px]">
          <svg className="search-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input placeholder="Search students by name, code, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary btn">
          + Add Student & Assign Plan
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={students}
        loading={loading}
        onRowClick={(r) => {
          setActiveStudentId(r.id);
          document.getElementById('in-page-student-structure')?.scrollIntoView({ behavior: 'smooth' });
        }}
        emptyIcon="🎓"
        emptyText="No students found"
      />

      {/* ─── IN-PAGE STUDENT ADMISSION & FEE BREAKDOWN (No Modal, Full Visibility, No Scroll) ─── */}
      {activeStudent && (
        <div id="in-page-student-structure" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 mt-6 animate-fade-in">
          {/* Top Bar: Student Identity & Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="avatar w-10 h-10 text-sm font-bold text-white bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shrink-0 shadow-xs">
                {activeStudent.first_name?.[0]}{activeStudent.last_name?.[0]}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeStudent.first_name} {activeStudent.last_name}
                  </h2>
                  <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                    {activeStudent.student_code}
                  </span>
                  <Badge status={activeStudent.status} />
                  <span className="text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                    In-Page Admission & Fee View
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Admission: {activeStudent.admission_date || 'N/A'} • Email: <strong className="text-blue-700">{activeStudent.email}</strong> • Phone: {activeStudent.phone || '—'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {students.length > 1 && (
                <div className="flex items-center gap-2 mr-2">
                  <span className="text-xs text-slate-500 font-semibold">Switch Student:</span>
                  <select
                    value={activeStudent.id}
                    onChange={(e) => setActiveStudentId(e.target.value)}
                    className="select-control text-xs py-1.5 px-3 min-w-[200px]"
                  >
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.student_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sub-tab pills */}
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDetailTab('fees')}
                  className={`text-xs font-bold py-1 px-3 rounded-lg transition-all cursor-pointer ${
                    detailTab === 'fees' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  💳 Fee & Payment Plan
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('profile')}
                  className={`text-xs font-bold py-1 px-3 rounded-lg transition-all cursor-pointer ${
                    detailTab === 'profile' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  👤 Full Bio
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('change_plan')}
                  className={`text-xs font-bold py-1 px-3 rounded-lg transition-all cursor-pointer ${
                    detailTab === 'change_plan' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⚙️ Change Plan
                </button>
              </div>
            </div>
          </div>

          {/* Tab 1: Fees & Payment Breakdown */}
          {detailTab === 'fees' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Left Column (4 cols): Course & Contact */}
              <div className="lg:col-span-4 space-y-3 flex flex-col justify-between">
                <div className="p-3.5 rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/70 to-slate-50/40 space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                    <span>📚</span> Enrolled Course & Batch
                  </span>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">
                      {course ? `${course.name} (${course.code || 'N/A'})` : 'No Course Assigned'}
                    </h3>
                    <p className="text-xs text-blue-700 font-semibold mt-0.5">
                      Batch: {batch?.name || 'Unassigned'} • Duration: {course?.duration_months || 6} Months
                    </p>
                    {batch?.start_date && (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Starts: {batch.start_date} {batch.end_date ? `to ${batch.end_date}` : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5 text-xs">
                  <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider block">
                    Contact & Guardian
                  </span>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Email:</span>
                    <span className="font-semibold text-slate-800">{activeStudent.email}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-semibold text-slate-800">{activeStudent.phone || '—'}</span>
                  </div>
                  {activeStudent.guardian_name && (
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Guardian:</span>
                      <span className="font-semibold text-slate-800">{activeStudent.guardian_name} ({activeStudent.guardian_phone || 'N/A'})</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {invoice && invoice.status !== 'paid' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInvoiceForPay(invoice);
                        setPayForm(p => ({
                          ...p,
                          amount: plan?.monthly_installment ? Math.min(balanceDue, Number(plan.monthly_installment)) : balanceDue,
                        }));
                        setShowPayModal(true);
                      }}
                      className="btn-primary btn flex-1 text-xs py-2"
                    >
                      + Record Payment
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailTab('change_plan')}
                    className="btn-ghost btn text-xs py-2 px-3 border border-slate-200 hover:bg-slate-100"
                  >
                    ⚙️ Edit Plan
                  </button>
                </div>
              </div>

              {/* Right Column (8 cols): Plan & Financial Figures */}
              <div className="lg:col-span-8 space-y-3">
                {plan ? (
                  <div className={`p-4 rounded-xl border ${
                    plan.payment_type === 'cash' || plan.plan_key === 'cash'
                      ? 'border-emerald-300 bg-gradient-to-b from-emerald-50/70 to-emerald-50/20'
                      : 'border-blue-300 bg-gradient-to-b from-blue-50/70 to-blue-50/20'
                  } space-y-3`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-black uppercase text-slate-500">Selected Payment Structure</span>
                        <h4 className="text-base font-black text-slate-900">
                          {plan.plan_name || (plan.plan_key === 'cash' ? 'Cash Settlement' : `${plan.months} Months EMI`)}
                        </h4>
                      </div>

                      <span className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        plan.discount_percent > 0
                          ? 'bg-emerald-200 text-emerald-950 border-emerald-300'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}>
                        {plan.discount_percent > 0 ? `${plan.discount_percent}% Special Discount Applied` : 'Standard Total (No Discount)'}
                      </span>
                    </div>

                    {/* Financial Figures Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Base Course Fee</span>
                        <p className="text-sm font-bold text-slate-800 mt-0.5">
                          ₹{Number(plan.base_fee || 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">+ 18% GST</span>
                        <p className="text-sm font-bold text-amber-700 mt-0.5">
                          ₹{Number(plan.gst || 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold uppercase">Instant Savings</span>
                        <p className="text-sm font-bold text-emerald-700 mt-0.5">
                          {plan.discount_amount > 0 ? `Save ₹${Number(plan.discount_amount).toLocaleString()}` : '₹0'}
                        </p>
                      </div>
                      <div className="bg-blue-50/80 -m-1 p-2 rounded-lg border border-blue-200">
                        <span className="text-[10px] text-blue-700 font-bold uppercase">Net Payable</span>
                        <p className="text-base font-black text-blue-900 mt-0.5">
                          ₹{Number(plan.net_payable || totalPayable).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* EMI monthly installment highlight */}
                    {plan.payment_type !== 'cash' && plan.plan_key !== 'cash' && plan.monthly_installment > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 bg-white rounded-xl border border-blue-200 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-base">💳</span>
                          <div>
                            <span className="text-slate-500 font-semibold">Monthly Installment Amount:</span>
                            <span className="text-sm font-black text-slate-900 ml-1.5">
                              ₹{Number(plan.monthly_installment).toLocaleString()}
                              <span className="text-xs font-normal text-slate-500"> / month</span>
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 font-semibold">Tenure: </span>
                          <span className="text-xs font-bold text-blue-800">{plan.months} Monthly Payments</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800">
                    ⚠️ No specific discount plan assigned yet. Use the "Change Plan" tab to select Cash (15% OFF) or an EMI plan (7% OFF).
                  </div>
                )}

                {/* 3-Stat Financial Summary */}
                <div className="grid grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block">Total Payable Fee</span>
                    <p className="text-base font-black text-slate-900 mt-0.5">
                      ₹{totalPayable.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-slate-500">Course & GST</span>
                  </div>

                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200 shadow-2xs">
                    <span className="text-[10px] text-emerald-700 font-semibold uppercase block">Total Amount Paid</span>
                    <p className="text-base font-black text-emerald-800 mt-0.5">
                      ₹{totalPaid.toLocaleString()}
                    </p>
                    <span className="text-[10px] text-emerald-600 font-medium">
                      {allPayments.length} payment(s) made
                    </span>
                  </div>

                  <div className={`p-3 rounded-xl border shadow-2xs ${
                    balanceDue === 0 && totalPayable > 0
                      ? 'bg-emerald-100/60 border-emerald-300'
                      : 'bg-amber-50 border-amber-300'
                  }`}>
                    <span className={`text-[10px] font-bold uppercase block ${
                      balanceDue === 0 && totalPayable > 0 ? 'text-emerald-800' : 'text-amber-800'
                    }`}>
                      Remaining Balance Due
                    </span>
                    <p className={`text-base font-black mt-0.5 ${
                      balanceDue === 0 && totalPayable > 0 ? 'text-emerald-900' : 'text-amber-900'
                    }`}>
                      {balanceDue === 0 && totalPayable > 0 ? '₹0' : `₹${balanceDue.toLocaleString()}`}
                    </p>
                    <span className={`text-[10px] font-bold ${
                      balanceDue === 0 && totalPayable > 0 ? 'text-emerald-700' : 'text-amber-700'
                    }`}>
                      {balanceDue === 0 && totalPayable > 0 ? '✓ Paid in Full' : `₹${balanceDue.toLocaleString()} remaining to clear`}
                    </span>
                  </div>
                </div>

                {/* Payment Progress Bar */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-slate-700">Fee Payment Progress</span>
                    <span className="text-blue-700">{balanceDue === 0 ? '100% Paid' : `${paymentPctExact}% Paid`}</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${balanceDue === 0 ? 100 : Math.min(100, Math.max(0, (totalPaid / totalPayable) * 100))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-slate-600 font-semibold pt-0.5 text-[11px]">
                    <span>Total Paid: <strong className="text-emerald-700">₹{totalPaid.toLocaleString()}</strong></span>
                    <span>Remaining Balance: <strong className={balanceDue === 0 ? 'text-emerald-700' : 'text-amber-700'}>₹{balanceDue.toLocaleString()}</strong></span>
                  </div>
                </div>

                {/* ─── IN-PAGE QUICK ADD PAYMENT SECTION ─── */}
                {invoice && balanceDue > 0 ? (
                  <div className="p-4 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white rounded-xl border-2 border-blue-200/80 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-2.5">
                      <div>
                        <h4 className="font-black text-slate-900 text-sm flex items-center gap-1.5">
                          <span>💳</span> Record Student Payment
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Add the amount paid by {activeStudent.first_name}. Remaining balance updates instantly.
                        </p>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                        Balance Due: ₹{balanceDue.toLocaleString()}
                      </span>
                    </div>

                    {/* Amount Input with Quick-Fill Chips */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <label className="text-xs font-bold text-slate-700">
                          Amount Paid (₹) *
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-semibold">Quick Fill:</span>
                          {plan?.monthly_installment > 0 && Number(plan.monthly_installment) < balanceDue && (
                            <button
                              type="button"
                              onClick={() => setPayForm(p => ({ ...p, amount: String(Math.min(balanceDue, Number(plan.monthly_installment))) }))}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors"
                            >
                              1 EMI (₹{Number(plan.monthly_installment).toLocaleString()})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPayForm(p => ({ ...p, amount: String(balanceDue) }))}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                          >
                            Full Balance (₹{balanceDue.toLocaleString()})
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                        <input
                          type="number"
                          className="form-control pl-7 text-sm font-bold text-slate-900 bg-white"
                          placeholder={`Enter amount up to ₹${balanceDue.toLocaleString()}`}
                          value={payForm.amount}
                          onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                        />
                      </div>

                      {/* Dynamic Live Remaining Balance Preview */}
                      {(() => {
                        const amt = Number(payForm.amount) || 0;
                        const remAfter = Math.max(0, balanceDue - amt);
                        if (amt <= 0) {
                          return (
                            <div className="p-2 bg-slate-100/80 rounded-lg text-[11px] text-slate-600 font-medium">
                              💡 Current remaining balance: <strong>₹{balanceDue.toLocaleString()}</strong>. Enter amount paid above.
                            </div>
                          );
                        }
                        if (amt > balanceDue) {
                          return (
                            <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 font-bold">
                              ⚠️ Entered amount (₹{amt.toLocaleString()}) exceeds the balance due of ₹{balanceDue.toLocaleString()}!
                            </div>
                          );
                        }
                        return (
                          <div className={`p-2.5 rounded-lg border text-xs font-bold transition-all flex items-center justify-between flex-wrap gap-2 ${
                            remAfter === 0
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : 'bg-blue-50 border-blue-300 text-blue-950'
                          }`}>
                            <span>Recording Payment: <strong>₹{amt.toLocaleString()}</strong></span>
                            <span className="text-[12px]">
                              Remaining Balance Will Be: <strong className={remAfter === 0 ? 'text-emerald-700 text-sm' : 'text-amber-800 text-sm'}>₹{remAfter.toLocaleString()} {remAfter === 0 ? '🎉 (Paid in Full!)' : ''}</strong>
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Mode, Date & Reference Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Payment Mode</label>
                        <select
                          className="select-control text-xs"
                          value={payForm.payment_mode}
                          onChange={e => setPayForm(p => ({ ...p, payment_mode: e.target.value }))}
                        >
                          <option value="cash">💵 Cash</option>
                          <option value="upi">📱 UPI / GPay / PhonePe</option>
                          <option value="bank_transfer">🏦 Bank Transfer / NEFT</option>
                          <option value="card">💳 Debit / Credit Card</option>
                          <option value="cheque">📝 Cheque</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Payment Date</label>
                        <input
                          type="date"
                          className="form-control text-xs"
                          value={payForm.payment_date}
                          onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-600 block mb-1">Receipt / Ref No.</label>
                        <input
                          type="text"
                          className="form-control text-xs"
                          placeholder="e.g. UPI-928374 or Receipt #01"
                          value={payForm.transaction_reference}
                          onChange={e => setPayForm(p => ({ ...p, transaction_reference: e.target.value }))}
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={recordingPay || !Number(payForm.amount) || Number(payForm.amount) <= 0 || Number(payForm.amount) > balanceDue}
                        onClick={() => handleRecordPayment(invoice)}
                        className="btn-primary btn text-xs py-2 px-5 font-bold shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {recordingPay
                          ? 'Recording Payment...'
                          : `✓ Record ₹${Number(payForm.amount || 0).toLocaleString()} Payment`}
                      </button>
                    </div>
                  </div>
                ) : balanceDue === 0 && totalPayable > 0 ? (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                    <span className="text-lg">🎉</span>
                    <div>
                      <strong className="block text-emerald-900 font-bold">All Fees Cleared!</strong>
                      <span>This student has completed all payments (Remaining Balance: ₹0).</span>
                    </div>
                  </div>
                ) : null}

                {/* ─── PAYMENT HISTORY & RECEIPTS ─── */}
                <div className="space-y-2 pt-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span>🧾</span> Payment History & Receipts
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {allPayments.length} Transaction(s)
                    </span>
                  </div>

                  {allPayments.length > 0 ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-white">
                      {allPayments.map((p, idx) => (
                        <div key={p.id || idx} className="p-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50/50">
                          <div className="flex items-center gap-2.5">
                            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs border border-emerald-200">
                              ✓
                            </span>
                            <div>
                              <p className="font-bold text-slate-900 text-xs">
                                Paid via <span className="uppercase text-blue-700">{p.payment_mode || 'Cash'}</span>
                              </p>
                              <p className="text-[11px] text-slate-500">
                                Date: {p.payment_date || 'N/A'} {p.transaction_reference ? `• Ref: ${p.transaction_reference}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-sm font-black text-emerald-700">
                              + ₹{Number(p.amount).toLocaleString()}
                            </span>
                            <span className="block text-[10px] text-slate-400 font-semibold uppercase">
                              Received
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      No payments recorded yet for this student. Total due: <strong>₹{totalPayable.toLocaleString()}</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Profile */}
          {detailTab === 'profile' && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400 font-semibold uppercase">Full Name</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{activeStudent.first_name} {activeStudent.last_name}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Student Code</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">{activeStudent.student_code}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Email (Portal Login)</span>
                <p className="font-bold text-slate-900 mt-0.5">{activeStudent.email}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Phone Number</span>
                <p className="font-bold text-slate-900 mt-0.5">{activeStudent.phone || '—'}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Date of Birth</span>
                <p className="font-bold text-slate-900 mt-0.5">{activeStudent.date_of_birth || '—'}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Gender</span>
                <p className="font-bold text-slate-900 mt-0.5 capitalize">{activeStudent.gender || '—'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-400 font-semibold uppercase">Residential Address</span>
                <p className="font-medium text-slate-800 mt-0.5">{activeStudent.address || '—'}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Guardian Name</span>
                <p className="font-bold text-slate-900 mt-0.5">{activeStudent.guardian_name || '—'}</p>
              </div>
              <div>
                <span className="text-slate-400 font-semibold uppercase">Guardian Phone</span>
                <p className="font-bold text-slate-900 mt-0.5">{activeStudent.guardian_phone || '—'}</p>
              </div>
            </div>
          )}

          {/* Tab 3: Change Plan */}
          {detailTab === 'change_plan' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 text-xs text-blue-800">
                💡 Select the course, batch, and discounted payment structure chosen by the student. Saving will automatically update their student portal and fee invoice.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label font-semibold text-slate-700">Course</label>
                  <select
                    className="select-control"
                    value={changePlanForm.course_id}
                    onChange={e => setChangePlanForm(p => ({ ...p, course_id: e.target.value, batch_id: '' }))}
                  >
                    <option value="">-- Choose Course --</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code}) - Base: ₹{Number(c.fee_amount || 0).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label font-semibold text-slate-700">Batch</label>
                  <select
                    className="select-control"
                    value={changePlanForm.batch_id}
                    onChange={e => setChangePlanForm(p => ({ ...p, batch_id: e.target.value }))}
                  >
                    <option value="">-- Choose Batch --</option>
                    {batches.filter(b => !changePlanForm.course_id || b.course_id === changePlanForm.course_id).map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.start_date ? `(Starts: ${b.start_date})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(() => {
                const targetCourse = courses.find(c => c.id === changePlanForm.course_id);
                if (!targetCourse) return null;
                const feeDetails = calculateFeeDetails(targetCourse.fee_amount);

                return (
                  <div className="space-y-3 pt-2">
                    <label className="form-label font-bold text-slate-800">Select Payment Plan:</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Cash */}
                      <label
                        onClick={() => setChangePlanForm(p => ({ ...p, payment_plan: 'cash' }))}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          changePlanForm.payment_plan === 'cash'
                            ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                            <input
                              type="radio"
                              name="change_plan"
                              checked={changePlanForm.payment_plan === 'cash'}
                              onChange={() => {}}
                            />
                            <span>💵 Cash Payment</span>
                          </span>
                          <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-950 border border-emerald-300">
                            15% OFF
                          </span>
                        </div>
                        <div className="mt-2 text-right">
                          <div className="text-xs text-slate-400 line-through">₹{feeDetails.total.toLocaleString()}</div>
                          <div className="text-base font-black text-emerald-950">
                            ₹{feeDetails.cash.totalAmount.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-emerald-700 font-bold">
                            Save ₹{feeDetails.cash.discountAmount.toLocaleString()} instant
                          </div>
                        </div>
                      </label>

                      {/* EMI Plans */}
                      {feeDetails.emiOptions.map(plan => (
                        <label
                          key={plan.key}
                          onClick={() => setChangePlanForm(p => ({ ...p, payment_plan: plan.key }))}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                            changePlanForm.payment_plan === plan.key
                              ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <input
                                type="radio"
                                name="change_plan"
                                checked={changePlanForm.payment_plan === plan.key}
                                onChange={() => {}}
                              />
                              <span>💳 {plan.label}</span>
                            </span>
                            {plan.discountPercent > 0 ? (
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-blue-200 text-blue-950 border border-blue-300">
                                {plan.discountPercent}% OFF
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                                Total EMI
                              </span>
                            )}
                          </div>
                          <div className="mt-2 text-right">
                            <div className="text-base font-black text-slate-900">
                              ₹{plan.installmentTotal.toLocaleString()}
                              <span className="text-xs font-normal text-slate-500"> / mo</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Total: <strong>₹{plan.totalAmount.toLocaleString()}</strong> ({plan.months} mos)
                            </div>
                            {plan.discountPercent > 0 && (
                              <div className="text-[10px] text-emerald-700 font-bold">
                                Save ₹{plan.discountAmount.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="pt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={handleAssignPlan}
                        disabled={savingPlan}
                        className="btn-primary btn"
                      >
                        {savingPlan ? 'Updating Plan...' : '✓ Update Student Payment Plan'}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ─── ADD STUDENT MODAL WITH COURSE & PAYMENT PLAN SELECTOR ─── */}
      {showCreate && (
        <FormModal
          title="Add New Student & Set Payment Plan"
          onClose={() => setShowCreate(false)}
          onSave={save}
          saving={saving}
          maxWidth="max-w-2xl"
        >
          {/* Section 1: Bio */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              1. Student Personal & Contact Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label font-semibold text-slate-700">First Name *</label>
                <input
                  className="form-control"
                  placeholder="e.g. Rahul"
                  value={form.first_name}
                  onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label font-semibold text-slate-700">Last Name *</label>
                <input
                  className="form-control"
                  placeholder="e.g. Sharma"
                  value={form.last_name}
                  onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="form-label font-semibold text-slate-700">Email * (Login username for Student Portal)</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="e.g. rahul@example.com"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label font-semibold text-slate-700">Phone</label>
                <input
                  className="form-control"
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label font-semibold text-slate-700">Admission Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={form.admission_date}
                  onChange={e => setForm(p => ({ ...p, admission_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label font-semibold text-slate-700">Guardian Name</label>
                <input
                  className="form-control"
                  placeholder="Parent / Guardian"
                  value={form.guardian_name}
                  onChange={e => setForm(p => ({ ...p, guardian_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="form-label font-semibold text-slate-700">Guardian Phone</label>
                <input
                  className="form-control"
                  placeholder="Guardian contact"
                  value={form.guardian_phone}
                  onChange={e => setForm(p => ({ ...p, guardian_phone: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Course & Batch Selection */}
          <div className="pt-3 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              2. Course Enrollment
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label font-semibold text-slate-700">Select Course</label>
                <select
                  className="select-control"
                  value={form.course_id}
                  onChange={e => setForm(p => ({ ...p, course_id: e.target.value, batch_id: '' }))}
                >
                  <option value="">-- Choose Course --</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - Base: ₹{Number(c.fee_amount || 0).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label font-semibold text-slate-700">Assign Batch</label>
                <select
                  className="select-control"
                  value={form.batch_id}
                  onChange={e => setForm(p => ({ ...p, batch_id: e.target.value }))}
                  disabled={!form.course_id}
                >
                  <option value="">-- Choose Batch --</option>
                  {addFormBatches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.start_date ? `(Starts: ${b.start_date})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Payment Plan Selection (Cash or EMI with Discounts) */}
          {addFormCourse && addFormFeeDetails && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  3. Select Student's Agreed Payment Plan:
                </h3>
                <span className="text-xs text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  Standard Total: ₹{addFormFeeDetails.total.toLocaleString()} (inc. 18% GST)
                </span>
              </div>

              {/* Plans Radio Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 1. Cash Option */}
                <label
                  onClick={() => setForm(p => ({ ...p, payment_plan: 'cash' }))}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    form.payment_plan === 'cash'
                      ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="payment_plan"
                        checked={form.payment_plan === 'cash'}
                        onChange={() => {}}
                        className="text-emerald-600"
                      />
                      <span>💵 Cash Payment</span>
                    </span>
                    <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-200 text-emerald-950 border border-emerald-300">
                      15% OFF
                    </span>
                  </div>
                  <div className="mt-2 text-right">
                    <div className="text-xs text-slate-400 line-through">₹{addFormFeeDetails.total.toLocaleString()}</div>
                    <div className="text-lg font-black text-emerald-950">
                      ₹{addFormFeeDetails.cash.totalAmount.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-emerald-700 font-bold">
                      Save ₹{addFormFeeDetails.cash.discountAmount.toLocaleString()} instant
                    </div>
                  </div>
                </label>

                {/* 2. EMI Options */}
                {addFormFeeDetails.emiOptions.map(plan => (
                  <label
                    key={plan.key}
                    onClick={() => setForm(p => ({ ...p, payment_plan: plan.key }))}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      form.payment_plan === plan.key
                        ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <input
                          type="radio"
                          name="payment_plan"
                          checked={form.payment_plan === plan.key}
                          onChange={() => {}}
                          className="text-blue-600"
                        />
                        <span>💳 {plan.label}</span>
                      </span>
                      {plan.discountPercent > 0 ? (
                        <span className="text-[10px] font-black uppercase px-1.5 py-0.2 rounded bg-blue-200 text-blue-950 border border-blue-300">
                          {plan.discountPercent}% OFF
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                          Total EMI
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-right">
                      <div className="text-lg font-black text-slate-900">
                        ₹{plan.installmentTotal.toLocaleString()}
                        <span className="text-xs font-normal text-slate-500"> / mo</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Total: <strong>₹{plan.totalAmount.toLocaleString()}</strong> ({plan.months} mos)
                      </div>
                      {plan.discountPercent > 0 && (
                        <div className="text-[10px] text-emerald-700 font-bold">
                          Save ₹{plan.discountAmount.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </FormModal>
      )}

      {/* ─── RECORD PAYMENT QUICK MODAL ─── */}
      {showPayModal && selectedInvoiceForPay && (
        <FormModal
          title={`Record Fee Payment (${selectedInvoiceForPay.invoice_number})`}
          onClose={() => setShowPayModal(false)}
          onSave={() => handleRecordPayment(selectedInvoiceForPay)}
          saving={recordingPay}
        >
          {(() => {
            const modalPayments = selectedInvoiceForPay.fee_payments || [];
            const modalPaid = modalPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
            const modalTotal = Number(selectedInvoiceForPay.total_amount || 0);
            const modalRemaining = Math.max(0, modalTotal - modalPaid);
            const modalInput = Number(payForm.amount) || 0;
            const modalRemAfter = Math.max(0, modalRemaining - modalInput);
            const modalPlan = parsePlanFromInvoice(selectedInvoiceForPay);

            return (
              <div className="space-y-3.5 text-xs">
                {/* 3 Summary Badges */}
                <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Fee</span>
                    <span className="text-sm font-black text-slate-800">₹{modalTotal.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-600 font-bold uppercase block">Already Paid</span>
                    <span className="text-sm font-black text-emerald-700">₹{modalPaid.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-700 font-bold uppercase block">Balance Due</span>
                    <span className="text-sm font-black text-amber-800">₹{modalRemaining.toLocaleString()}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    <label className="form-label font-bold text-slate-700 mb-0">Payment Amount (₹) *</label>
                    <div className="flex items-center gap-1">
                      {modalPlan?.monthly_installment > 0 && Number(modalPlan.monthly_installment) < modalRemaining && (
                        <button
                          type="button"
                          onClick={() => setPayForm(p => ({ ...p, amount: String(Math.min(modalRemaining, Number(modalPlan.monthly_installment))) }))}
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 hover:bg-blue-200"
                        >
                          1 EMI (₹{Number(modalPlan.monthly_installment).toLocaleString()})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPayForm(p => ({ ...p, amount: String(modalRemaining) }))}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      >
                        Full Balance (₹{modalRemaining.toLocaleString()})
                      </button>
                    </div>
                  </div>

                  <input
                    type="number"
                    className="form-control text-sm font-bold text-slate-900"
                    placeholder={`Max ₹${modalRemaining.toLocaleString()}`}
                    value={payForm.amount}
                    onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                  />

                  {/* Dynamic Remaining Balance Callout */}
                  <div className="mt-2">
                    {modalInput <= 0 ? (
                      <p className="text-[11px] text-slate-500">
                        Remaining balance before payment: <strong>₹{modalRemaining.toLocaleString()}</strong>
                      </p>
                    ) : modalInput > modalRemaining ? (
                      <p className="text-[11px] text-rose-600 font-bold">
                        ⚠️ Entered amount exceeds remaining balance of ₹{modalRemaining.toLocaleString()}
                      </p>
                    ) : (
                      <div className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-between ${
                        modalRemAfter === 0 ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-blue-50 text-blue-900 border-blue-200'
                      }`}>
                        <span>Recording: <strong>₹{modalInput.toLocaleString()}</strong></span>
                        <span>Remaining After: <strong className={modalRemAfter === 0 ? 'text-emerald-700' : 'text-amber-800'}>₹{modalRemAfter.toLocaleString()} {modalRemAfter === 0 ? '🎉 (Cleared!)' : ''}</strong></span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label font-semibold text-slate-700">Payment Mode</label>
                    <select
                      className="select-control text-xs"
                      value={payForm.payment_mode}
                      onChange={e => setPayForm(p => ({ ...p, payment_mode: e.target.value }))}
                    >
                      <option value="cash">💵 Cash</option>
                      <option value="upi">📱 UPI / GPay / PhonePe</option>
                      <option value="bank_transfer">🏦 Bank Transfer / NEFT</option>
                      <option value="card">💳 Debit / Credit Card</option>
                      <option value="cheque">📝 Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label font-semibold text-slate-700">Payment Date</label>
                    <input
                      type="date"
                      className="form-control text-xs"
                      value={payForm.payment_date}
                      onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label font-semibold text-slate-700">Transaction Reference / Receipt No.</label>
                  <input
                    className="form-control text-xs"
                    placeholder="e.g. UPI-928374928 or Receipt #102"
                    value={payForm.transaction_reference}
                    onChange={e => setPayForm(p => ({ ...p, transaction_reference: e.target.value }))}
                  />
                </div>
              </div>
            );
          })()}
        </FormModal>
      )}
    </>
  );
}
function PaymentOptionsCell({ fee, description, onSelect, isSelected }) {
  const base = Number(fee) || 0;
  if (!base) return <span className="text-slate-400 text-xs">—</span>;

  const allowedEmi = parseCoursePlans(description);
  const details = calculateFeeDetails(base, allowedEmi);
  const minEmi = details.emiOptions[details.emiOptions.length - 1];

  return (
    <div className="flex flex-col gap-1.5 py-1">
      {/* 1. Cash Option with 15% discount */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>Cash:</span>
          <span className="line-through text-slate-400 text-[10px]">₹{details.total.toLocaleString()}</span>
          <span className="font-extrabold text-emerald-950">₹{details.cash.totalAmount.toLocaleString()}</span>
          <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1 py-0.2 rounded font-black">15% OFF</span>
        </span>
      </div>

      {/* 2. EMI Option with 7% discount on 4,6,8 and 0% on 15 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-300">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span>EMI:</span>
          <span className="text-blue-800">4, 6, 8 EMI</span>
          <span className="text-[10px] bg-blue-200 text-blue-900 px-1 py-0.2 rounded font-black">7% OFF</span>
          <span className="text-slate-400 text-[10px]">|</span>
          <span className="text-slate-600">15 EMI</span>
          <span className="font-bold text-blue-950">from ₹{minEmi?.installmentTotal.toLocaleString()}/mo</span>
        </span>

        {onSelect && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={`text-xs font-bold px-2 py-0.5 rounded transition-all cursor-pointer ${
              isSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50 underline'
            }`}
          >
            {isSelected ? '✓ Showing Below' : 'View Plan ↓'}
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
  const [activeCourseId, setActiveCourseId] = useState(null);
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
      .then(([c, b]) => {
        const cList = c.data.data || [];
        setCourses(cList);
        setBatches(b.data.data || []);
        if (cList.length > 0) setActiveCourseId(prev => prev || cList[0].id);
      })
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

  const activeCourse = courses.find(c => c.id === activeCourseId) || courses[0] || null;
  const activeCoursePlans = activeCourse ? parseCoursePlans(activeCourse.description) : [];
  const activeCourseDetails = activeCourse ? calculateFeeDetails(activeCourse.fee_amount, activeCoursePlans) : null;

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
              header: 'Standard Fee (18% GST)',
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
              header: 'Discounted Payment Structure (Cash & EMI)',
              render: (r) => (
                <PaymentOptionsCell
                  fee={r.fee_amount}
                  description={r.description}
                  isSelected={r.id === activeCourse?.id}
                  onSelect={() => {
                    setActiveCourseId(r.id);
                    document.getElementById('in-page-payment-structure')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              ),
            },
          ]}
          rows={courses}
          onRowClick={(r) => setActiveCourseId(r.id)}
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
              header: 'Standard Fee (18% GST)',
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
              header: 'Discounted Payment Structure (Cash & EMI)',
              render: (r) => (
                <PaymentOptionsCell
                  fee={r.courses?.fee_amount}
                  description={r.courses?.description}
                  isSelected={r.courses?.id === activeCourse?.id}
                  onSelect={() => {
                    if (r.courses?.id) {
                      setActiveCourseId(r.courses.id);
                      document.getElementById('in-page-payment-structure')?.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                />
              ),
            },
            { header: 'Start Date', render: (r) => r.start_date || '—' },
            { header: 'Capacity', render: (r) => `${r.capacity || 0} students` },
            { header: 'Status', render: (r) => <Badge status={r.status} /> },
          ]}
          rows={batches}
          onRowClick={(r) => r.courses?.id && setActiveCourseId(r.courses.id)}
          loading={loading}
          emptyIcon="📋"
          emptyText="No batches yet"
        />
      )}

      {/* ─── IN-PAGE PAYMENT & EMI BREAKDOWN (No Modal, No Scrolling) ─── */}
      {activeCourse && activeCourseDetails && (
        <div id="in-page-payment-structure" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 mt-6 animate-fade-in">
          {/* Top Bar: Title & Course Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold shrink-0">
                💳
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-slate-900">
                    Payment & EMI Structure Breakdown
                  </h2>
                  <span className="text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                    In-Page View
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showing fee discounts and installment calculations for: <strong className="text-blue-700">{activeCourse.name} {activeCourse.code ? `(${activeCourse.code})` : ''}</strong>
                </p>
              </div>
            </div>

            {courses.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Switch Course:</span>
                <select
                  value={activeCourse.id}
                  onChange={(e) => setActiveCourseId(e.target.value)}
                  className="select-control text-xs py-1.5 px-3 min-w-[200px]"
                >
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Compact Fee Summary */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border border-blue-200 rounded-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Fee Structure:</span>
              <span className="text-xs text-slate-700">Base Fee: <strong className="text-slate-900">₹{activeCourseDetails.base.toLocaleString()}</strong></span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-amber-700 font-semibold">+ 18% GST: <strong>₹{activeCourseDetails.gst.toLocaleString()}</strong></span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-blue-900 font-semibold">Standard Total: <strong>₹{activeCourseDetails.total.toLocaleString()}</strong></span>
            </div>
            {activeCourse.duration_months && (
              <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded-md">
                Course Duration: {activeCourse.duration_months} Months
              </span>
            )}
          </div>

          {/* Side-by-side Grid: Left Cash (4 cols) & Right EMI (8 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Option 1: Cash Payment (4/12 width) */}
            <div className="lg:col-span-4 p-4 rounded-xl border border-emerald-300 bg-gradient-to-b from-emerald-50/90 to-emerald-50/40 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-black text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                    <span>💵</span> Option 1: Cash Payment
                  </span>
                  <span className="text-[10px] font-black bg-emerald-200 text-emerald-950 px-2 py-0.5 rounded-full border border-emerald-300">
                    15% DISCOUNT
                  </span>
                </div>

                <div className="bg-white border border-emerald-200 rounded-xl p-3 text-center mb-2.5 shadow-xs">
                  <div className="text-[11px] text-slate-400 line-through">Standard Total: ₹{activeCourseDetails.total.toLocaleString()}</div>
                  <div className="text-2xl font-black text-emerald-950 mt-0.5">
                    ₹{activeCourseDetails.cash.totalAmount.toLocaleString()}
                  </div>
                  <div className="text-xs font-bold text-emerald-700 mt-1">
                    🎉 Instant Savings: ₹{activeCourseDetails.cash.discountAmount.toLocaleString()} (15% OFF)
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 bg-emerald-100/40 p-2.5 rounded-lg border border-emerald-200/60">
                  <div className="flex justify-between">
                    <span>Discounted Base:</span>
                    <span className="font-semibold text-slate-800">₹{activeCourseDetails.cash.baseAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>18% GST on Base:</span>
                    <span className="font-semibold text-slate-800">₹{activeCourseDetails.cash.gstAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-emerald-200 font-bold text-emerald-900">
                    <span>Payment Term:</span>
                    <span>1 Upfront Settlement</span>
                  </div>
                </div>
              </div>

              <div className="text-center text-[11px] font-semibold text-emerald-800 bg-white/70 py-1.5 rounded-lg border border-emerald-200 mt-2">
                ✓ 100% upfront settlement with maximum savings
              </div>
            </div>

            {/* Option 2: EMI Payment Plans (8/12 width) */}
            <div className="lg:col-span-8 p-4 rounded-xl border border-blue-200 bg-gradient-to-b from-blue-50/50 to-slate-50/30 flex flex-col justify-between shadow-xs">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-black text-blue-950 uppercase tracking-wide flex items-center gap-1.5">
                    <span>💳</span> Option 2: EMI Payment Plans
                  </span>
                  <span className="text-[11px] font-bold text-blue-700 bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full">
                    4, 6, 8 EMI: 7% OFF • 15 EMI: No Discount
                  </span>
                </div>

                {/* 4 Cards Grid side-by-side */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {activeCourseDetails.emiOptions.map(plan => (
                    <div key={plan.key} className={`p-2.5 rounded-xl border ${plan.badgeClass} bg-white flex flex-col justify-between shadow-xs hover:border-blue-400 transition-all`}>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-extrabold text-xs text-slate-900">{plan.label}</span>
                          {plan.discountPercent > 0 ? (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                              7% OFF
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold uppercase px-1 py-0.2 rounded bg-slate-100 text-slate-500">
                              Total EMI
                            </span>
                          )}
                        </div>

                        <div className="text-base font-black text-slate-900 mt-0.5">
                          ₹{plan.installmentTotal.toLocaleString()}
                          <span className="text-[10px] font-normal text-slate-500"> / mo</span>
                        </div>

                        {plan.discountPercent > 0 ? (
                          <div className="text-[10px] text-slate-400 line-through">
                            Std: ₹{plan.originalInstallment.toLocaleString()}/mo
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400">
                            Standard total
                          </div>
                        )}

                        <div className="text-[10px] text-slate-500 mt-1">
                          Base: ₹{plan.installmentBase.toLocaleString()} + GST: ₹{plan.installmentGst.toLocaleString()}
                        </div>
                      </div>

                      <div className="text-[10px] mt-2 pt-1.5 border-t border-slate-100 text-slate-600 font-medium">
                        <div className="flex justify-between">
                          <span>Duration:</span>
                          <span className="font-semibold text-slate-800">{plan.months} Months</span>
                        </div>
                        <div className="flex justify-between mt-0.5">
                          <span>Total:</span>
                          <span className="font-bold text-slate-900">₹{plan.totalAmount.toLocaleString()}</span>
                        </div>
                        {plan.discountPercent > 0 ? (
                          <div className="text-emerald-700 text-[10px] font-bold text-right mt-0.5">
                            Save ₹{plan.discountAmount.toLocaleString()}
                          </div>
                        ) : (
                          <div className="text-slate-400 text-[10px] text-right mt-0.5">
                            0% discount
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xs text-slate-500 flex items-center justify-between px-1 mt-2">
                <span>💡 Installments include 18% GST. No hidden fees.</span>
                <span className="font-semibold text-blue-700">All 4 payment terms available</span>
              </div>
            </div>
          </div>
        </div>
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
            <label className="form-label font-semibold text-slate-700">Base Course Fee (₹) *</label>
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
              <span>Standard Total (inc. 18% GST):</span>
              <span className="text-blue-600 text-base">₹{addCourseFeeDetails.total.toLocaleString()}</span>
            </div>
          </div>

          {/* Payment Structure (Only Cash and EMI with discounts) */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Discounted Payment Options (Cash & EMI)
            </label>

            {/* Option 1: Cash (15% Discount) */}
            <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50/70 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-950">💵 Option 1: Cash (Full Payment)</span>
                  <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded font-black">15% DISCOUNT</span>
                </div>
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  Standard ₹{addCourseFeeDetails.total.toLocaleString()} — Save ₹{addCourseFeeDetails.cash.discountAmount.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="line-through text-slate-400 text-xs">₹{addCourseFeeDetails.total.toLocaleString()}</div>
                <div className="font-black text-emerald-950 text-lg">
                  ₹{addCourseFeeDetails.cash.totalAmount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Option 2: EMI (4, 6, 8 EMI: 7% Discount · 15 EMI: No Discount) */}
            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-blue-900">💳 Option 2: EMI Payment Plans</span>
                    <span className="text-[10px] bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded font-black">4, 6, 8 EMI: 7% DISCOUNT</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    7% OFF for 4, 6, 8 months · 15 months (Total EMI) has no discount
                  </div>
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
                      {plan.discountPercent > 0 && (
                        <span className="text-[9px] bg-blue-100 text-blue-800 px-1 rounded font-bold">7% OFF</span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Live EMI Cards Grid with discounts */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {addCourseFeeDetails.allEmiPlans
                  .filter(p => cForm.emiPlans?.includes(p.key))
                  .map(plan => (
                    <div key={plan.key} className="bg-white border border-blue-100 rounded-lg p-2.5 text-center shadow-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                        <span>{plan.label} ({plan.months}m)</span>
                        {plan.discountPercent > 0 ? (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-black">7% OFF</span>
                        ) : (
                          <span className="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded">No Disc.</span>
                        )}
                      </div>
                      <div className="text-base font-extrabold text-blue-700 mt-1">
                        ₹{plan.installmentTotal.toLocaleString()}
                        <span className="text-[10px] text-slate-500 font-normal"> / mo</span>
                      </div>
                      {plan.discountPercent > 0 ? (
                        <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                          Save ₹{plan.discountAmount.toLocaleString()} (Total: ₹{plan.totalAmount.toLocaleString()})
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Standard Total: ₹{plan.totalAmount.toLocaleString()}
                        </div>
                      )}
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
                    {c.name} ({c.code}) — ₹{det.total.toLocaleString()} (Cash: ₹{det.cash.totalAmount.toLocaleString()} with 15% OFF)
                  </option>
                );
              })}
            </select>
          </div>

          {selectedCourseForBatch && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-900">Standard Course Fee (inc. 18% GST):</span>
                <span className="text-sm font-bold text-blue-700">
                  ₹{calculateFeeDetails(selectedCourseForBatch.fee_amount).total.toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                Discounted Payment Options:
              </div>
              <PaymentOptionsCell
                fee={selectedCourseForBatch.fee_amount}
                description={selectedCourseForBatch.description}
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
