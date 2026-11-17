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
    const { page = 1, limit = 20, search, status = 'active' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('students')
      .select('id, student_code, first_name, last_name, email, phone, admission_date, status', { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,student_code.ilike.%${search}%`);
    query = query.order('created_at', { ascending: false }).range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ── GET /api/students/:id
router.get('/:id', async (req, res) => {
  try {
    // Students can only see themselves
    let id = req.params.id;
    if (req.user.roleName === 'student') {
      const { data: s } = await supabaseAdmin.from('students').select('id').eq('user_id', req.user.id).single();
      id = s?.id;
    }
    const { data, error } = await supabaseAdmin.from('students')
      .select(`*, enrollments(*, batches(*, courses(*)))`)
      .eq('id', id).single();
    if (error) return res.status(404).json({ error: 'Student not found' });
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch student' });
  }
});

// ── POST /api/students
router.post('/', authorize(...STU_ROLES), async (req, res) => {
  try {
    const code = await generateStudentCode();
    const tempPassword = `${req.body.first_name.toLowerCase()}@${code}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { data: stuRole } = await supabaseAdmin.from('roles').select('id').eq('name', 'student').single();
    const { data: newUser, error: userErr } = await supabaseAdmin.from('users').insert({
      email: req.body.email.toLowerCase(),
      password_hash: passwordHash,
      role_id: stuRole.id,
    }).select().single();

    if (userErr) {
      if (userErr.code === '23505') return res.status(409).json({ error: 'Email already exists' });
      throw userErr;
    }

    await supabaseAdmin.from('user_profiles').insert({
      user_id: newUser.id,
      full_name: `${req.body.first_name} ${req.body.last_name}`,
    });

    const { data, error } = await supabaseAdmin.from('students').insert({
      ...req.body,
      student_code: code,
      user_id: newUser.id,
      email: req.body.email.toLowerCase(),
      created_by: req.user.id,
    }).select().single();
    if (error) { await supabaseAdmin.from('users').delete().eq('id', newUser.id); throw error; }

    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'students', recordId: data.id, newData: data, ipAddress: req.ip });
    return res.status(201).json({ data, message: `Student created. Temp password: ${tempPassword}` });
  } catch (err) {
    logger.error('Create student error:', err);
    return res.status(500).json({ error: 'Failed to create student' });
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
    const { data, error } = await supabaseAdmin.from('courses').insert(req.body).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to create course' }); }
});

router.get('/batches/list', async (req, res) => {
  try {
    const { course_id } = req.query;
    let q = supabaseAdmin.from('batches').select('*, courses(name), employees!batches_faculty_id_fkey(first_name, last_name)');
    if (course_id) q = q.eq('course_id', course_id);
    const { data } = await q.order('start_date', { ascending: false });
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
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
    const { data: inv } = await supabaseAdmin.from('fee_invoices').select().eq('id', req.params.id).single();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const { data, error } = await supabaseAdmin.from('fee_payments').insert({
      ...req.body, invoice_id: req.params.id, received_by: req.user.id,
    }).select().single();
    if (error) throw error;

    // Check if fully paid
    const { data: allPayments } = await supabaseAdmin.from('fee_payments').select('amount').eq('invoice_id', req.params.id);
    const paid = allPayments.reduce((s, p) => s + p.amount, 0);
    const newStatus = paid >= inv.total_amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    await supabaseAdmin.from('fee_invoices').update({ status: newStatus }).eq('id', req.params.id);

    return res.status(201).json({ data, message: `Payment recorded. Invoice status: ${newStatus}` });
  } catch { return res.status(500).json({ error: 'Failed to record payment' }); }
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
