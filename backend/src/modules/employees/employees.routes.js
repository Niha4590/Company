const express = require('express');
const bcrypt = require('bcryptjs');
const { supabaseAdmin } = require('../../config/supabase');
const { authenticate, authorize } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { writeAuditLog } = require('../../middleware/audit');
const { canViewSensitive, stripSensitive } = require('../../utils/sensitive');
const { notifyRoles } = require('../../utils/notify');
const logger = require('../../config/logger');
const { createSchema, updateSchema } = require('./employees.schema');

const router = express.Router();
router.use(authenticate);

const generateEmployeeCode = async () => {
  const { count } = await supabaseAdmin
    .from('employees')
    .select('*', { count: 'exact', head: true });
  const num = String((count || 0) + 1).padStart(4, '0');
  return `EMP-${num}`;
};

const sanitizeSearch = (value) => String(value || '').replace(/[%_,]/g, ' ').trim();

async function saveSalaryStructure(employeeId, salary, userId) {
  if (!salary) return null;
  await supabaseAdmin.from('salary_structures').update({ is_current: false }).eq('employee_id', employeeId);
  const { data: structure, error } = await supabaseAdmin.from('salary_structures').insert({
    employee_id: employeeId,
    effective_date: salary.effective_date,
    basic_salary: salary.basic_salary,
    hra: salary.hra || 0,
    transport_allowance: salary.transport_allowance || 0,
    medical_allowance: salary.medical_allowance || 0,
    other_allowances: salary.other_allowances || 0,
    created_by: userId,
  }).select().single();
  if (error) throw error;
  if (salary.deductions?.length) {
    await supabaseAdmin.from('salary_deductions').insert(
      salary.deductions.map((d) => ({ ...d, salary_structure_id: structure.id }))
    );
  }
  return structure;
}

// Static list routes MUST be registered before /:id
router.get('/departments/list', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('*, head:employees!fk_dept_head(id, first_name, last_name)')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.get('/designations/list', async (req, res) => {
  try {
    const { department_id } = req.query;
    let query = supabaseAdmin
      .from('designations')
      .select('*, departments(name)')
      .eq('is_active', true)
      .order('title');
    if (department_id) query = query.eq('department_id', department_id);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch designations' });
  }
});

// ── Department Management (full CRUD)
router.get('/departments', authorize('super_admin', 'hr', 'manager', 'finance'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('*, head:employees!fk_dept_head(id, first_name, last_name), parent:departments(name)')
      .order('name');
    if (error) throw error;
    // Count employees per dept
    const { data: empCounts } = await supabaseAdmin.from('employees').select('department_id').eq('status', 'active');
    const countMap = {};
    (empCounts || []).forEach(e => { countMap[e.department_id] = (countMap[e.department_id] || 0) + 1; });
    return res.json({ data: (data || []).map(d => ({ ...d, employee_count: countMap[d.id] || 0 })) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.post('/departments', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { name, description, parent_dept_id, head_employee_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required' });
    const { data, error } = await supabaseAdmin.from('departments').insert({
      name: name.trim(), description, parent_dept_id: parent_dept_id || null, head_employee_id: head_employee_id || null,
    }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Department name already exists' });
      throw error;
    }
    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'departments', recordId: data.id, newData: data, ipAddress: req.ip });
    return res.status(201).json({ data });
  } catch (err) {
    logger.error('Create department error:', err);
    return res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/departments/:id', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { name, description, parent_dept_id, head_employee_id, is_active } = req.body;
    const { data, error } = await supabaseAdmin.from('departments').update({
      name, description, parent_dept_id: parent_dept_id || null,
      head_employee_id: head_employee_id || null, is_active,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    await writeAuditLog({ userId: req.user.id, action: 'UPDATE', tableName: 'departments', recordId: req.params.id, newData: data, ipAddress: req.ip });
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/departments/:id', authorize('super_admin'), async (req, res) => {
  try {
    const { count } = await supabaseAdmin.from('employees').select('*', { count: 'exact', head: true }).eq('department_id', req.params.id).eq('status', 'active');
    if (count > 0) return res.status(400).json({ error: `Cannot delete department with ${count} active employees` });
    await supabaseAdmin.from('departments').update({ is_active: false }).eq('id', req.params.id);
    await writeAuditLog({ userId: req.user.id, action: 'DELETE', tableName: 'departments', recordId: req.params.id, ipAddress: req.ip });
    return res.json({ message: 'Department deactivated' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete department' });
  }
});

// ── Designation Management (full CRUD)
router.get('/designations', authorize('super_admin', 'hr', 'manager', 'finance'), async (req, res) => {
  try {
    const { department_id } = req.query;
    let query = supabaseAdmin.from('designations').select('*, departments(name)').order('title');
    if (department_id) query = query.eq('department_id', department_id);
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch designations' });
  }
});

router.post('/designations', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { title, department_id, grade } = req.body;
    if (!title) return res.status(400).json({ error: 'Designation title is required' });
    const { data, error } = await supabaseAdmin.from('designations').insert({
      title: title.trim(), department_id: department_id || null, grade,
    }).select().single();
    if (error) throw error;
    await writeAuditLog({ userId: req.user.id, action: 'CREATE', tableName: 'designations', recordId: data.id, newData: data, ipAddress: req.ip });
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create designation' });
  }
});

router.put('/designations/:id', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { title, department_id, grade, is_active } = req.body;
    const { data, error } = await supabaseAdmin.from('designations').update({
      title, department_id: department_id || null, grade, is_active,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    await writeAuditLog({ userId: req.user.id, action: 'UPDATE', tableName: 'designations', recordId: req.params.id, newData: data, ipAddress: req.ip });
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update designation' });
  }
});

router.delete('/designations/:id', authorize('super_admin'), async (req, res) => {
  try {
    await supabaseAdmin.from('designations').update({ is_active: false }).eq('id', req.params.id);
    return res.json({ message: 'Designation deactivated' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete designation' });
  }
});

router.get('/managers/list', authorize('super_admin', 'hr', 'manager'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id, first_name, last_name, employee_code, designations(title)')
      .eq('status', 'active')
      .order('first_name');
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch managers' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id, employee_code, first_name, last_name, status, department_id, designation_id')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.get('/', authorize('super_admin', 'hr', 'manager', 'finance'), async (req, res) => {
  try {
    const {
      page = 1, limit = 20, search = '', department_id, status = 'active',
      employment_type, sort = 'created_at', order = 'desc', salary_status,
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    const q = sanitizeSearch(search);

    let query = supabaseAdmin
      .from('employees')
      .select(`
        id, employee_code, first_name, last_name, email, phone, gender,
        employment_type, joining_date, probation_end_date, status, manager_id,
        departments!employees_department_id_fkey (id, name),
        designations (id, title),
        salary_structures (gross_salary, basic_salary, is_current),
        payslips (id, net_salary, payment_status, created_at)
      `, { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (department_id) query = query.eq('department_id', department_id);
    if (employment_type) query = query.eq('employment_type', employment_type);
    if (q) {
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,employee_code.ilike.%${q}%`
      );
    }

    query = query.order(sort, { ascending: order === 'asc' });
    query = query.range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    let enriched = (data || []).map((emp) => {
      const currentStruct = (emp.salary_structures || []).find((s) => s.is_current) || emp.salary_structures?.[0];
      const sortedSlips = (emp.payslips || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const latestSlip = sortedSlips[0];
      const salaryAmount = latestSlip ? Number(latestSlip.net_salary) : Number(currentStruct?.gross_salary || currentStruct?.basic_salary || 50000);
      const sStatus = latestSlip ? latestSlip.payment_status : 'pending';

      return {
        ...emp,
        salary_amount: salaryAmount,
        salary_status: sStatus,
        latest_payslip_id: latestSlip?.id || null,
      };
    });

    if (salary_status) {
      enriched = enriched.filter((e) => e.salary_status === salary_status);
    }

    return res.json({
      data: enriched,
      meta: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil((count || 0) / Number(limit)),
      },
    });
  } catch (err) {
    logger.error('List employees error:', err);
    return res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// ── PATCH /api/employees/:id/salary-status — Update salary payment status (paid/done or pending)
router.patch('/:id/salary-status', authorize('super_admin', 'hr', 'finance'), async (req, res) => {
  try {
    const { status, amount } = req.body;
    if (!['paid', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Status must be paid or pending' });
    }

    // Check if employee has a payslip
    const { data: slips } = await supabaseAdmin
      .from('payslips')
      .select('*')
      .eq('employee_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (slips && slips.length > 0) {
      const { data: updated, error } = await supabaseAdmin
        .from('payslips')
        .update({ payment_status: status })
        .eq('id', slips[0].id)
        .select()
        .single();
      if (error) throw error;
      return res.json({ data: updated, message: `Salary marked as ${status === 'paid' ? 'Done' : 'Pending'}` });
    } else {
      let { data: struct } = await supabaseAdmin
        .from('salary_structures')
        .select('*')
        .eq('employee_id', req.params.id)
        .eq('is_current', true)
        .single();

      const salAmount = amount || (struct ? Number(struct.gross_salary || struct.basic_salary) : 50000);
      if (!struct) {
        const { data: newStruct } = await supabaseAdmin.from('salary_structures').insert({
          employee_id: req.params.id,
          basic_salary: salAmount,
          gross_salary: salAmount,
          effective_date: new Date().toISOString().split('T')[0],
          is_current: true,
        }).select().single();
        struct = newStruct;
      }

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      let { data: run } = await supabaseAdmin
        .from('payroll_runs')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .single();

      if (!run) {
        const { data: newRun } = await supabaseAdmin.from('payroll_runs').insert({
          month,
          year,
          status: 'draft',
          total_employees: 1,
          total_gross: salAmount,
          total_deductions: 0,
          total_net: salAmount,
          run_by: req.user.id,
        }).select().single();
        run = newRun;
      }

      const { data: newSlip, error: slipErr } = await supabaseAdmin.from('payslips').insert({
        payroll_run_id: run.id,
        employee_id: req.params.id,
        gross_salary: salAmount,
        basic_salary: salAmount,
        total_allowances: 0,
        total_deductions: 0,
        net_salary: salAmount,
        working_days: 25,
        present_days: 25,
        leave_days: 0,
        payment_status: status,
      }).select().single();

      if (slipErr) throw slipErr;
      return res.json({ data: newSlip, message: `Salary marked as ${status === 'paid' ? 'Done' : 'Pending'}` });
    }
  } catch (err) {
    logger.error('Update salary status error:', err);
    return res.status(500).json({ error: 'Failed to update salary status' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select(`
        *,
        departments!employees_department_id_fkey (id, name),
        designations (id, title),
        users!employees_user_id_fkey (id, email, last_login),
        manager:employees (id, first_name, last_name, employee_code),
        employee_contacts (*),
        employment_history (*, departments(name), designations(title))
      `)
      .eq('id', req.params.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Employee not found' });

    const isSelf = data.user_id === req.user.id;
    const privileged = ['super_admin', 'hr', 'manager', 'finance'].includes(req.user.roleName);
    if (!isSelf && !privileged) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const payload = stripSensitive(data, canViewSensitive(req.user, data));
    return res.json({ data: payload });
  } catch (err) {
    logger.error('Get employee error:', err);
    return res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

router.post('/', authorize('super_admin', 'hr'), validate(createSchema), async (req, res) => {
  try {
    const { emergency_contacts, salary, documents, manager_id, ...fields } = req.body;
    const code = await generateEmployeeCode();
    const tempPassword = `${req.body.first_name.toLowerCase()}@${code}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { data: empRole } = await supabaseAdmin
      .from('roles')
      .select('id')
      .eq('name', 'employee')
      .single();

    const { data: newUser, error: userErr } = await supabaseAdmin
      .from('users')
      .insert({
        email: req.body.email.toLowerCase(),
        password_hash: passwordHash,
        role_id: empRole.id,
        is_active: true,
      })
      .select()
      .single();

    if (userErr) {
      if (userErr.code === '23505') return res.status(409).json({ error: 'Email already exists' });
      throw userErr;
    }

    await supabaseAdmin.from('user_profiles').insert({
      user_id: newUser.id,
      full_name: `${req.body.first_name} ${req.body.last_name}`,
      phone: req.body.phone || null,
    });

    const { data: employee, error: empErr } = await supabaseAdmin
      .from('employees')
      .insert({
        ...fields,
        manager_id: manager_id || null,
        employee_code: code,
        user_id: newUser.id,
        email: req.body.email.toLowerCase(),
        created_by: req.user.id,
      })
      .select()
      .single();

    if (empErr) {
      await supabaseAdmin.from('users').delete().eq('id', newUser.id);
      throw empErr;
    }

    await supabaseAdmin.from('employment_history').insert({
      employee_id: employee.id,
      department_id: req.body.department_id,
      designation_id: req.body.designation_id,
      from_date: req.body.joining_date,
      change_reason: 'Initial employment',
      changed_by: req.user.id,
    });

    if (emergency_contacts?.length) {
      await supabaseAdmin.from('employee_contacts').insert(
        emergency_contacts.map((c) => ({
          ...c,
          email: c.email || null,
          employee_id: employee.id,
        }))
      );
    }

    if (documents?.length) {
      await supabaseAdmin.from('employee_documents').insert(
        documents.map((d) => ({ ...d, employee_id: employee.id, uploaded_by: req.user.id }))
      );
    }

    if (salary) {
      await saveSalaryStructure(employee.id, salary, req.user.id);
    }

    const year = new Date().getFullYear();
    const { data: leaveTypes } = await supabaseAdmin.from('leave_types').select().eq('is_active', true);
    if (leaveTypes?.length) {
      await supabaseAdmin.from('leave_balances').insert(
        leaveTypes.map((lt) => ({
          employee_id: employee.id,
          leave_type_id: lt.id,
          year,
          total_days: lt.max_days_per_year,
          used_days: 0,
        }))
      );
    }

    await writeAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      tableName: 'employees',
      recordId: employee.id,
      newData: stripSensitive(employee, true),
      ipAddress: req.ip,
    });

    return res.status(201).json({
      data: employee,
      message: `Employee created. Temporary password: ${tempPassword}`,
    });
  } catch (err) {
    logger.error('Create employee error:', err);
    return res.status(500).json({ error: 'Failed to create employee' });
  }
});

router.put('/:id', authorize('super_admin', 'hr'), validate(updateSchema), async (req, res) => {
  try {
    const { emergency_contacts, manager_id, change_reason, ...fields } = req.body;
    const { data: old } = await supabaseAdmin.from('employees').select().eq('id', req.params.id).single();
    if (!old) return res.status(404).json({ error: 'Employee not found' });

    const { data, error } = await supabaseAdmin
      .from('employees')
      .update({
        ...fields,
        manager_id: manager_id === '' ? null : (manager_id ?? old.manager_id),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (
      (req.body.department_id && req.body.department_id !== old.department_id) ||
      (req.body.designation_id && req.body.designation_id !== old.designation_id)
    ) {
      await supabaseAdmin.from('employment_history').update({ to_date: new Date().toISOString().split('T')[0] })
        .eq('employee_id', req.params.id).is('to_date', null);
      await supabaseAdmin.from('employment_history').insert({
        employee_id: req.params.id,
        department_id: req.body.department_id || old.department_id,
        designation_id: req.body.designation_id || old.designation_id,
        from_date: new Date().toISOString().split('T')[0],
        change_reason: change_reason || 'Profile update',
        changed_by: req.user.id,
      });
    }

    if (emergency_contacts) {
      await supabaseAdmin.from('employee_contacts').delete().eq('employee_id', req.params.id);
      if (emergency_contacts.length) {
        await supabaseAdmin.from('employee_contacts').insert(
          emergency_contacts.map((c) => ({
            ...c,
            email: c.email || null,
            employee_id: req.params.id,
          }))
        );
      }
    }

    await writeAuditLog({
      userId: req.user.id, action: 'UPDATE', tableName: 'employees',
      recordId: req.params.id, oldData: stripSensitive(old, true), newData: data, ipAddress: req.ip,
    });

    return res.json({ data });
  } catch (err) {
    logger.error('Update employee error:', err);
    return res.status(500).json({ error: 'Failed to update employee' });
  }
});

router.patch('/:id/status', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'inactive', 'resigned', 'terminated'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { data, error } = await supabaseAdmin
      .from('employees')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    if (data.user_id) {
      await supabaseAdmin.from('users').update({ is_active: status === 'active' }).eq('id', data.user_id);
    }

    await writeAuditLog({
      userId: req.user.id, action: 'UPDATE', tableName: 'employees',
      recordId: req.params.id, newData: { status }, ipAddress: req.ip,
    });

    return res.json({ data, message: `Employee status updated to ${status}` });
  } catch (err) {
    logger.error('Update employee status error:', err);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

router.get('/:id/documents', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('employee_documents')
      .select('*, users(user_profiles(full_name))')
      .eq('employee_id', req.params.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return res.json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.post('/:id/documents', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { document_type, file_name, file_url } = req.body;
    if (!document_type || !file_name || !file_url) {
      return res.status(400).json({ error: 'document_type, file_name and file_url are required' });
    }
    const { data, error } = await supabaseAdmin.from('employee_documents').insert({
      employee_id: req.params.id,
      document_type,
      file_name,
      file_url,
      uploaded_by: req.user.id,
    }).select().single();

    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save document' });
  }
});

router.post('/:id/contacts', authorize('super_admin', 'hr'), async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('employee_contacts').insert({
      employee_id: req.params.id,
      contact_type: req.body.contact_type || 'emergency',
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email || null,
      relation: req.body.relation,
    }).select().single();
    if (error) throw error;
    return res.status(201).json({ data });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save contact' });
  }
});

module.exports = router;
