const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const logger = require('../config/logger');

/**
 * Authenticate request via JWT Bearer token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user data from DB to ensure account is still active
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, email, is_active, role_id,
        roles (id, name, permissions),
        user_profiles (full_name, avatar_url, phone)
      `)
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      roleId: user.role_id,
      roleName: user.roles?.name,
      permissions: user.roles?.permissions || {},
      profile: user.user_profiles,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    logger.error('Auth middleware error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Role-based authorization middleware factory
 * @param  {...string} roles - allowed role names
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!roles.includes(req.user.roleName)) {
      return res.status(403).json({
        error: `Access denied. Required roles: ${roles.join(', ')}`,
      });
    }
    next();
  };
};

/**
 * Permission-based authorization middleware factory
 * @param {string} permission - permission key to check
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const perms = req.user.permissions || {};
    if (!perms[permission]) {
      return res.status(403).json({
        error: `Permission denied: ${permission}`,
      });
    }
    next();
  };
};

module.exports = { authenticate, authorize, requirePermission };
