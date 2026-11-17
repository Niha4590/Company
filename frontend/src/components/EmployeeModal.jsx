import { useEffect, useState } from 'react';
import { employeeApi } from '../api';
import toast from 'react-hot-toast';

const empty = {
  first_name: '', last_name: '', email: '', phone: '', date_of_birth: '', gender: '',
  address: '', department_id: '', designation_id: '', manager_id: '',
  employment_type: 'full_time', joining_date: '', probation_end_date: '',
  bank_name: '', bank_account_no: '', bank_ifsc: '', pan_number: '', pf_number: '',
  emergency_name: '', emergency_phone: '', emergency_relation: '',
  basic_salary: '', hra: '', transport_allowance: '', medical_allowance: '', other_allowances: '',
  pf_deduction: '', document_type: 'id_proof', file_name: '', file_url: '',
};

export default function EmployeeModal({ employee, departments, onSave, onClose }) {
  const [form, setForm] = useState(empty);
  const [designations, setDesignations] = useState([]);
  const [managers, setManagers] = useState([]);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(employee?.id);

  useEffect(() => {
    employeeApi.designations().then(({ data }) => setDesignations(data.data || [])).catch(() => {});
    employeeApi.managers().then(({ data }) => setManagers(data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!employee?.id) {
      setForm(empty);
      return;
    }
    employeeApi.get(employee.id).then(({ data }) => {
      const e = data.data;
      const contact = (e.employee_contacts || []).find((c) => c.contact_type === 'emergency') || {};
      setForm({
        ...empty,
        first_name: e.first_name || '',
        last_name: e.last_name || '',
        email: e.email || '',
        phone: e.phone || '',
        date_of_birth: e.date_of_birth || '',
        gender: e.gender || '',
        address: e.address || '',
        department_id: e.department_id || '',
        designation_id: e.designation_id || '',
        manager_id: e.manager_id || '',
        employment_type: e.employment_type || 'full_time',
        joining_date: e.joining_date || '',
        probation_end_date: e.probation_end_date || '',
        bank_name: e.bank_name || '',
        bank_account_no: e.bank_account_no || '',
        bank_ifsc: e.bank_ifsc || '',
        pan_number: e.pan_number || '',
        pf_number: e.pf_number || '',
        emergency_name: contact.name || '',
        emergency_phone: contact.phone || '',
        emergency_relation: contact.relation || '',
      });
    }).catch(() => toast.error('Failed to load employee'));
  }, [employee]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || undefined,
        date_of_birth: form.date_of_birth || undefined,
        gender: form.gender || undefined,
        address: form.address || undefined,
        department_id: form.department_id || undefined,
        designation_id: form.designation_id || undefined,
        manager_id: form.manager_id || undefined,
        employment_type: form.employment_type,
        joining_date: form.joining_date,
        probation_end_date: form.probation_end_date || undefined,
        bank_name: form.bank_name || undefined,
        bank_account_no: form.bank_account_no || undefined,
        bank_ifsc: form.bank_ifsc || undefined,
        pan_number: form.pan_number || undefined,
        pf_number: form.pf_number || undefined,
        emergency_contacts: form.emergency_name ? [{
          contact_type: 'emergency',
          name: form.emergency_name,
          phone: form.emergency_phone,
          relation: form.emergency_relation,
        }] : undefined,
      };

      if (!isEdit) {
        if (form.basic_salary) {
          payload.salary = {
            effective_date: form.joining_date,
            basic_salary: Number(form.basic_salary),
            hra: Number(form.hra || 0),
            transport_allowance: Number(form.transport_allowance || 0),
            medical_allowance: Number(form.medical_allowance || 0),
            other_allowances: Number(form.other_allowances || 0),
            deductions: form.pf_deduction ? [{
              deduction_type: 'pf',
              label: 'Provident Fund',
              value: Number(form.pf_deduction),
              is_percentage: true,
            }] : [],
          };
        }
        if (form.file_url) {
          payload.documents = [{
            document_type: form.document_type,
            file_name: form.file_name || 'document',
            file_url: form.file_url,
          }];
        }
        const { data } = await employeeApi.create(payload);
        toast.success(data.message || 'Employee created');
      } else {
        await employeeApi.update(employee.id, payload);
        toast.success('Employee updated');
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit employee' : 'Register employee'}</h2>
          <button className="btn-ghost btn" onClick={onClose}>Close</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body space-y-6">
            <Section title="Personal details">
              <Field label="First name" required value={form.first_name} onChange={set('first_name')} />
              <Field label="Last name" required value={form.last_name} onChange={set('last_name')} />
              <Field label="Email" type="email" required value={form.email} onChange={set('email')} disabled={isEdit} />
              <Field label="Phone" value={form.phone} onChange={set('phone')} />
              <Field label="Date of birth" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
              <div>
                <label className="form-label">Gender</label>
                <select className="select-control" value={form.gender} onChange={set('gender')}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">Address</label>
                <textarea className="form-control" rows={2} value={form.address} onChange={set('address')} />
              </div>
            </Section>

            <Section title="Employment">
              <Field label="Employee ID" value={employee?.employee_code || 'Auto-generated'} disabled />
              <div>
                <label className="form-label">Department</label>
                <select className="select-control" value={form.department_id} onChange={set('department_id')}>
                  <option value="">Select</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Designation</label>
                <select className="select-control" value={form.designation_id} onChange={set('designation_id')}>
                  <option value="">Select</option>
                  {designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Reporting manager</label>
                <select className="select-control" value={form.manager_id} onChange={set('manager_id')}>
                  <option value="">None</option>
                  {managers.filter((m) => m.id !== employee?.id).map((m) => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({m.employee_code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Employment type</label>
                <select className="select-control" value={form.employment_type} onChange={set('employment_type')}>
                  <option value="full_time">Full time</option>
                  <option value="part_time">Part time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <Field label="Joining date" type="date" required value={form.joining_date} onChange={set('joining_date')} />
              <Field label="Probation end date" type="date" value={form.probation_end_date} onChange={set('probation_end_date')} />
            </Section>

            <Section title="Emergency contact">
              <Field label="Name" value={form.emergency_name} onChange={set('emergency_name')} />
              <Field label="Phone" value={form.emergency_phone} onChange={set('emergency_phone')} />
              <Field label="Relation" value={form.emergency_relation} onChange={set('emergency_relation')} />
            </Section>

            <Section title="Banking (authorized roles only)">
              <Field label="Bank name" value={form.bank_name} onChange={set('bank_name')} />
              <Field label="Account number" value={form.bank_account_no} onChange={set('bank_account_no')} />
              <Field label="IFSC" value={form.bank_ifsc} onChange={set('bank_ifsc')} />
              <Field label="PAN" value={form.pan_number} onChange={set('pan_number')} />
              <Field label="PF number" value={form.pf_number} onChange={set('pf_number')} />
            </Section>

            {!isEdit && (
              <>
                <Section title="Salary setup">
                  <Field label="Basic salary" type="number" value={form.basic_salary} onChange={set('basic_salary')} />
                  <Field label="HRA" type="number" value={form.hra} onChange={set('hra')} />
                  <Field label="Transport" type="number" value={form.transport_allowance} onChange={set('transport_allowance')} />
                  <Field label="Medical" type="number" value={form.medical_allowance} onChange={set('medical_allowance')} />
                  <Field label="Other allowances" type="number" value={form.other_allowances} onChange={set('other_allowances')} />
                  <Field label="PF % of basic" type="number" value={form.pf_deduction} onChange={set('pf_deduction')} />
                </Section>
                <Section title="Documents">
                  <div>
                    <label className="form-label">Type</label>
                    <select className="select-control" value={form.document_type} onChange={set('document_type')}>
                      <option value="id_proof">ID proof</option>
                      <option value="resume">Resume</option>
                      <option value="offer_letter">Offer letter</option>
                      <option value="certificate">Certificate</option>
                    </select>
                  </div>
                  <Field label="File name" value={form.file_name} onChange={set('file_name')} />
                  <div className="sm:col-span-2">
                    <Field label="File URL" value={form.file_url} onChange={set('file_url')} />
                  </div>
                </Section>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary btn" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary btn">
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Create employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, required, ...props }) {
  return (
    <div className={props.className || ''}>
      <label className="form-label">{label}{required ? ' *' : ''}</label>
      <input className="form-control" required={required} {...props} />
    </div>
  );
}
