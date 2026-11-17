const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { supabaseAdmin } = require('../../config/supabase');
const { validate } = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const logger = require('../../config/logger');

const router = express.Router();

// Schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
};

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, email, password_hash, is_active, role_id,
        roles (id, name, permissions),
        user_profiles (full_name, avatar_url, phone),
        employees!employees_user_id_fkey (id, employee_code, department_id, designation_id)
      `)
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated. Contact admin.' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id);

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Log login
    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      action: 'LOGIN',
      table_name: 'users',
      record_id: user.id,
      ip_address: req.ip,
    });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.roles?.name,
        permissions: user.roles?.permissions,
        profile: user.user_profiles,
        employee: Array.isArray(user.employees) ? user.employees[0] : user.employees,
      },
    });
  } catch (err) {
    logger.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid refresh token' });

    const { accessToken, refreshToken: newRefresh } = generateTokens(decoded.userId);
    return res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select(`
        id, email, is_active, last_login, role_id,
        roles (id, name, permissions),
        user_profiles (full_name, avatar_url, phone),
        employees!employees_user_id_fkey (id, employee_code, department_id, designation_id)
      `)
      .eq('id', req.user.id)
      .single();

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.roles?.name,
        permissions: user.roles?.permissions,
        profile: user.user_profiles,
        employee: Array.isArray(user.employees) ? user.employees[0] : user.employees,
      },
    });
  } catch (err) {
    logger.error('Me endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) return res.status(400).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 12);
    await supabaseAdmin
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', req.user.id);

    await supabaseAdmin.from('audit_logs').insert({
      user_id: req.user.id,
      action: 'CHANGE_PASSWORD',
      table_name: 'users',
      record_id: req.user.id,
      ip_address: req.ip,
    });

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout (audit only — client discards token)
router.post('/logout', authenticate, async (req, res) => {
  await supabaseAdmin.from('audit_logs').insert({
    user_id: req.user.id,
    action: 'LOGOUT',
    table_name: 'users',
    record_id: req.user.id,
    ip_address: req.ip,
  });
  return res.json({ message: 'Logged out successfully' });
});

module.exports = router;
