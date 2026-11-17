const { supabaseAdmin } = require('../config/supabase');
const logger = require('../config/logger');

/**
 * Logs important create/update/delete operations to audit_logs table
 */
const auditLog = (action, tableName) => {
  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    res.json = async (body) => {
      // Only log successful write operations
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        try {
          await supabaseAdmin.from('audit_logs').insert({
            user_id: req.user.id,
            action,
            table_name: tableName,
            record_id: body?.data?.id || req.params?.id || null,
            new_data: body?.data || null,
            ip_address: req.ip,
          });
        } catch (err) {
          logger.error('Audit log error:', err);
          // Don't fail the request because of audit log failure
        }
      }
      return originalJson(body);
    };

    next();
  };
};

/**
 * Standalone audit log function for use in service layer
 */
const writeAuditLog = async ({ userId, action, tableName, recordId, oldData, newData, ipAddress }) => {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      user_id: userId,
      action,
      table_name: tableName,
      record_id: recordId,
      old_data: oldData,
      new_data: newData,
      ip_address: ipAddress,
    });
  } catch (err) {
    logger.error('Write audit log error:', err);
  }
};

module.exports = { auditLog, writeAuditLog };
