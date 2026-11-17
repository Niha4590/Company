import { useState, useEffect } from 'react';
import { studentApi } from '../api';
import { parsePlanFromInvoice, calculateFeeDetails } from '../utils/feeCalculator';
import toast from 'react-hot-toast';

export default function StudentPortalPage() {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentApi.get('me')
      .then(({ data }) => setStudent(data.data))
      .catch((err) => {
        console.error('Failed to load student profile:', err);
        toast.error('Failed to load your student profile');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="card text-center py-12">
        <span className="text-4xl">🎓</span>
        <h2 className="text-lg font-bold text-slate-800 mt-3">Student Profile Not Found</h2>
        <p className="text-sm text-slate-500 mt-1">Please contact the administration office.</p>
      </div>
    );
  }

  const enrollment = student.enrollments?.[0] || null;
  const batch = enrollment?.batches || null;
  const course = batch?.courses || null;
  const invoices = student.fee_invoices || [];
  const latestInvoice = invoices[0] || null;
  const plan = parsePlanFromInvoice(latestInvoice);

  // If no saved plan meta in invoice description, fallback to calculating from course fee if available
  const computedFallback = course?.fee_amount ? calculateFeeDetails(course.fee_amount) : null;

  // Payments summary
  const allPayments = invoices.flatMap(inv => inv.fee_payments || []);
  const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalPayable = latestInvoice ? Number(latestInvoice.total_amount) : (plan?.net_payable || computedFallback?.total || 0);
  const balanceDue = Math.max(0, totalPayable - totalPaid);
  const paymentPercentage = totalPayable > 0 ? Math.min(100, Math.round((totalPaid / totalPayable) * 100)) : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs uppercase tracking-wider font-bold bg-white/20 px-3 py-1 rounded-full">
              Student Portal
            </span>
            <h1 className="text-2xl sm:text-3xl font-black mt-2">
              Welcome, {student.first_name} {student.last_name}!
            </h1>
            <p className="text-blue-100 text-sm mt-1">
              Student ID: <strong className="text-white">{student.student_code}</strong> • Admission: {student.admission_date || 'N/A'}
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block text-xs font-bold px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-300/30">
              Status: {student.status?.toUpperCase() || 'ACTIVE'}
            </span>
            {course && (
              <div className="text-xs text-blue-200 mt-2">
                Enrolled: <strong className="text-white">{course.name}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Course Info & Fee Payment Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Course & Batch Details (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <span className="text-2xl">📚</span>
              <div>
                <h3 className="font-bold text-slate-900">Enrolled Course</h3>
                <p className="text-xs text-slate-500">Your active learning program</p>
              </div>
            </div>

            {course ? (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Course Name</span>
                  <p className="font-bold text-slate-800 text-base">{course.name}</p>
                  {course.code && <span className="text-xs text-blue-600 font-semibold">{course.code}</span>}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold">Batch</span>
                    <p className="font-semibold text-slate-800">{batch?.name || 'Assigned'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 uppercase font-semibold">Duration</span>
                    <p className="font-semibold text-slate-800">{course.duration_months} Months</p>
                  </div>
                </div>

                {batch?.start_date && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Batch Timeline</span>
                    <p className="text-xs text-slate-700 mt-0.5">
                      Starts: <strong>{batch.start_date}</strong> {batch.end_date ? `• Ends: ${batch.end_date}` : ''}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-sm">
                No active course enrollment found.
              </div>
            )}
          </div>

          {/* Student Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-sm">
            <h3 className="font-bold text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
              <span>👤</span> My Profile Information
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400">Email:</span>
                <span className="font-medium text-slate-800">{student.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400">Phone:</span>
                <span className="font-medium text-slate-800">{student.phone || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-50">
                <span className="text-slate-400">Date of Birth:</span>
                <span className="font-medium text-slate-800">{student.date_of_birth || '—'}</span>
              </div>
              {student.guardian_name && (
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-400">Guardian:</span>
                  <span className="font-medium text-slate-800">{student.guardian_name} ({student.guardian_phone || 'N/A'})</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Fee Structure & Chosen Plan (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Chosen Plan Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
                  💳
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">Your Payment & Fee Plan</h2>
                    {plan ? (
                      <span className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        plan.payment_type === 'cash' || plan.plan_key === 'cash'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : 'bg-blue-100 text-blue-900 border-blue-300'
                      }`}>
                        {plan.plan_name || (plan.plan_key === 'cash' ? 'Cash Settlement' : `${plan.months} Months EMI`)}
                      </span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        Standard Structure
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assigned by Admissions based on your agreement
                  </p>
                </div>
              </div>

              {/* Status Pill */}
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                balanceDue === 0 && totalPayable > 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : totalPaid > 0
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {balanceDue === 0 && totalPayable > 0 ? '✓ Fully Paid' : totalPaid > 0 ? 'Partial Payment' : 'Payment Due'}
              </span>
            </div>

            {/* Plan Highlight Card */}
            {plan ? (
              <div className={`p-4 rounded-xl border ${
                plan.payment_type === 'cash' || plan.plan_key === 'cash'
                  ? 'bg-gradient-to-b from-emerald-50/70 to-white border-emerald-300'
                  : 'bg-gradient-to-b from-blue-50/70 to-white border-blue-300'
              } space-y-4`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wide text-slate-600">
                      Chosen Payment Term:
                    </span>
                    <h3 className="text-xl font-black text-slate-900 mt-0.5">
                      {plan.plan_name || (plan.plan_key === 'cash' ? 'One-time Cash Settlement' : `${plan.months} Months EMI Plan`)}
                    </h3>
                  </div>

                  {plan.discount_percent > 0 && (
                    <span className="text-xs font-black px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-950 border border-emerald-300 shadow-xs">
                      🎉 {plan.discount_percent}% SPECIAL DISCOUNT APPLIED
                    </span>
                  )}
                </div>

                {/* Key Numbers Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Base Course Fee</span>
                    <p className="text-base font-bold text-slate-800 mt-0.5">
                      ₹{Number(plan.base_fee || 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">+ 18% GST</span>
                    <p className="text-base font-bold text-amber-700 mt-0.5">
                      ₹{Number(plan.gst || 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <span className="text-[11px] text-slate-400 font-semibold uppercase">Discount Savings</span>
                    <p className="text-base font-bold text-emerald-700 mt-0.5">
                      {plan.discount_amount > 0 ? `Save ₹${Number(plan.discount_amount).toLocaleString()}` : '0%'}
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-2xs bg-blue-50/30">
                    <span className="text-[11px] text-blue-700 font-bold uppercase">Net Total Payable</span>
                    <p className="text-lg font-black text-blue-900 mt-0.5">
                      ₹{Number(plan.net_payable || totalPayable).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* EMI Specific Breakdown */}
                {plan.payment_type !== 'cash' && plan.plan_key !== 'cash' && plan.monthly_installment > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-blue-200 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📅</span>
                      <div>
                        <span className="text-xs text-slate-500 font-medium">Monthly Installment Amount:</span>
                        <p className="text-lg font-black text-slate-900">
                          ₹{Number(plan.monthly_installment).toLocaleString()}
                          <span className="text-xs font-normal text-slate-500"> / month</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 font-medium">Tenure:</span>
                      <p className="text-sm font-bold text-blue-800">{plan.months} Monthly Installments</p>
                    </div>
                  </div>
                )}
              </div>
            ) : computedFallback ? (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <p className="text-sm text-slate-600">
                  Standard course fee is <strong>₹{computedFallback.total.toLocaleString()}</strong> (Base: ₹{computedFallback.base.toLocaleString()} + 18% GST: ₹{computedFallback.gst.toLocaleString()}).
                </p>
                <p className="text-xs text-slate-500">
                  Your specific payment plan (Cash 15% discount or 4/6/8/15 EMI) is being verified by the admissions desk.
                </p>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 text-sm">
                No fee record currently associated.
              </div>
            )}

            {/* Payment Progress Bar */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700">Fee Payment Progress</span>
                <span className="text-blue-700">{paymentPercentage}% Paid</span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${paymentPercentage}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 pt-1">
                <span>Total Paid: <strong className="text-slate-900">₹{totalPaid.toLocaleString()}</strong></span>
                <span>Balance Due: <strong className="text-amber-700">₹{balanceDue.toLocaleString()}</strong></span>
              </div>
            </div>

            {/* Invoices & Recorded Transactions */}
            <div className="space-y-3 pt-2">
              <h4 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                <span>🧾 Invoices & Payment History</span>
                <span className="text-xs font-normal text-slate-500">{invoices.length} Invoice(s)</span>
              </h4>

              {invoices.length > 0 ? (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/50">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-800">{inv.invoice_number}</span>
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            inv.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'partial'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {inv.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Due Date: {inv.due_date || 'On enrollment'}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black text-slate-900">
                          ₹{Number(inv.total_amount).toLocaleString()}
                        </span>
                        <div className="text-[11px] text-slate-500">
                          Payments: {inv.fee_payments?.length || 0} recorded
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                  No invoices issued yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
