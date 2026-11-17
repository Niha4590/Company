const express = require('express');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const logger = require('../../config/logger');

const router = express.Router();
router.use(authenticate);

// ── Announcements ─────────────────────────────────────────

router.get('/announcements', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('announcements')
      .select('*, users!announcements_created_by_fkey(user_profiles(full_name))')
      .or(`audience_roles.cs.["all"],audience_roles.cs.["${req.user.roleName}"]`)
      .lte('published_at', new Date().toISOString())
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(50);
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

router.post('/announcements', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('announcements').insert({
      ...req.body,
      created_by: req.user.id,
      published_at: req.body.published_at || new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to create announcement' }); }
});

// ── Projects ──────────────────────────────────────────────

router.get('/projects', authorize('super_admin', 'hr', 'manager', 'finance'), async (req, res) => {
  try {
    const { status, department_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('projects')
      .select('*, departments(name), employees!projects_lead_employee_id_fkey(first_name, last_name)', { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (department_id) query = query.eq('department_id', department_id);
    query = query.order('created_at', { ascending: false }).range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count } });
  } catch { return res.status(500).json({ error: 'Failed to fetch projects' }); }
});

router.post('/projects', authorize('super_admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('projects').insert({
      ...req.body, created_by: req.user.id,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to create project' }); }
});

router.put('/projects/:id', authorize('super_admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('projects').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed to update project' }); }
});

// ── Tasks ─────────────────────────────────────────────────

router.get('/tasks', async (req, res) => {
  try {
    const { project_id, assigned_to, status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('tasks')
      .select('*, projects(name), employees!tasks_assigned_to_fkey(first_name, last_name)', { count: 'exact' });
    if (project_id) query = query.eq('project_id', project_id);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);
    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false }).range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count } });
  } catch { return res.status(500).json({ error: 'Failed to fetch tasks' }); }
});

router.post('/tasks', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('tasks').insert({
      ...req.body, assigned_by: req.user.id,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to create task' }); }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    if (req.body.status === 'done') updates.completed_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin.from('tasks').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed to update task' }); }
});

// ── Expenses ──────────────────────────────────────────────

router.get('/expenses', authorize('super_admin', 'hr', 'finance', 'manager'), async (req, res) => {
  try {
    const { status, employee_id, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('expenses')
      .select('*, employees(id, employee_code, first_name, last_name)', { count: 'exact' });
    if (status) query = query.eq('status', status);
    if (employee_id) query = query.eq('employee_id', employee_id);
    query = query.order('created_at', { ascending: false }).range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count } });
  } catch { return res.status(500).json({ error: 'Failed to fetch expenses' }); }
});

router.post('/expenses', async (req, res) => {
  try {
    const { data: emp } = await supabaseAdmin.from('employees').select('id').eq('user_id', req.user.id).single();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const { data, error } = await supabaseAdmin.from('expenses').insert({
      ...req.body, employee_id: emp.id, status: 'pending',
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed to submit expense' }); }
});

router.patch('/expenses/:id/review', authorize('super_admin', 'hr', 'finance', 'manager'), async (req, res) => {
  try {
    const { status, reviewer_comments } = req.body;
    const { data, error } = await supabaseAdmin.from('expenses').update({
      status, reviewer_comments, reviewed_by: req.user.id, reviewed_at: new Date().toISOString(),
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed to review expense' }); }
});

// ── Assets ────────────────────────────────────────────────

router.get('/assets', authorize('super_admin', 'hr', 'finance'), async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('assets')
      .select('*, employees!assets_assigned_to_employee_id_fkey(first_name, last_name, employee_code)')
      .order('name');
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.post('/assets', authorize('super_admin', 'hr', 'finance'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('assets').insert(req.body).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// ── Calendar Events ───────────────────────────────────────

router.get('/events', async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let q = supabaseAdmin.from('company_events').select('*');
    if (from_date) q = q.gte('start_date', from_date);
    if (to_date) q = q.lte('start_date', to_date);
    const { data } = await q.order('start_date');
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.post('/events', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('company_events').insert({
      ...req.body, created_by: req.user.id,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// ── Notifications ─────────────────────────────────────────

router.get('/notifications', async (req, res) => {
  try {
    const { data } = await supabaseAdmin.from('notifications')
      .select()
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    return res.json({ data });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.patch('/notifications/:id/read', async (req, res) => {
  try {
    await supabaseAdmin.from('notifications').update({ is_read: true })
      .eq('id', req.params.id).eq('user_id', req.user.id);
    return res.json({ message: 'Marked as read' });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

router.patch('/notifications/read-all', async (req, res) => {
  try {
    await supabaseAdmin.from('notifications').update({ is_read: true }).eq('user_id', req.user.id);
    return res.json({ message: 'All marked as read' });
  } catch { return res.status(500).json({ error: 'Failed' }); }
});

// ── Audit Logs ────────────────────────────────────────────

router.get('/audit-logs', authorize('super_admin'), async (req, res) => {
  try {
    const { table_name, user_id, action, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let query = supabaseAdmin.from('audit_logs')
      .select('*, users!audit_logs_user_id_fkey(email, user_profiles(full_name))', { count: 'exact' });
    if (table_name) query = query.eq('table_name', table_name);
    if (user_id) query = query.eq('user_id', user_id);
    if (action) query = query.eq('action', action);
    query = query.order('created_at', { ascending: false }).range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return res.json({ data, meta: { total: count } });
  } catch { return res.status(500).json({ error: 'Failed to fetch audit logs' }); }
});

module.exports = router;
