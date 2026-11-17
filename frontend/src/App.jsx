import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeProfilePage from './pages/EmployeeProfilePage';
import AttendancePage from './pages/AttendancePage';
import LeavePage from './pages/LeavePage';
import PayrollPage from './pages/PayrollPage';
import MyPayslipsPage from './pages/MyPayslipsPage';
import ExitsPage from './pages/ExitsPage';
import ModulePage from './pages/ModulePage';
import DepartmentsPage from './pages/DepartmentsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/employees/:id" element={<EmployeeProfilePage />} />
            <Route path="/me" element={<EmployeeProfilePage self />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/leave" element={<LeavePage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/payroll/my-payslips" element={<MyPayslipsPage />} />
            <Route path="/exits" element={<ExitsPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/expenses" element={<ModulePage title="Expenses" kind="expenses" />} />
            <Route path="/students" element={<ModulePage title="Students" kind="students" />} />
            <Route path="/students/courses" element={<ModulePage title="Courses & Batches" kind="courses" />} />
            <Route path="/projects" element={<ModulePage title="Projects & Tasks" kind="projects" />} />
            <Route path="/announcements" element={<ModulePage title="Announcements" kind="announcements" />} />
            <Route path="/assets" element={<ModulePage title="Assets" kind="assets" />} />
            <Route path="/reports" element={<ModulePage title="Reports & Exports" kind="reports" />} />
            <Route path="/audit-logs" element={<ModulePage title="Audit Logs" kind="audit" />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
