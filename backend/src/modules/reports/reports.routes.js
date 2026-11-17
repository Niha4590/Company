const express = require('express');
const ExcelJS = require('exceljs');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const logger = require('../../config/logger');

const router = express.Router();
router.use(authenticate);
router.use(authorize('super_admin', 'hr', 'finance', 'manager'));

// ── Dashboard summary
router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;

    const [empCount, stuCount, pendingLeaves, pendingExpenses, todayAttendance, payrollStatus] = await Promise.all([
      supabaseAdmin.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabaseAdmin.from('leave_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('expenses').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('attendance').select('status').eq('date', today),
      supabaseAdmin.from('payroll_runs').select('status, total_net').eq('year', year).eq('month', month),
    ]);

    const attSummary = {
      present: todayAttendance.data?.filter(a => a.status === 'present').length || 0,
      late: todayAttendance.data?.filter(a => a.status === 'late').length || 0,
      absent: todayAttendance.data?.filter(a => a.status === 'absent').length || 0,
      on_leave: todayAttendance.data?.filter(a => a.status === 'on_leave').length || 0,
    };

    return res.json({
      data: {
        employees: empCount.count || 0,
        students: stuCount.count || 0,
        pending_leaves: pendingLeaves.count || 0,
        pending_expenses: pendingExpenses.count || 0,
        today_attendance: attSummary,
        payroll_runs: payrollStatus.data || [],
      },
    });
  } catch (err) {
    logger.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ── Monthly attendance summary for charts
router.get('/attendance/summary', async (req, res) => {
  try {
    const { year = new Date().getFullYear(), department_id } = req.query;
    const result = [];

    for (let m = 1; m <= 12; m++) {
      const start = `${year}-${String(m).padStart(2, '0')}-01`;
      const end = new Date(year, m, 0).toISOString().split('T')[0];

      let q = supabaseAdmin.from('attendance').select('status').gte('date', start).lte('date', end);
      if (department_id) {
        const { data: empIds } = await supabaseAdmin.from('employees').select('id').eq('department_id', department_id);
        if (empIds?.length) q = q.in('employee_id', empIds.map(e => e.id));
      }

      const { data } = await q;
      result.push({
        month: m,
        present: data?.filter(a => a.status === 'present').length || 0,
        late: data?.filter(a => a.status === 'late').length || 0,
        absent: data?.filter(a => a.status === 'absent').length || 0,
      });
    }

    return res.json({ data: result, year });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// ── Leave summary by type
router.get('/leave/summary', async (req, res) => {
  try {
    const { year = new Date().getFullYear(), department_id } = req.query;
    const start = `${year}-01-01`, end = `${year}-12-31`;

    let q = supabaseAdmin.from('leave_requests')
      .select('leave_types(name), status, total_days')
      .gte('from_date', start).lte('from_date', end).eq('status', 'approved');

    const { data } = await q;
    const summary = {};
    data?.forEach((r) => {
      const type = r.leave_types?.name || 'Unknown';
      summary[type] = (summary[type] || 0) + r.total_days;
    });

    return res.json({ data: Object.entries(summary).map(([name, days]) => ({ name, days })) });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// ── Payroll summary for charts
router.get('/payroll/summary', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const { data } = await supabaseAdmin.from('payroll_runs')
      .select('month, year, total_gross, total_deductions, total_net, status')
      .eq('year', year).order('month');
    return res.json({ data: data || [] });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// ── Export employees to Excel
router.get('/export/employees', async (req, res) => {
  try {
    const { department_id, status = 'active' } = req.query;
    let qry = supabaseAdmin.from('employees')
      .select('employee_code, first_name, last_name, email, phone, departments!employees_department_id_fkey(name), designations(title), employment_type, joining_date, status');
    if (status) qry = qry.eq('status', status);
    if (department_id) qry = qry.eq('department_id', department_id);
    const { data } = await qry;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.columns = [
      { header: 'Employee Code', key: 'employee_code', width: 15 },
      { header: 'First Name', key: 'first_name', width: 20 },
      { header: 'Last Name', key: 'last_name', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Designation', key: 'designation', width: 25 },
      { header: 'Type', key: 'employment_type', width: 15 },
      { header: 'Joining Date', key: 'joining_date', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    data?.forEach((emp) => {
      sheet.addRow({
        ...emp,
        department: emp.departments?.name,
        designation: emp.designations?.title,
      });
    });

    // Style header row
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=employees_${new Date().toISOString().split('T')[0]}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error('Export employees error:', err);
    return res.status(500).json({ error: 'Failed to export employees' });
  }
});

// ── Export attendance to CSV
router.get('/export/attendance', async (req, res) => {
  try {
    const { from_date, to_date, department_id } = req.query;

    let qry = supabaseAdmin.from('attendance')
      .select('employees(employee_code, first_name, last_name, departments!employees_department_id_fkey(name)), date, check_in, check_out, working_hours, status');
    if (from_date) qry = qry.gte('date', from_date);
    if (to_date) qry = qry.lte('date', to_date);
    const { data } = await qry.order('date', { ascending: false });

    const rows = [
      'Employee Code,Name,Department,Date,Check In,Check Out,Working Hours,Status',
      ...(data || []).map((r) =>
        [
          r.employees?.employee_code,
          `${r.employees?.first_name} ${r.employees?.last_name}`,
          r.employees?.departments?.name,
          r.date,
          r.check_in ? new Date(r.check_in).toLocaleTimeString() : '',
          r.check_out ? new Date(r.check_out).toLocaleTimeString() : '',
          r.working_hours || '',
          r.status,
        ].join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_${from_date}_${to_date}.csv`);
    return res.send(rows.join('\n'));
  } catch { return res.status(500).json({ error: 'Failed to export attendance' }); }
});

// ── Export payroll run to Excel
router.get('/export/payroll/:run_id', async (req, res) => {
  try {
    const { data: slips } = await supabaseAdmin.from('payslips')
      .select('employees(employee_code, first_name, last_name, departments!employees_department_id_fkey(name)), basic_salary, total_allowances, gross_salary, total_deductions, net_salary, present_days, working_days, payment_status')
      .eq('payroll_run_id', req.params.run_id);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Payroll');
    sheet.columns = [
      { header: 'Employee Code', key: 'code', width: 15 },
      { header: 'Name', key: 'name', width: 30 },
      { header: 'Department', key: 'dept', width: 20 },
      { header: 'Basic', key: 'basic', width: 15 },
      { header: 'Allowances', key: 'allow', width: 15 },
      { header: 'Gross', key: 'gross', width: 15 },
      { header: 'Deductions', key: 'ded', width: 15 },
      { header: 'Net Salary', key: 'net', width: 15 },
      { header: 'Present Days', key: 'days', width: 12 },
      { header: 'Payment', key: 'status', width: 12 },
    ];

    slips?.forEach((s) => {
      sheet.addRow({
        code: s.employees?.employee_code,
        name: `${s.employees?.first_name} ${s.employees?.last_name}`,
        dept: s.employees?.departments?.name,
        basic: s.basic_salary,
        allow: s.total_allowances,
        gross: s.gross_salary,
        ded: s.total_deductions,
        net: s.net_salary,
        days: `${s.present_days}/${s.working_days}`,
        status: s.payment_status,
      });
    });

    sheet.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_${req.params.run_id}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch { return res.status(500).json({ error: 'Export failed' }); }
});

module.exports = router;
