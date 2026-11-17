const express = require('express');
const { z } = require('zod');
const PDFDocument = require('pdfkit');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { writeAuditLog } = require('../../middleware/audit');
const logger = require('../../config/logger');
const { getWorkingDays } = require('../../utils/hrMath');

const router = express.Router();
router.use(authenticate);
const ALLOWED_FINANCE = ['super_admin', 'hr', 'finance'];

// ── GET /api/payroll/structures — Salary structures
router.get('/structures', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { employee_id } = req.query;
    let query = supabaseAdmin
      .from('salary_structures')
      .select(`*, employees(id, employee_code, first_name, last_name), salary_deductions(*)`)
      .order('effective_date', { ascending: false });

    if (employee_id) query = query.eq('employee_id', employee_id);

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch salary structures' });
  }
});

// ── GET /api/payroll/structures/my — Employee sees own
router.get('/structures/my', async (req, res) => {
  try {
    const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
    if (!emp) return res.json({ data: [] });

    const { data } = await supabaseAdmin
      .from('salary_structures')
      .select('*, salary_deductions(*)')
      .eq('employee_id', emp.id)
      .order('effective_date', { ascending: false });

    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch salary structure' });
  }
});

// ── POST /api/payroll/structures
router.post('/structures', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { employee_id, effective_date, basic_salary, hra, transport_allowance,
      medical_allowance, other_allowances, deductions } = req.body;

    // Mark previous as not current
    await supabaseAdmin.from('salary_structures')
      .update({ is_current: false }).eq('employee_id', employee_id);

    const { data: structure, error } = await supabaseAdmin.from('salary_structures')
      .insert({ employee_id, effective_date, basic_salary, hra, transport_allowance,
        medical_allowance, other_allowances, created_by: req.user.id })
      .select().single();
    if (error) throw error;

    if (deductions?.length) {
      const deds = deductions.map((d) => ({ ...d, salary_structure_id: structure.id }));
      await supabaseAdmin.from('salary_deductions').insert(deds);
    }

    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'salary_structures',
      recordId: structure.id, newData: structure, ipAddress: req.ip });

    return res.status(201).json({ data: structure });
  } catch (err) {
    logger.error('Create salary structure error:', err);
    return res.status(500).json({ error: 'Failed to create salary structure' });
  }
});

// ── POST /api/payroll/runs — Create payroll run
router.post('/runs', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { month, year, department_id } = req.body;

    // Check if already exists
    let existCheck = supabaseAdmin.from('payroll_runs')
      .select().eq('month', month).eq('year', year);
    if (department_id) existCheck = existCheck.eq('department_id', department_id);
    else existCheck = existCheck.is('department_id', null);

    const { data: existing } = await existCheck.single();
    if (existing) return res.status(409).json({ error: 'Payroll run already exists for this period' });

    // Fetch active employees with salary structures
    let empQuery = supabaseAdmin
      .from('employees')
      .select(`id, employee_code, first_name, last_name,
        salary_structures!inner(*, salary_deductions(*))`)
      .eq('status', 'active')
      .eq('salary_structures.is_current', true);

    if (department_id) empQuery = empQuery.eq('department_id', department_id);
    const { data: employees } = await empQuery;

    if (!employees?.length) {
      return res.status(400).json({ error: 'No active employees with salary structures found' });
    }

    // Get attendance for the month
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];
    const workingDays = getWorkingDays(year, month);

    const { data: attendanceData } = await supabaseAdmin
      .from('attendance')
      .select('employee_id, status, working_hours')
      .in('employee_id', employees.map((e) => e.id))
      .gte('date', start).lte('date', end);

    // Fetch approved leaves in this month
    const { data: approvedLeaves } = await supabaseAdmin
      .from('leave_requests')
      .select('employee_id, total_days')
      .in('employee_id', employees.map((e) => e.id))
      .eq('status', 'approved')
      .gte('from_date', start)
      .lte('to_date', end);

    let totalGross = 0, totalDeductions = 0, totalNet = 0;
    const payslips = [];

    for (const emp of employees) {
      const struct = emp.salary_structures[0];
      const empAtt = attendanceData?.filter((a) => a.employee_id === emp.id) || [];
      const absentDays = empAtt.filter((a) => a.status === 'absent').length;
      const attLeaves = empAtt.filter((a) => a.status === 'on_leave').length;
      const halfLeaves = empAtt.filter((a) => a.status === 'half_day').length * 0.5;
      const reqLeaves = (approvedLeaves || [])
        .filter((l) => l.employee_id === emp.id)
        .reduce((sum, l) => sum + Number(l.total_days || 0), 0);

      // Only cut salary for actual leaves
      const leaveDays = Math.max(reqLeaves, absentDays + attLeaves) + halfLeaves;
      const workedDays = Math.max(0, workingDays - leaveDays);

      // Total salary, cut salary for leaves, and final payoff
      const totalSalary = Number(struct.gross_salary || (Number(struct.basic_salary) + Number(struct.hra || 0) + Number(struct.transport_allowance || 0) + Number(struct.medical_allowance || 0) + Number(struct.other_allowances || 0)));
      const leaveCut = workingDays > 0 ? parseFloat(((totalSalary / workingDays) * leaveDays).toFixed(2)) : 0;
      const finalSalary = parseFloat((totalSalary - leaveCut).toFixed(2));

      totalGross += totalSalary;
      totalDeductions += leaveCut;
      totalNet += finalSalary;

      payslips.push({
        employee_id: emp.id,
        basic_salary: Number(struct.basic_salary || 0),
        total_allowances: Number(struct.gross_salary || 0) - Number(struct.basic_salary || 0),
        allowance_details: [],
        gross_salary: totalSalary,
        total_deductions: leaveCut,
        net_salary: finalSalary,
        working_days: workingDays,
        present_days: workedDays,
        leave_days: leaveDays,
        deduction_details: [{ label: `Cut Salary (${leaveDays} days leave)`, computed_amount: leaveCut }],
      });
    }

    // Create payroll run
    const { data: run, error } = await supabaseAdmin.from('payroll_runs').insert({
      month, year, department_id: department_id || null,
      status: 'draft',
      total_employees: employees.length,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      run_by: req.user.id,
    }).select().single();

    if (error) throw error;

    // Insert payslips
    const payslipsWithRunId = payslips.map((p) => ({ ...p, payroll_run_id: run.id }));
    await supabaseAdmin.from('payslips').insert(payslipsWithRunId);

    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'payroll_runs',
      recordId: run.id, newData: run, ipAddress: req.ip });

    return res.status(201).json({ data: run, message: `Payroll run created for ${employees.length} employees` });
  } catch (err) {
    logger.error('Create payroll run error:', err);
    return res.status(500).json({ error: 'Failed to create payroll run' });
  }
});

// ── GET /api/payroll/runs
router.get('/runs', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { year, status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('payroll_runs')
      .select(`*, departments(name), runner:users!payroll_runs_run_by_fkey(user_profiles(full_name))`, { count: 'exact' });

    if (year) query = query.eq('year', Number(year));
    if (status) query = query.eq('status', status);
    query = query.order('year', { ascending: false }).order('month', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch payroll runs' });
  }
});

// ── PATCH /api/payroll/runs/:id/status — advance workflow
router.patch('/runs/:id/status', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['draft', 'review', 'approved', 'paid'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
    }
    if (status === 'approved' && !req.user.permissions?.approve_payroll && req.user.roleName !== 'super_admin') {
      return res.status(403).json({ error: 'Payroll approval requires the approve_payroll permission' });
    }

    const updates = { status };
    if (status === 'approved') {
      updates.approved_by = req.user.id;
      updates.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin.from('payroll_runs')
      .update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;

    await writeAuditLog({ userId: req.user.id, action: 'UPDATE', tableName: 'payroll_runs',
      recordId: req.params.id, newData: { status }, ipAddress: req.ip });

    return res.json({ data, message: `Payroll moved to ${status}` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update payroll status' });
  }
});

// ── GET /api/payroll/runs/:id/payslips
router.get('/runs/:id/payslips', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('payslips')
      .select('*, employees(id, employee_code, first_name, last_name, departments!employees_department_id_fkey(name), bank_account_no, bank_name, bank_ifsc)')
      .eq('payroll_run_id', req.params.id);
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

router.get('/payslips', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { employee_id } = req.query;
    if (!employee_id) return res.status(400).json({ error: 'employee_id required' });
    const { data, error } = await supabaseAdmin.from('payslips')
      .select('*, payroll_runs(month, year, status)')
      .eq('employee_id', employee_id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

// ── GET /api/payroll/payslips/my — Employee views own payslips
router.get('/payslips/my', async (req, res) => {
  try {
    const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
    if (!emp) return res.json({ data: [] });

    const { data } = await supabaseAdmin.from('payslips')
      .select('*, payroll_runs(month, year, status)')
      .eq('employee_id', emp.id)
      .order('created_at', { ascending: false });
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch payslips' });
  }
});

function numberToWords(num) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(num);
  const cents = Math.round((num - n) * 100);

  function convert(val) {
    if (val === 0) return '';
    if (val < 20) return a[val] + ' ';
    if (val < 100) return b[Math.floor(val / 10)] + (val % 10 ? ' ' + a[val % 10] : '') + ' ';
    if (val < 1000) return a[Math.floor(val / 100)] + ' Hundred ' + convert(val % 100);
    if (val < 1000000) return convert(Math.floor(val / 1000)) + 'Thousand ' + convert(val % 1000);
    return convert(Math.floor(val / 1000000)) + 'Million ' + convert(val % 1000000);
  }

  let words = n === 0 ? 'Zero' : convert(n).trim();
  if (cents > 0) {
    words += ` and ${cents}/100`;
  }
  return words;
}

// ── GET /api/payroll/payslips/:id/pdf — Generate PDF payslip
router.get('/payslips/:id/pdf', async (req, res) => {
  try {
    const { data: slip, error } = await supabaseAdmin.from('payslips')
      .select(`
        *, 
        payroll_runs(month, year, status),
        employees(employee_code, first_name, last_name, email, phone,
          departments!employees_department_id_fkey(name), designations(title), bank_name, bank_account_no, bank_ifsc,
          joining_date)
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !slip) return res.status(404).json({ error: 'Payslip not found' });

    // Check access: employee can only see their own
    if (req.user.roleName === 'employee') {
      const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
      if (slip.employee_id !== emp?.id) return res.status(403).json({ error: 'Access denied' });
    }

    const run = slip.payroll_runs;
    const emp = slip.employees;
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    // Calculations
    const totalSalary = Number(slip.gross_salary || 0);
    const workingDays = Number(slip.working_days || 0);
    const presentDays = Number(slip.present_days || 0);
    const leaveDays = Number(slip.leave_days != null ? slip.leave_days : Math.max(0, workingDays - presentDays));
    const cutForLeaves = Number(slip.total_deductions != null ? slip.total_deductions : Math.max(0, totalSalary - Number(slip.net_salary || 0)));
    const finalSalary = Number(slip.net_salary != null ? slip.net_salary : Math.max(0, totalSalary - cutForLeaves));
    const formatAmt = (num) => (num % 1 === 0 ? String(Math.round(num)) : Number(num).toFixed(2));

    const companyName = process.env.COMPANY_NAME || 'Zoonodle Inc';
    const companyAddress = process.env.COMPANY_ADDRESS || '21023 Pearson Point Road\nGateway Avenue';

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=payslip_${emp.employee_code}_${run.year}_${run.month}.pdf`);
    doc.pipe(res);

    // 1. Header (Centered)
    doc.font('Helvetica-Bold').fontSize(16).text('Payslip', { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(11).text(companyName, { align: 'center' });
    doc.font('Helvetica').fontSize(9).text(companyAddress, { align: 'center' });
    doc.moveDown(1.5);

    // 2. Metadata (2 columns with aligned colons)
    const metaY = doc.y;
    const leftLabelX = 50, leftValX = 145;
    const rightLabelX = 300, rightValX = 405;
    const rowH = 16;

    const metaRows = [
      ['Date of Joining', `: ${emp.joining_date || '-'}`, 'Employee name', `: ${emp.first_name} ${emp.last_name}`],
      ['Pay Period', `: ${months[run.month]} ${run.year}`, 'Designation', `: ${emp.designations?.title || '-'}`],
      ['Worked Days', `: ${presentDays}`],
    ];

    metaRows.forEach((r, idx) => {
      const y = metaY + idx * rowH;
      doc.font('Helvetica').fontSize(9.5).text(r[0], leftLabelX, y);
      doc.text(r[1], leftValX, y);
      if (r[2]) {
        doc.text(r[2], rightLabelX, y);
        doc.text(r[3], rightValX, y);
      }
    });

    // 3. Earnings Table
    let curY = metaY + metaRows.length * rowH + 25;
    doc.font('Helvetica-Bold').fontSize(11).text('Earnings', 50, curY);
    doc.text('Amount', 465, curY, { align: 'right', width: 80 });
    curY += 15;
    doc.moveTo(50, curY).lineTo(545, curY).strokeColor('#000').lineWidth(0.75).stroke();
    curY += 8;

    doc.font('Helvetica').fontSize(10).text('Total Salary', 50, curY);
    doc.text(formatAmt(totalSalary), 465, curY, { align: 'right', width: 80 });
    curY += 24;

    doc.font('Helvetica-Bold').fontSize(10).text('Total Earnings', 320, curY, { align: 'right', width: 130 });
    doc.text(formatAmt(totalSalary), 465, curY, { align: 'right', width: 80 });
    curY += 30;

    // 4. Deductions Table
    doc.font('Helvetica-Bold').fontSize(11).text('Deductions', 50, curY);
    doc.text('Amount', 465, curY, { align: 'right', width: 80 });
    curY += 15;
    doc.moveTo(50, curY).lineTo(545, curY).strokeColor('#000').lineWidth(0.75).stroke();
    curY += 8;

    doc.font('Helvetica').fontSize(10).text(leaveDays > 0 ? `Cut Salary (${leaveDays} ${leaveDays === 1 ? 'day leave' : 'days leave'})` : 'Cut Salary (No leaves)', 50, curY);
    doc.text(formatAmt(cutForLeaves), 465, curY, { align: 'right', width: 80 });
    curY += 24;

    doc.font('Helvetica-Bold').fontSize(10).text('Total Deductions', 320, curY, { align: 'right', width: 130 });
    doc.text(formatAmt(cutForLeaves), 465, curY, { align: 'right', width: 80 });
    curY += 18;

    doc.font('Helvetica-Bold').fontSize(10).text('Final Payoff', 320, curY, { align: 'right', width: 130 });
    doc.text(formatAmt(finalSalary), 465, curY, { align: 'right', width: 80 });
    curY += 45;

    // 5. Amount in Numbers & Words
    doc.font('Helvetica').fontSize(11).text(formatAmt(finalSalary), { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).text(numberToWords(finalSalary), { align: 'center' });

    // 6. Signatures
    const sigY = 670;
    doc.font('Helvetica').fontSize(10).text('Employer Signature', 80, sigY, { width: 150, align: 'center' });
    doc.text('Employee Signature', 365, sigY, { width: 150, align: 'center' });

    const lineY = sigY + 45;
    doc.moveTo(80, lineY).lineTo(230, lineY).strokeColor('#000').lineWidth(0.75).stroke();
    doc.moveTo(365, lineY).lineTo(515, lineY).stroke();

    doc.end();
  } catch (err) {
    logger.error('Payslip PDF error:', err);
    return res.status(500).json({ error: 'Failed to generate payslip PDF' });
  }
});

// ── POST /api/payroll/payments — Record payment
router.post('/payments', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { payslip_id, amount, payment_mode, transaction_reference, payment_date, notes } = req.body;

    const { data: payslip } = await supabaseAdmin.from('payslips').select().eq('id', payslip_id).single();
    if (!payslip) return res.status(404).json({ error: 'Payslip not found' });

    const { data: payment, error } = await supabaseAdmin.from('salary_payments').insert({
      payslip_id, amount, payment_mode, transaction_reference, payment_date,
      paid_by: req.user.id, notes,
    }).select().single();
    if (error) throw error;

    await supabaseAdmin.from('payslips').update({ payment_status: 'paid' }).eq('id', payslip_id);

    const { count: unpaidCount } = await supabaseAdmin.from('payslips')
      .select('*', { count: 'exact', head: true })
      .eq('payroll_run_id', payslip.payroll_run_id)
      .neq('payment_status', 'paid');
    if (!unpaidCount) {
      await supabaseAdmin.from('payroll_runs').update({ status: 'paid' }).eq('id', payslip.payroll_run_id);
    }

    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'salary_payments',
      recordId: payment.id, newData: payment, ipAddress: req.ip });

    return res.status(201).json({ data: payment, message: 'Payment recorded' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

// ── GET /api/payroll/increments
router.get('/increments', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { employee_id } = req.query;
    let query = supabaseAdmin.from('salary_increments')
      .select('*, employees(id, employee_code, first_name, last_name)')
      .order('effective_date', { ascending: false });
    if (employee_id) query = query.eq('employee_id', employee_id);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch increments' });
  }
});

router.post('/increments', authorize(...ALLOWED_FINANCE), async (req, res) => {
  try {
    const { employee_id, new_basic, effective_date, reason, hra, transport_allowance, medical_allowance, other_allowances } = req.body;
    const { data: current } = await supabaseAdmin.from('salary_structures')
      .select('*, salary_deductions(*)')
      .eq('employee_id', employee_id)
      .eq('is_current', true)
      .maybeSingle();
    if (!current) return res.status(400).json({ error: 'No current salary structure' });

    const { data: increment, error } = await supabaseAdmin.from('salary_increments').insert({
      employee_id,
      old_basic: current.basic_salary,
      new_basic,
      increment_percentage: current.basic_salary
        ? Number((((new_basic - current.basic_salary) / current.basic_salary) * 100).toFixed(2))
        : 0,
      effective_date,
      reason,
      approved_by: req.user.id,
    }).select().single();
    if (error) throw error;

    await supabaseAdmin.from('salary_structures').update({ is_current: false }).eq('employee_id', employee_id);
    const { data: structure } = await supabaseAdmin.from('salary_structures').insert({
      employee_id,
      effective_date,
      basic_salary: new_basic,
      hra: hra ?? current.hra,
      transport_allowance: transport_allowance ?? current.transport_allowance,
      medical_allowance: medical_allowance ?? current.medical_allowance,
      other_allowances: other_allowances ?? current.other_allowances,
      created_by: req.user.id,
    }).select().single();

    if (current.salary_deductions?.length && structure) {
      await supabaseAdmin.from('salary_deductions').insert(
        current.salary_deductions.map(({ id, salary_structure_id, created_at, ...d }) => ({
          ...d,
          salary_structure_id: structure.id,
        }))
      );
    }

    await writeAuditLog({
      userId: req.user.id, action: 'CREATE', tableName: 'salary_increments',
      recordId: increment.id, newData: increment, ipAddress: req.ip,
    });

    return res.status(201).json({ data: increment });
  } catch (err) {
    logger.error('Increment error:', err);
    return res.status(500).json({ error: 'Failed to record increment' });
  }
});

module.exports = router;
