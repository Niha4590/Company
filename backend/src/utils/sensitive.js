const BANKING_FIELDS = ['bank_name', 'bank_account_no', 'bank_ifsc', 'pan_number', 'pf_number'];
const FINANCE_ROLES = ['super_admin', 'hr', 'finance'];

function canViewSensitive(user, employee) {
  if (!user) return false;
  if (FINANCE_ROLES.includes(user.roleName)) return true;
  if (employee && employee.user_id && employee.user_id === user.id) return true;
  return false;
}

function stripSensitive(record, allowed) {
  if (!record || typeof record !== 'object') return record;
  if (allowed) return record;
  const copy = { ...record };
  for (const field of BANKING_FIELDS) {
    if (field in copy) copy[field] = null;
  }
  return copy;
}

module.exports = { BANKING_FIELDS, FINANCE_ROLES, canViewSensitive, stripSensitive };
