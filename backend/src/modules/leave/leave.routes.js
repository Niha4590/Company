const express = require('express');
const { z } = require('zod');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { writeAuditLog } = require('../../middleware/audit');
const { inclusiveDayCount } = require('../../utils/hrMath');
const { notifyRoles, notifyUsers } = require('../../utils/notify');
const logger = require('../../config/logger');

const router = express.Router();
router.use(authenticate);

// ── Schemas ───────────────────────────────────────────────
const applySchema = z.object({
  leave_type_id: z.string().uuid(),
  from_date: z.string(),
  to_date: z.string(),
  reason: z.string().min(5),
  supporting_document_url: z.string().url().optional(),
});

// ── GET /api/leave/types
router.get('/types', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('leave_types').select().eq('is_active', true).order('name');
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch leave types' });
  }
});

// ── POST /api/leave/types (HR only)
router.post('/types', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('leave_types').insert(req.body).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create leave type' });
  }
});

// ── GET /api/leave/balances — Own balances (or by emp_id for HR)
router.get('/balances', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    let employeeId = req.query.employee_id;

    if (!employeeId) {
      const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
      employeeId = emp?.id;
    }

    if (!employeeId) return res.json({ data: [] });

    const { data, error } = await supabaseAdmin
      .from('leave_balances')
      .select('*, leave_types(name, max_days_per_year, is_paid)')
      .eq('employee_id', employeeId)
      .eq('year', year);

    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch leave balances' });
  }
});

// ── POST /api/leave/balances/initialize — HR creates balances for employees
router.post('/balances/initialize', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { year, employee_ids } = req.body;
    const { data: leaveTypes } = await supabaseAdmin.from('leave_types').select().eq('is_active', true);

    const inserts = [];
    for (const empId of employee_ids) {
      for (const lt of leaveTypes) {
        inserts.push({
          employee_id: empId,
          leave_type_id: lt.id,
          year: year || new Date().getFullYear(),
          total_days: lt.max_days_per_year,
          used_days: 0,
        });
      }
    }

    const { error } = await supabaseAdmin.from('leave_balances').upsert(inserts, {
      onConflict: 'employee_id,leave_type_id,year',
      ignoreDuplicates: true,
    });
    if (error) throw error;

    return res.json({ message: `Leave balances initialized for ${employee_ids.length} employees` });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to initialize balances' });
  }
});

// ── POST /api/leave/apply
router.post('/apply', validate(applySchema), async (req, res) => {
  try {
    const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
    if (!emp) return res.status(404).json({ error: 'Employee record not found' });

    const from = new Date(req.body.from_date);
    const to = new Date(req.body.to_date);
    if (to < from) return res.status(400).json({ error: 'to_date must be after from_date' });

    const totalDays = inclusiveDayCount(req.body.from_date, req.body.to_date);

    // Check balance
    const year = from.getFullYear();
    const { data: balance } = await supabaseAdmin
      .from('leave_balances')
      .select()
      .eq('employee_id', emp.id)
      .eq('leave_type_id', req.body.leave_type_id)
      .eq('year', year)
      .single();

    if (balance && balance.remaining_days < totalDays) {
      return res.status(400).json({ error: `Insufficient leave balance. Available: ${balance.remaining_days} days` });
    }

    const { data, error } = await supabaseAdmin.from('leave_requests').insert({
      ...req.body,
      employee_id: emp.id,
      total_days: totalDays,
      status: 'pending',
    }).select().single();

    if (error) throw error;

    await notifyRoles(['hr', 'manager', 'super_admin'], {
      notification_type: 'leave_request',
      title: 'New leave application',
      message: `A leave request for ${totalDays} day(s) from ${req.body.from_date} to ${req.body.to_date} is pending review.`,
      reference_type: 'leave_request',
      reference_id: data.id,
    });

    return res.status(201).json({ data, message: 'Leave request submitted' });
  } catch (err) {
    logger.error('Apply leave error:', err);
    return res.status(500).json({ error: 'Failed to apply for leave' });
  }
});

// ── GET /api/leave/requests — List (HR sees all, employee sees own)
router.get('/requests', async (req, res) => {
  try {
    const { status, employee_id, from_date, to_date, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin
      .from('leave_requests')
      .select(`
        *,
        employees (id, employee_code, first_name, last_name, departments!employees_department_id_fkey(name)),
        leave_types (name, is_paid),
        reviewer:users!leave_requests_reviewed_by_fkey (user_profiles(full_name))
      `, { count: 'exact' });

    // Employees only see own leaves
    if (['employee', 'faculty', 'student'].includes(req.user.roleName)) {
      const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
      if (emp) query = query.eq('employee_id', emp.id);
    } else if (employee_id) {
      query = query.eq('employee_id', employee_id);
    }

    if (status) query = query.eq('status', status);
    if (from_date) query = query.gte('from_date', from_date);
    if (to_date) query = query.lte('to_date', to_date);

    query = query.order('created_at', { ascending: false }).range(offset, offset + Number(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;

    return res.json({ data, meta: { total: count, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch leave requests' });
  }
});

// ── POST /api/leave/requests/:id/review — Approve/Reject
router.post('/requests/:id/review', authorize('super_admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { status, reviewer_comments } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    const { data: leave } = await supabaseAdmin.from('leave_requests').select().eq('id', req.params.id).single();
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Leave is already reviewed' });

    const { data, error } = await supabaseAdmin.from('leave_requests').update({
      status,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
      reviewer_comments,
    }).eq('id', req.params.id).select().single();

    if (error) throw error;

    if (status === 'approved') {
      const year = new Date(leave.from_date).getFullYear();
      const { error: rpcErr } = await supabaseAdmin.rpc('increment_leave_used', {
        p_employee_id: leave.employee_id,
        p_leave_type_id: leave.leave_type_id,
        p_year: year,
        p_days: leave.total_days,
      });
      if (rpcErr) {
        const { data: bal } = await supabaseAdmin.from('leave_balances')
          .select('id, used_days')
          .eq('employee_id', leave.employee_id)
          .eq('leave_type_id', leave.leave_type_id)
          .eq('year', year)
          .maybeSingle();
        if (bal) {
          await supabaseAdmin.from('leave_balances')
            .update({ used_days: Number(bal.used_days) + Number(leave.total_days) })
            .eq('id', bal.id);
        }
      }

      // Mark attendance as on_leave
      const from = new Date(leave.from_date);
      const to = new Date(leave.to_date);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        await supabaseAdmin.from('attendance').upsert({
          employee_id: leave.employee_id,
          date: dateStr,
          status: 'on_leave',
        }, { onConflict: 'employee_id,date' });
      }
    }

    // Send notification to employee
    const { data: empUser } = await supabaseAdmin.from('employees').select('user_id, first_name').eq('id', leave.employee_id).single();
    if (empUser?.user_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: empUser.user_id,
        notification_type: 'leave_decision',
        title: `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: `Your leave request from ${leave.from_date} to ${leave.to_date} has been ${status}.${reviewer_comments ? ' Comment: ' + reviewer_comments : ''}`,
        reference_type: 'leave_request',
        reference_id: leave.id,
      });
    }

    await writeAuditLog({
      userId: req.user.id, action: 'UPDATE', tableName: 'leave_requests',
      recordId: req.params.id, newData: { status }, ipAddress: req.ip,
    });

    return res.json({ data, message: `Leave ${status}` });
  } catch (err) {
    logger.error('Review leave error:', err);
    return res.status(500).json({ error: 'Failed to review leave' });
  }
});

// ── DELETE /api/leave/requests/:id — Cancel (by employee, only pending)
router.delete('/requests/:id', async (req, res) => {
  try {
    const { data: leave } = await supabaseAdmin.from('leave_requests').select().eq('id', req.params.id).single();
    if (!leave) return res.status(404).json({ error: 'Leave request not found' });
    if (leave.status !== 'pending') return res.status(400).json({ error: 'Only pending leaves can be cancelled' });
    const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).maybeSingle();
    const privileged = ['super_admin', 'hr'].includes(req.user.roleName);
    if (!privileged && emp?.id !== leave.employee_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await supabaseAdmin.from('leave_requests').update({ status: 'cancelled' }).eq('id', req.params.id);
    return res.json({ message: 'Leave request cancelled' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to cancel leave' });
  }
});

module.exports = router;
