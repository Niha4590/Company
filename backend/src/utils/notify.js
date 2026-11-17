const { supabaseAdmin } = require('../config/supabase');
const logger = require('../config/logger');

async function notifyUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  const rows = ids.map((user_id) => ({ user_id, ...payload }));
  const { error } = await supabaseAdmin.from('notifications').insert(rows);
  if (error) logger.error('Notify users error:', error);
}

async function notifyRoles(roleNames, payload) {
  const { data: roles } = await supabaseAdmin.from('roles').select('id').in('name', roleNames);
  if (!roles?.length) return;
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id')
    .in('role_id', roles.map((r) => r.id))
    .eq('is_active', true);
  await notifyUsers((users || []).map((u) => u.id), payload);
}

module.exports = { notifyUsers, notifyRoles };
