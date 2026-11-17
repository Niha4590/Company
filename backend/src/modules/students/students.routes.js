const express = require('express');
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const { writeAuditLog } = require('../../middleware/audit');
const logger = require('../../config/logger');

const router = express.Router();
router.use(authenticate);
const STU_ROLES = ['super_admin', 'hr', 'faculty'];

// ── Generate unique student code
const generateStudentCode = async () => {
  const { count } = await supabaseAdmin.from('students').select('*', { count: 'exact', head: true });
  return `STU-${String((count || 0) + 1).padStart(4, '0')}`;
};

// ── GET /api/students
router.get('/', authorize(...STU_ROLES), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status = 'active' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('students')
      .select(`
        id, student_code, first_name, last_name, email, phone, admission_date, status, date_of_birth, gender, address, guardian_name, guardian_phone,
        enrollments(id, status, batch_id, enrolled_on, batches(id, name, start_date, end_date, faculty_id, courses(id, name, code, duration_months, fee_amount, description))),
        fee_invoices(id, invoice_number, total_amount, due_date, status, description, created_at, fee_payments(id, amount, payment_mode, payment_date, transaction_reference))
      `, { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,student_code.ilike.%${search}%`);
    query = query.order('created_at', { ascending: false }).range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    logger.error('Fetch students error:', err);
    return res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ── GET /api/students/:id
router.get('/:id', async (req, res) => {
  try {
    // Students can only see themselves
    let id = req.params.id;
    if (id === 'me' || req.user.roleName === 'student') {
      const { data: s } = await supabaseAdmin.from('students').select('id').eq('user_id', req.user.id).single();
      id = s?.id;
    }
    if (!id) return res.status(404).json({ error: 'Student record not found' });

    const { data, error } = await supabaseAdmin.from('students')
      .select(`
        *,
        enrollments(id, status, batch_id, enrolled_on, batches(id, name, start_date, end_date, faculty_id, courses(id, name, code, duration_months, fee_amount, description), employees!batches_faculty_id_fkey(first_name, last_name))),
        fee_invoices(*, fee_payments(*))
      `)
      .eq('id', id).single();
    if (error) return res.status(404).json({ error: 'Student not found' });
    return res.json({ data });
  } catch (err) {
    logger.error('Fetch student error:', err);
    return res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// ── POST /api/students
router.post('/', authorize(...STU_ROLES), async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone, date_of_birth, gender, address,
      guardian_name, guardian_phone, admission_date,
      batch_id, payment_plan, plan_details
    } = req.body;

    const code = await generateStudentCode();
    const tempPassword = `${first_name.toLowerCase()}@${code}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { data: stuRole } = await supabaseAdmin.from('roles').select('id').eq('name', 'student').single();
    const { data: newUser, error: userErr } = await supabaseAdmin.from('users').insert({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role_id: stuRole.id,
    }).select().single();

    if (userErr) {
      if (userErr.code === '23505') return res.status(409).json({ error: 'Email already exists' });
      throw userErr;
    }

    await supabaseAdmin.from('user_profiles').insert({
      user_id: newUser.id,
      full_name: `${first_name} ${last_name}`,
      phone: phone || null,
    });

    const { data: student, error: stuErr } = await supabaseAdmin.from('students').insert({
      student_code: code,
      user_id: newUser.id,
      first_name,
      last_name,
      email: email.toLowerCase(),
      phone: phone || null,
      date_of_birth: date_of_birth || null,
      gender: gender || null,
      address: address || null,
      guardian_name: guardian_name || null,
      guardian_phone: guardian_phone || null,
      admission_date: admission_date || new Date().toISOString().split('T')[0],
      status: 'active',
      created_by: req.user.id,
    }).select().single();

    if (stuErr) {
      await supabaseAdmin.from('users').delete().eq('id', newUser.id);
      throw stuErr;
    }

    let enrollment = null;
    let invoice = null;

    // If batch selected, enroll student
    if (batch_id) {
      const { data: enrData, error: enrErr } = await supabaseAdmin.from('enrollments').insert({
        student_id: student.id,
        batch_id,
        status: 'active',
        enrolled_on: admission_date || new Date().toISOString().split('T')[0],
      }).select().single();

      if (!enrErr) {
        enrollment = enrData;

        // If payment plan specified, create invoice with plan details
        if (plan_details) {
          const invNumber = `INV-${Date.now()}`;
          const planMeta = JSON.stringify({
            plan_key: payment_plan || plan_details.plan_key,
            plan_name: plan_details.plan_name,
            base_fee: plan_details.base_fee,
            gst: plan_details.gst,
            standard_total: plan_details.standard_total,
            discount_percent: plan_details.discount_percent,
            discount_amount: plan_details.discount_amount,
            net_payable: plan_details.net_payable,
            monthly_installment: plan_details.monthly_installment,
            months: plan_details.months,
            payment_type: plan_details.payment_type || (payment_plan === 'cash' ? 'cash' : 'emi'),
          });

          const { data: invData } = await supabaseAdmin.from('fee_invoices').insert({
            student_id: student.id,
            enrollment_id: enrollment?.id || null,
            invoice_number: invNumber,
            total_amount: Number(plan_details.net_payable) || 0,
            due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            status: 'unpaid',
            description: planMeta,
            created_by: req.user.id,
          }).select().single();
          invoice = invData;
        }
      }
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      tableName: 'students',
      recordId: student.id,
      newData: { ...student, batch_id, payment_plan },
      ipAddress: req.ip
    });

    return res.status(201).json({
      data: { ...student, enrollment, invoice },
      message: `Student created successfully. Temp password: ${tempPassword}`
    });
  } catch (err) {
    logger.error('Create student error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create student' });
  }
});

// ── POST /api/students/:id/assign-plan
router.post('/:id/assign-plan', authorize(...STU_ROLES), async (req, res) => {
  try {
    const studentId = req.params.id;
    const { batch_id, payment_plan, plan_details } = req.body;

    let enrollment = null;
    if (batch_id) {
      const { data: existingEnr } = await supabaseAdmin.from('enrollments')
        .select('id, batch_id')
        .eq('student_id', studentId)
        .maybeSingle();

      if (existingEnr) {
        const { data: updEnr } = await supabaseAdmin.from('enrollments')
          .update({ batch_id, status: 'active' })
          .eq('id', existingEnr.id)
          .select().single();
        enrollment = updEnr;
      } else {
        const { data: newEnr } = await supabaseAdmin.from('enrollments').insert({
          student_id: studentId,
          batch_id,
          status: 'active',
        }).select().single();
        enrollment = newEnr;
      }
    }

    let invoice = null;
    if (plan_details) {
      const planMeta = JSON.stringify({
        plan_key: payment_plan || plan_details.plan_key,
        plan_name: plan_details.plan_name,
        base_fee: plan_details.base_fee,
        gst: plan_details.gst,
        standard_total: plan_details.standard_total,
        discount_percent: plan_details.discount_percent,
        discount_amount: plan_details.discount_amount,
        net_payable: plan_details.net_payable,
        monthly_installment: plan_details.monthly_installment,
        months: plan_details.months,
        payment_type: plan_details.payment_type || (payment_plan === 'cash' ? 'cash' : 'emi'),
      });

      const { data: existingInv } = await supabaseAdmin.from('fee_invoices')
        .select('id, status')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingInv && existingInv.status === 'unpaid') {
        const { data: updInv } = await supabaseAdmin.from('fee_invoices')
          .update({
            total_amount: Number(plan_details.net_payable) || 0,
            description: planMeta,
            enrollment_id: enrollment?.id || null,
          })
          .eq('id', existingInv.id)
          .select().single();
        invoice = updInv;
      } else {
        const invNumber = `INV-${Date.now()}`;
        const { data: newInv } = await supabaseAdmin.from('fee_invoices').insert({
          student_id: studentId,
          enrollment_id: enrollment?.id || null,
          invoice_number: invNumber,
          total_amount: Number(plan_details.net_payable) || 0,
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          status: 'unpaid',
          description: planMeta,
          created_by: req.user.id,
        }).select().single();
        invoice = newInv;
      }
    }

    return res.json({
      success: true,
      data: { enrollment, invoice },
      message: 'Payment plan and batch assigned successfully'
    });
  } catch (err) {
    logger.error('Assign plan error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to assign plan' });
  }
});

// ── Courses & Batches ─────────────────────────────────────

router.get('/courses/list', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('courses').select('*').eq('is_active', true).order('name');
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.post('/courses', authorize(...STU_ROLES), async (req, res) => {
  try {
    const { name, code, description, duration_months, fee_amount, is_active } = req.body;
    const { data, error } = await supabaseAdmin.from('courses').insert({
      name,
      code,
      description: description || null,
      duration_months: Number(duration_months) || 6,
      fee_amount: Number(fee_amount) || 0,
      is_active: is_active !== undefined ? is_active : true,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    logger.error('Create course error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to create course' });
  }
});

router.get('/batches/list', async (req, res) => {
  try {
    const { course_id } = req.query;
    let q = supabaseAdmin.from('batches').select('*, courses(id, name, fee_amount, description), employees!batches_faculty_id_fkey(first_name, last_name)');
    if (course_id) q = q.eq('course_id', course_id);
    const { data, error } = await q.order('start_date', { ascending: false });
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    logger.error('Fetch batches error:', err);
    return res.status(500).json({ error: 'Failed' });
  }
});

router.post('/batches', authorize(...STU_ROLES), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('batches').insert(req.body).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to create batch' }); }
});

router.post('/enrollments', authorize(...STU_ROLES), async (req, res) => {
  try {
    const { student_id, batch_id } = req.body;
    const { data, error } = await supabaseAdmin.from('enrollments').insert({
      student_id, batch_id, status: 'active',
    }).select().single();
    if (error && error.code === '23505') return res.status(409).json({ error: 'Already enrolled' });
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to enroll' }); }
});

// ── Fee Invoices ─────────────────────────────────────────

router.get('/:id/invoices', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('fee_invoices')
      .select('*, fee_payments(*)')
      .eq('student_id', req.params.id)
      .order('created_at', { ascending: false });
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/invoices', authorize(...STU_ROLES, 'finance'), async (req, res) => {
  try {
    const num = `INV-${Date.now()}`;
    const { data, error } = await supabaseAdmin.from('fee_invoices').insert({
      ...req.body, student_id: req.params.id, invoice_number: num, created_by: req.user.id,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to create invoice' }); }
});

router.post('/invoices/:id/payment', authorize(...STU_ROLES, 'finance'), async (req, res) => {
  try {
    const { amount, payment_mode = 'cash', transaction_reference = '', payment_date, notes } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid payment amount greater than zero' });
    }

    const { data: inv, error: invErr } = await supabaseAdmin.from('fee_invoices')
      .select('*, fee_payments(amount)')
      .eq('id', req.params.id)
      .single();
    if (invErr || !inv) return res.status(404).json({ error: 'Invoice not found' });

    const totalInvoiceAmount = Number(inv.total_amount || 0);
    const existingPaid = (inv.fee_payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const remainingBefore = Math.max(0, totalInvoiceAmount - existingPaid);

    if (numAmount > remainingBefore) {
      return res.status(400).json({
        error: `Payment amount (₹${numAmount.toLocaleString()}) exceeds remaining balance of ₹${remainingBefore.toLocaleString()}`
      });
    }

    const { data: paymentRecord, error } = await supabaseAdmin.from('fee_payments').insert({
      invoice_id: req.params.id,
      amount: numAmount,
      payment_mode,
      transaction_reference: transaction_reference || null,
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      notes: notes || null,
      received_by: req.user.id,
    }).select().single();
    if (error) throw error;

    const newTotalPaid = existingPaid + numAmount;
    const remainingAfter = Math.max(0, totalInvoiceAmount - newTotalPaid);
    const newStatus = remainingAfter <= 0 ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';
    await supabaseAdmin.from('fee_invoices').update({ status: newStatus }).eq('id', req.params.id);

    await writeAuditLog({
      userId: req.user.id,
      action: 'PAYMENT',
      tableName: 'fee_payments',
      recordId: paymentRecord.id,
      newData: {
        invoice_id: req.params.id,
        amount: numAmount,
        payment_mode,
        total_paid: newTotalPaid,
        remaining_balance: remainingAfter,
        status: newStatus
      },
      ipAddress: req.ip
    });

    return res.status(201).json({
      data: paymentRecord,
      total_paid: newTotalPaid,
      remaining_balance: remainingAfter,
      status: newStatus,
      message: `Payment of ₹${numAmount.toLocaleString()} recorded. Remaining balance: ₹${remainingAfter.toLocaleString()} (${newStatus.toUpperCase()})`
    });
  } catch (err) {
    logger.error('Record payment error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to record payment' });
  }
});

router.post('/:id/payment', authorize(...STU_ROLES, 'finance'), async (req, res) => {
  try {
    const studentId = req.params.id;
    const { amount, payment_mode = 'cash', transaction_reference = '', payment_date, notes } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid payment amount greater than zero' });
    }

    const { data: invoices, error: invErr } = await supabaseAdmin.from('fee_invoices')
      .select('*, fee_payments(amount)')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (invErr || !invoices || invoices.length === 0) {
      return res.status(404).json({ error: 'No fee invoice found for this student.' });
    }

    const inv = invoices.find(i => i.status !== 'paid') || invoices[0];
    const totalInvoiceAmount = Number(inv.total_amount || 0);
    const existingPaid = (inv.fee_payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);
    const remainingBefore = Math.max(0, totalInvoiceAmount - existingPaid);

    if (numAmount > remainingBefore) {
      return res.status(400).json({
        error: `Payment amount (₹${numAmount.toLocaleString()}) exceeds remaining balance of ₹${remainingBefore.toLocaleString()}`
      });
    }

    const { data: paymentRecord, error } = await supabaseAdmin.from('fee_payments').insert({
      invoice_id: inv.id,
      amount: numAmount,
      payment_mode,
      transaction_reference: transaction_reference || null,
      payment_date: payment_date || new Date().toISOString().split('T')[0],
      notes: notes || null,
      received_by: req.user.id,
    }).select().single();
    if (error) throw error;

    const newTotalPaid = existingPaid + numAmount;
    const remainingAfter = Math.max(0, totalInvoiceAmount - newTotalPaid);
    const newStatus = remainingAfter <= 0 ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';
    await supabaseAdmin.from('fee_invoices').update({ status: newStatus }).eq('id', inv.id);

    return res.status(201).json({
      data: paymentRecord,
      total_paid: newTotalPaid,
      remaining_balance: remainingAfter,
      status: newStatus,
      message: `Payment of ₹${numAmount.toLocaleString()} recorded. Remaining balance: ₹${remainingAfter.toLocaleString()} (${newStatus.toUpperCase()})`
    });
  } catch (err) {
    logger.error('Record student payment error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to record payment' });
  }
});

// ── Exams & Results ─────────────────────────────────────

router.get('/exams/list', authorize(...STU_ROLES), async (req, res) => {
  try {
    const { batch_id } = req.query;
    let q = supabaseAdmin.from('exams').select('*, batches(name, courses(name))');
    if (batch_id) q = q.eq('batch_id', batch_id);
    const { data } = await q.order('exam_date', { ascending: false });
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.post('/exams', authorize(...STU_ROLES), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('exams').insert({ ...req.body, created_by: req.user.id }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.post('/exams/:id/results', authorize(...STU_ROLES), async (req, res) => {
  try {
    const results = req.body.results; // [{ student_id, marks_obtained, grade, remarks }]
    const inserts = results.map((r) => ({ ...r, exam_id: req.params.id, entered_by: req.user.id }));
    const { data, error } = await supabaseAdmin.from('exam_results')
      .upsert(inserts, { onConflict: 'exam_id,student_id' }).select();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to save results' }); }
});

router.get('/:id/results', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('exam_results')
      .select('*, exams(title, exam_date, max_marks, passing_marks, batches(name, courses(name)))')
      .eq('student_id', req.params.id)
      .order('created_at', { ascending: false });
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// ── Placements ────────────────────────────────────────────
router.get('/:id/placements', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('placements').select().eq('student_id', req.params.id);
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/placements', authorize(...STU_ROLES), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('placements').insert({ ...req.body, student_id: req.params.id }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
