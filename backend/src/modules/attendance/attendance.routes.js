const express = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const { writeAuditLog } = require('../../middleware/audit');
const { workingHours } = require('../../utils/hrMath');
const { notifyRoles, notifyUsers } = require('../../utils/notify');
const logger = require('../../config/logger');

const router = express.Router();
router.use(authenticate);

// ── POST /api/attendance/checkin
router.post('/checkin', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Find employee record for current user
    const { data: emp } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (!emp) return res.status(404).json({ error: 'Employee record not found' });

    const { data: existing } = await supabaseAdmin
      .from('attendance')
      .select()
      .eq('employee_id', emp.id)
      .eq('date', today)
      .maybeSingle();

    if (existing?.check_in) {
      return res.status(400).json({ error: 'Already checked in today', data: existing });
    }

    const now = new Date();
    const hour = now.getHours();
    const status = hour >= 10 ? 'late' : 'present';

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .upsert({
        employee_id: emp.id,
        date: today,
        check_in: now.toISOString(),
        status,
      }, { onConflict: 'employee_id,date', ignoreDuplicates: false })
      .select()
      .single();

    if (error) throw error;
    return res.json({ data, message: 'Checked in successfully' });
  } catch (err) {
    logger.error('Check-in error:', err);
    return res.status(500).json({ error: 'Failed to check in' });
  }
});

// ── POST /api/attendance/checkout
router.post('/checkout', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data: emp } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (!emp) return res.status(404).json({ error: 'Employee record not found' });

    const { data: record } = await supabaseAdmin
      .from('attendance')
      .select()
      .eq('employee_id', emp.id)
      .eq('date', today)
      .single();

    if (!record) return res.status(400).json({ error: 'No check-in found for today' });
    if (record.check_out) return res.status(400).json({ error: 'Already checked out' });

    const now = new Date();
    const hours = workingHours(record.check_in, now.toISOString());
    const finalStatus = hours < 4 ? 'half_day' : record.status;

    const { data, error } = await supabaseAdmin
      .from('attendance')
      .update({
        check_out: now.toISOString(),
        working_hours: hours,
        status: finalStatus,
      })
      .eq('id', record.id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ data, message: 'Checked out successfully' });
  } catch (err) {
    logger.error('Check-out error:', err);
    return res.status(500).json({ error: 'Failed to check out' });
  }
});

// ── GET /api/attendance/today — My today's attendance
router.get('/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: emp } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (!emp) return res.json({ data: null });

    const { data } = await supabaseAdmin
      .from('attendance')
      .select()
      .eq('employee_id', emp.id)
      .eq('date', today)
      .single();

    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch today attendance' });
  }
});

// ── GET /api/attendance — List with filters (HR/Manager)
router.get('/', authorize('super_admin', 'hr', 'manager', 'finance'), async (req, res) => {
  try {
    const { employee_id, department_id, from_date, to_date, status, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin
      .from('attendance')
      .select(`
        *,
        employees (id, employee_code, first_name, last_name, department_id,
          departments!employees_department_id_fkey(name))
      `, { count: 'exact' });

    if (employee_id) query = query.eq('employee_id', employee_id);
    if (status) query = query.eq('status', status);
    if (from_date) query = query.gte('date', from_date);
    if (to_date) query = query.lte('date', to_date);
    if (department_id) {
      const { data: empIds } = await supabaseAdmin
        .from('employees')
        .select('id')
        .eq('department_id', department_id);
      query = query.in('employee_id', empIds.map((e) => e.id));
    }

    query = query.order('date', { ascending: false }).range(offset, offset + Number(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({ data, meta: { total: count, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    logger.error('List attendance error:', err);
    return res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// ── GET /api/attendance/my — Employee's own attendance
router.get('/my', async (req, res) => {
  try {
    const { from_date, to_date, year, month } = req.query;
    const { data: emp } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (!emp) return res.json({ data: [] });

    let query = supabaseAdmin.from('attendance').select().eq('employee_id', emp.id);

    if (from_date) query = query.gte('date', from_date);
    if (to_date) query = query.lte('date', to_date);
    if (year && month) {
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const end = new Date(year, month, 0).toISOString().split('T')[0];
      query = query.gte('date', start).lte('date', end);
    }

    query = query.order('date', { ascending: false });
    const { data, error } = await query;
    if (error) throw error;

    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// ── POST /api/attendance/correction — Request correction
router.post('/correction', async (req, res) => {
  try {
    const { attendance_id, corrected_check_in, corrected_check_out, reason } = req.body;

    const { data: record } = await supabaseAdmin.from('attendance').select().eq('id', attendance_id).single();
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });

    const { data, error } = await supabaseAdmin.from('attendance_corrections').insert({
      attendance_id,
      original_check_in: record.check_in,
      original_check_out: record.check_out,
      corrected_check_in,
      corrected_check_out,
      reason,
      requested_by: req.user.id,
      status: 'pending',
    }).select().single();

    if (error) throw error;
    await notifyRoles(['hr', 'manager', 'super_admin'], {
      notification_type: 'attendance_correction',
      title: 'Attendance correction requested',
      message: reason || 'An employee requested an attendance correction',
      reference_type: 'attendance_correction',
      reference_id: data.id,
    });
    return res.status(201).json({ data, message: 'Correction request submitted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit correction' });
  }
});

// ── POST /api/attendance/correction/:id/approve
router.post('/correction/:id/approve', authorize('super_admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { status } = req.body; // approved | rejected

    const { data: correction } = await supabaseAdmin
      .from('attendance_corrections')
      .select()
      .eq('id', req.params.id)
      .single();

    if (!correction) return res.status(404).json({ error: 'Correction not found' });

    await supabaseAdmin.from('attendance_corrections').update({
      status,
      approved_by: req.user.id,
    }).eq('id', req.params.id);

    if (status === 'approved') {
      const hours = workingHours(correction.corrected_check_in, correction.corrected_check_out);
      await supabaseAdmin.from('attendance').update({
        check_in: correction.corrected_check_in,
        check_out: correction.corrected_check_out,
        working_hours: hours,
        is_corrected: true,
      }).eq('id', correction.attendance_id);
    }

    await writeAuditLog({
      userId: req.user.id, action: 'UPDATE', tableName: 'attendance_corrections',
      recordId: req.params.id, newData: { status }, ipAddress: req.ip,
    });

    if (correction.requested_by) {
      await notifyUsers([correction.requested_by], {
        notification_type: 'attendance_correction',
        title: `Attendance correction ${status}`,
        message: `Your attendance correction was ${status}.`,
        reference_type: 'attendance_correction',
        reference_id: correction.id,
      });
    }

    return res.json({ message: `Correction ${status}` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to process correction' });
  }
});

// ── GET /api/attendance/corrections — Pending / filtered corrections
router.get('/corrections/list', authorize('super_admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    let query = supabaseAdmin
      .from('attendance_corrections')
      .select('*, attendance(*, employees(id, first_name, last_name, employee_code))')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch corrections' });
  }
});

// ── GET /api/attendance/report/monthly — Monthly report
router.get('/report/monthly', authorize('super_admin', 'hr', 'manager', 'finance'), async (req, res) => {
  try {
    const { year, month, department_id } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0).toISOString().split('T')[0];

    let empQuery = supabaseAdmin
      .from('employees')
      .select('id, employee_code, first_name, last_name, departments!employees_department_id_fkey(name)')
      .eq('status', 'active');
    if (department_id) empQuery = empQuery.eq('department_id', department_id);

    const { data: employees } = await empQuery;
    const empIds = employees.map((e) => e.id);

    const { data: records } = await supabaseAdmin
      .from('attendance')
      .select()
      .in('employee_id', empIds)
      .gte('date', start)
      .lte('date', end);

    const report = employees.map((emp) => {
      const empRecords = records.filter((r) => r.employee_id === emp.id);
      return {
        employee: emp,
        present: empRecords.filter((r) => r.status === 'present').length,
        late: empRecords.filter((r) => r.status === 'late').length,
        half_day: empRecords.filter((r) => r.status === 'half_day').length,
        absent: empRecords.filter((r) => r.status === 'absent').length,
        total_hours: empRecords.reduce((s, r) => s + (r.working_hours || 0), 0).toFixed(2),
      };
    });

    return res.json({ data: report, period: { year, month } });
  } catch (err) {
    logger.error('Monthly report error:', err);
    return res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ── POST /api/attendance/admin/mark — HR marks attendance for an employee
router.post('/admin/mark', authorize('super_admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { employee_id, date, status, check_in, check_out, notes } = req.body;
    if (!employee_id || !date || !status) {
      return res.status(400).json({ error: 'employee_id, date, and status are required' });
    }
    const validStatuses = ['present', 'absent', 'late', 'half_day', 'holiday', 'on_leave'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }
    const hours = (check_in && check_out) ? workingHours(check_in, check_out) : null;
    const { data, error } = await supabaseAdmin.from('attendance').upsert({
      employee_id, date, status,
      check_in: check_in || null,
      check_out: check_out || null,
      working_hours: hours,
      notes: notes || null,
    }, { onConflict: 'employee_id,date' }).select().single();
    if (error) throw error;
    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'attendance', recordId: data.id, newData: data, ipAddress: req.ip });
    return res.status(201).json({ data, message: 'Attendance marked successfully' });
  } catch (err) {
    logger.error('Admin mark attendance error:', err);
    return res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

module.exports = router;
