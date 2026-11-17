const express = require('express');
const PDFDocument = require('pdfkit');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const { writeAuditLog } = require('../../middleware/audit');
const { addDays } = require('../../utils/hrMath');
const { notifyRoles, notifyUsers } = require('../../utils/notify');
const logger = require('../../config/logger');

const router = express.Router();
router.use(authenticate);
const ALLOWED = ['super_admin', 'hr'];

// ── GET /api/exits/resignations
router.get('/resignations', authorize(...ALLOWED, 'manager'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('resignations')
      .select(`*, employees(id, employee_code, first_name, last_name, departments!employees_department_id_fkey(name))`, { count: 'exact' });
    if (status) query = query.eq('status', status);
    query = query.order('submitted_on', { ascending: false }).range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch resignations' });
  }
});

// ── POST /api/exits/resignations — Employee submits resignation
router.post('/resignations', async (req, res) => {
  try {
    const { reason, notice_period_days = 30, last_working_day, employee_id } = req.body;
    let empId = employee_id;
    if (!empId) {
      const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
      if (!emp) return res.status(404).json({ error: 'Employee not found' });
      empId = emp.id;
    } else if (!['super_admin', 'hr'].includes(req.user.roleName)) {
      return res.status(403).json({ error: 'Only HR can submit resignation for another employee' });
    }

    const submittedOn = new Date().toISOString().split('T')[0];
    const lwd = last_working_day || addDays(submittedOn, notice_period_days);

    const { data, error } = await supabaseAdmin.from('resignations').insert({
      employee_id: empId,
      submitted_on: submittedOn,
      notice_period_days,
      last_working_day: lwd,
      reason,
      status: 'submitted',
    }).select().single();
    if (error) throw error;

    // Create default clearance items
    const departments = ['IT', 'HR', 'Finance', 'Admin', 'Manager'];
    const clearanceItems = departments.map((dept) => ({
      resignation_id: data.id,
      department_name: dept,
      item_description: `${dept} clearance`,
      status: 'pending',
    }));
    await supabaseAdmin.from('clearance_items').insert(clearanceItems);

    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'resignations',
      recordId: data.id, newData: data, ipAddress: req.ip });

    await notifyRoles(['hr', 'super_admin'], {
      notification_type: 'resignation',
      title: 'New resignation submitted',
      message: `Notice period ${notice_period_days} days. Last working day ${lwd}.`,
      reference_type: 'resignation',
      reference_id: data.id,
    });

    return res.status(201).json({ data, message: 'Resignation submitted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit resignation' });
  }
});

// ── PATCH /api/exits/resignations/:id/review
router.patch('/resignations/:id/review', authorize(...ALLOWED), async (req, res) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabaseAdmin.from('resignations')
      .update({ status, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    if (status === 'accepted') {
      // Update employee status
      await supabaseAdmin.from('employees').update({ status: 'resigned' }).eq('id', data.employee_id);
    }

    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to review resignation' });
  }
});

// ── GET /api/exits/resignations/:id — Full exit details
router.get('/resignations/:id', authorize(...ALLOWED), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('resignations')
      .select(`*,
        employees(*, departments!employees_department_id_fkey(name), designations(title)),
        exit_interviews(*),
        clearance_items(*),
        asset_returns(*),
        final_settlements(*)
      `).eq('id', req.params.id).single();
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch exit details' });
  }
});

// ── POST /api/exits/resignations/:id/interview
router.post('/resignations/:id/interview', authorize(...ALLOWED), async (req, res) => {
  try {
    const { responses, overall_rating, comments } = req.body;
    const { data, error } = await supabaseAdmin.from('exit_interviews').insert({
      resignation_id: req.params.id,
      conducted_by: req.user.id,
      conducted_at: new Date().toISOString(),
      responses,
      overall_rating,
      comments,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save exit interview' });
  }
});

// ── PATCH /api/exits/clearance/:id — Update clearance item
router.patch('/clearance/:id', authorize(...ALLOWED, 'manager'), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { data, error } = await supabaseAdmin.from('clearance_items').update({
      status,
      cleared_by: req.user.id,
      cleared_at: status === 'cleared' ? new Date().toISOString() : null,
      notes,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update clearance' });
  }
});

// ── POST /api/exits/resignations/:id/settlement
router.post('/resignations/:id/settlement', authorize(...ALLOWED, 'finance'), async (req, res) => {
  try {
    const { total_amount, components, payment_date, payment_mode, transaction_reference } = req.body;
    const { data, error } = await supabaseAdmin.from('final_settlements').insert({
      resignation_id: req.params.id,
      total_amount,
      components,
      payment_date,
      payment_mode,
      transaction_reference,
      prepared_by: req.user.id,
      status: 'pending',
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create settlement' });
  }
});

router.patch('/settlements/:id', authorize(...ALLOWED, 'finance'), async (req, res) => {
  try {
    const { status, payment_date, payment_mode, transaction_reference } = req.body;
    if (status && !['pending', 'approved', 'paid'].includes(status)) {
      return res.status(400).json({ error: 'Invalid settlement status' });
    }
    const { data, error } = await supabaseAdmin.from('final_settlements').update({
      status,
      payment_date,
      payment_mode,
      transaction_reference,
      approved_by: status === 'approved' || status === 'paid' ? req.user.id : undefined,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update settlement' });
  }
});

router.post('/resignations/:id/assets', authorize(...ALLOWED, 'manager'), async (req, res) => {
  try {
    const { asset_name, asset_code, returned_on, condition, notes } = req.body;
    const { data, error } = await supabaseAdmin.from('asset_returns').insert({
      resignation_id: req.params.id,
      asset_name,
      asset_code,
      returned_on,
      condition,
      notes,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to record asset return' });
  }
});

router.get('/resignations/:id/experience-letter', authorize(...ALLOWED), async (req, res) => {
  try {
    const { data: resignation, error } = await supabaseAdmin.from('resignations')
      .select(`*, employees(*, departments!employees_department_id_fkey(name), designations(title))`)
      .eq('id', req.params.id)
      .single();
    if (error || !resignation) return res.status(404).json({ error: 'Resignation not found' });

    const emp = resignation.employees;
    const letterNumber = `EXP-${emp.employee_code}-${new Date().getFullYear()}`;

    await supabaseAdmin.from('experience_letters').upsert({
      employee_id: emp.id,
      resignation_id: resignation.id,
      letter_number: letterNumber,
      issued_on: new Date().toISOString().split('T')[0],
      issued_by: req.user.id,
    }, { onConflict: 'letter_number' });

    const doc = new PDFDocument({ margin: 60, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=experience_${emp.employee_code}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('EXPERIENCE LETTER', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Ref: ${letterNumber}`, { align: 'right' });
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'right' });
    doc.moveDown(2);
    doc.fontSize(12).text('To whom it may concern,');
    doc.moveDown();
    doc.text(
      `This is to certify that ${emp.first_name} ${emp.last_name} (Employee ID: ${emp.employee_code}) ` +
      `worked with our organisation as ${emp.designations?.title || 'an employee'} ` +
      `in the ${emp.departments?.name || 'company'} department from ${emp.joining_date} ` +
      `to ${resignation.last_working_day}.`
    );
    doc.moveDown();
    doc.text('During their tenure they performed their duties professionally. We wish them success in future endeavours.');
    doc.moveDown(3);
    doc.text('Authorized Signatory');
    doc.text('Human Resources');
    doc.end();
  } catch (err) {
    logger.error('Experience letter error:', err);
    return res.status(500).json({ error: 'Failed to generate experience letter' });
  }
});

module.exports = router;
