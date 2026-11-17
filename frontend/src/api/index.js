import api from './client';

export const authApi = {
  login: (creds) => api.post('/auth/login', creds),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: (token) => api.post('/auth/refresh', { refreshToken: token }),
  changePassword: (data) => api.put('/auth/change-password', data),
};

export const employeeApi = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  updateStatus: (id, status) => api.patch(`/employees/${id}/status`, { status }),
  updateSalaryStatus: (id, status, amount) => api.patch(`/employees/${id}/salary-status`, { status, amount }),
  getDocuments: (id) => api.get(`/employees/${id}/documents`),
  addDocument: (id, data) => api.post(`/employees/${id}/documents`, data),
  departments: () => api.get('/employees/departments/list'),
  designations: (params) => api.get('/employees/designations/list', { params }),
  managers: () => api.get('/employees/managers/list'),
  // Department management
  getDepartments: () => api.get('/employees/departments'),
  createDepartment: (data) => api.post('/employees/departments', data),
  updateDepartment: (id, data) => api.put(`/employees/departments/${id}`, data),
  deleteDepartment: (id) => api.delete(`/employees/departments/${id}`),
  // Designation management
  getDesignations: (params) => api.get('/employees/designations', { params }),
  createDesignation: (data) => api.post('/employees/designations', data),
  updateDesignation: (id, data) => api.put(`/employees/designations/${id}`, data),
  deleteDesignation: (id) => api.delete(`/employees/designations/${id}`),
};

export const attendanceApi = {
  checkin: () => api.post('/attendance/checkin'),
  checkout: () => api.post('/attendance/checkout'),
  today: () => api.get('/attendance/today'),
  list: (params) => api.get('/attendance', { params }),
  my: (params) => api.get('/attendance/my', { params }),
  requestCorrection: (data) => api.post('/attendance/correction', data),
  approveCorrection: (id, data) => api.post(`/attendance/correction/${id}/approve`, data),
  corrections: (params) => api.get('/attendance/corrections/list', { params }),
  monthlyReport: (params) => api.get('/attendance/report/monthly', { params }),
  adminMark: (data) => api.post('/attendance/admin/mark', data),
};

export const leaveApi = {
  types: () => api.get('/leave/types'),
  createType: (data) => api.post('/leave/types', data),
  balances: (params) => api.get('/leave/balances', { params }),
  initializeBalances: (data) => api.post('/leave/balances/initialize', data),
  apply: (data) => api.post('/leave/apply', data),
  requests: (params) => api.get('/leave/requests', { params }),
  review: (id, data) => api.post(`/leave/requests/${id}/review`, data),
  cancel: (id) => api.delete(`/leave/requests/${id}`),
};

export const payrollApi = {
  structures: (params) => api.get('/payroll/structures', { params }),
  myStructure: () => api.get('/payroll/structures/my'),
  createStructure: (data) => api.post('/payroll/structures', data),
  runs: (params) => api.get('/payroll/runs', { params }),
  createRun: (data) => api.post('/payroll/runs', data),
  updateRunStatus: (id, status) => api.patch(`/payroll/runs/${id}/status`, { status }),
  runPayslips: (runId) => api.get(`/payroll/runs/${runId}/payslips`),
  myPayslips: () => api.get('/payroll/payslips/my'),
  downloadPayslip: (id) => api.get(`/payroll/payslips/${id}/pdf`, { responseType: 'blob' }),
  recordPayment: (data) => api.post('/payroll/payments', data),
};

export const exitApi = {
  resignations: (params) => api.get('/exits/resignations', { params }),
  getResignation: (id) => api.get(`/exits/resignations/${id}`),
  submit: (data) => api.post('/exits/resignations', data),
  review: (id, data) => api.patch(`/exits/resignations/${id}/review`, data),
  saveInterview: (id, data) => api.post(`/exits/resignations/${id}/interview`, data),
  updateClearance: (id, data) => api.patch(`/exits/clearance/${id}`, data),
  createSettlement: (id, data) => api.post(`/exits/resignations/${id}/settlement`, data),
};

export const studentApi = {
  list: (params) => api.get('/students', { params }),
  get: (id) => api.get(`/students/${id}`),
  create: (data) => api.post('/students', data),
  courses: () => api.get('/students/courses/list'),
  createCourse: (data) => api.post('/students/courses', data),
  batches: (params) => api.get('/students/batches/list', { params }),
  createBatch: (data) => api.post('/students/batches', data),
  enroll: (data) => api.post('/students/enrollments', data),
  invoices: (id) => api.get(`/students/${id}/invoices`),
  createInvoice: (id, data) => api.post(`/students/${id}/invoices`, data),
  recordPayment: (invoiceId, data) => api.post(`/students/invoices/${invoiceId}/payment`, data),
  exams: (params) => api.get('/students/exams/list', { params }),
  createExam: (data) => api.post('/students/exams', data),
  saveResults: (examId, data) => api.post(`/students/exams/${examId}/results`, data),
  results: (id) => api.get(`/students/${id}/results`),
  placements: (id) => api.get(`/students/${id}/placements`),
  addPlacement: (id, data) => api.post(`/students/${id}/placements`, data),
};

export const operationApi = {
  announcements: () => api.get('/operations/announcements'),
  createAnnouncement: (data) => api.post('/operations/announcements', data),
  projects: (params) => api.get('/operations/projects', { params }),
  createProject: (data) => api.post('/operations/projects', data),
  updateProject: (id, data) => api.put(`/operations/projects/${id}`, data),
  tasks: (params) => api.get('/operations/tasks', { params }),
  createTask: (data) => api.post('/operations/tasks', data),
  updateTask: (id, data) => api.patch(`/operations/tasks/${id}`, data),
  expenses: (params) => api.get('/operations/expenses', { params }),
  submitExpense: (data) => api.post('/operations/expenses', data),
  reviewExpense: (id, data) => api.patch(`/operations/expenses/${id}/review`, data),
  assets: () => api.get('/operations/assets'),
  createAsset: (data) => api.post('/operations/assets', data),
  events: (params) => api.get('/operations/events', { params }),
  createEvent: (data) => api.post('/operations/events', data),
  notifications: () => api.get('/operations/notifications'),
  markRead: (id) => api.patch(`/operations/notifications/${id}/read`),
  markAllRead: () => api.patch('/operations/notifications/read-all'),
  auditLogs: (params) => api.get('/operations/audit-logs', { params }),
};

export const reportApi = {
  dashboard: () => api.get('/reports/dashboard'),
  attendanceSummary: (params) => api.get('/reports/attendance/summary', { params }),
  leaveSummary: (params) => api.get('/reports/leave/summary', { params }),
  payrollSummary: (params) => api.get('/reports/payroll/summary', { params }),
  exportEmployees: (params) => api.get('/reports/export/employees', { params, responseType: 'blob' }),
  exportAttendance: (params) => api.get('/reports/export/attendance', { params, responseType: 'blob' }),
  exportPayroll: (runId) => api.get(`/reports/export/payroll/${runId}`, { responseType: 'blob' }),
};
