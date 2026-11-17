const { z } = require('zod');

const contactSchema = z.object({
  contact_type: z.enum(['personal', 'emergency']).default('emergency'),
  name: z.string().min(1),
  phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal('')),
  relation: z.string().optional(),
});

const deductionSchema = z.object({
  deduction_type: z.string().min(1),
  label: z.string().min(1),
  value: z.number().nonnegative(),
  is_percentage: z.boolean().optional().default(false),
});

const salarySetupSchema = z.object({
  effective_date: z.string().min(1),
  basic_salary: z.number().nonnegative(),
  hra: z.number().nonnegative().optional().default(0),
  transport_allowance: z.number().nonnegative().optional().default(0),
  medical_allowance: z.number().nonnegative().optional().default(0),
  other_allowances: z.number().nonnegative().optional().default(0),
  deductions: z.array(deductionSchema).optional(),
});

const documentSchema = z.object({
  document_type: z.string().min(1),
  file_name: z.string().min(1),
  file_url: z.string().url(),
});

const createSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  address: z.string().optional(),
  department_id: z.string().uuid().optional(),
  designation_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional().or(z.literal('')),
  employment_type: z.enum(['full_time', 'part_time', 'contract', 'intern']).default('full_time'),
  joining_date: z.string().min(1),
  probation_end_date: z.string().optional(),
  confirmation_date: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_no: z.string().optional(),
  bank_ifsc: z.string().optional(),
  pan_number: z.string().optional(),
  pf_number: z.string().optional(),
  emergency_contacts: z.array(contactSchema).optional(),
  salary: salarySetupSchema.optional(),
  documents: z.array(documentSchema).optional(),
});

const updateSchema = createSchema.partial().omit({ salary: true, documents: true, emergency_contacts: true }).extend({
  change_reason: z.string().optional(),
  emergency_contacts: z.array(contactSchema).optional(),
});

module.exports = { createSchema, updateSchema, contactSchema, salarySetupSchema };
