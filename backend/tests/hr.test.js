const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getWorkingDays, inclusiveDayCount, workingHours, addDays } = require('../src/utils/hrMath');
const { stripSensitive, canViewSensitive } = require('../src/utils/sensitive');
const { createSchema } = require('../src/modules/employees/employees.schema');

describe('hrMath', () => {
  it('counts weekday working days in Jan 2026', () => {
    assert.equal(getWorkingDays(2026, 1), 22);
  });

  it('counts inclusive leave days', () => {
    assert.equal(inclusiveDayCount('2026-01-05', '2026-01-07'), 3);
    assert.equal(inclusiveDayCount('2026-01-07', '2026-01-05'), 0);
  });

  it('computes working hours', () => {
    assert.equal(workingHours('2026-01-01T09:00:00.000Z', '2026-01-01T17:30:00.000Z'), 8.5);
  });

  it('adds notice period days', () => {
    assert.equal(addDays('2026-01-01', 30), '2026-01-31');
  });
});

describe('sensitive payroll fields', () => {
  const employee = { id: '1', user_id: 'u1', bank_account_no: '123', pan_number: 'ABCDE1234F' };

  it('hides banking from managers', () => {
    const hidden = stripSensitive(employee, canViewSensitive({ id: 'm1', roleName: 'manager' }, employee));
    assert.equal(hidden.bank_account_no, null);
    assert.equal(hidden.pan_number, null);
  });

  it('allows HR and the employee themselves', () => {
    const hr = stripSensitive(employee, canViewSensitive({ id: 'h1', roleName: 'hr' }, employee));
    assert.equal(hr.bank_account_no, '123');
    const self = stripSensitive(employee, canViewSensitive({ id: 'u1', roleName: 'employee' }, employee));
    assert.equal(self.pan_number, 'ABCDE1234F');
  });
});

describe('employee registration schema', () => {
  it('accepts a complete registration payload', () => {
    const result = createSchema.safeParse({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@company.com',
      joining_date: '2026-01-15',
      employment_type: 'full_time',
      emergency_contacts: [{ name: 'Lord Byron', phone: '9999999999', relation: 'parent', contact_type: 'emergency' }],
      salary: { effective_date: '2026-01-15', basic_salary: 50000, hra: 20000 },
    });
    assert.equal(result.success, true);
  });

  it('rejects invalid email', () => {
    const result = createSchema.safeParse({
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'not-an-email',
      joining_date: '2026-01-15',
    });
    assert.equal(result.success, false);
  });
});
