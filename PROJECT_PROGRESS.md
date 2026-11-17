# CompanyOS - Project Progress Tracker
Last updated: 2026-10-27

## Architecture
- Frontend: React 18 + Vite + Tailwind CSS 3 (c:\Niha\company\frontend)
- Backend: Node.js + Express 5 (c:\Niha\company\backend)
- Database: PostgreSQL via Supabase
- Auth: JWT tokens (access + refresh)
- Package manager: npm

## Module Status
| Module | Backend | Frontend | DB | Status |
|--------|---------|----------|----|--------|
| Auth/Login | Done | LoginPage.jsx | users,roles | Needs real Supabase keys |
| Dashboard | /reports/dashboard | DashboardPage.jsx | All | Needs real DB |
| Employees | Full CRUD | EmployeesPage+Profile | employees | Needs real DB |
| Departments | LIST only | NO page | departments | MISSING management UI |
| Designations | LIST only | NO page | designations | MISSING management UI |
| Attendance | Full routes | AttendancePage.jsx | attendance | Needs real DB |
| Leave | Full routes | LeavePage.jsx | leave_requests | Needs real DB |
| Payroll | Full+PDF | PayrollPage+MyPayslips | payroll_runs | Needs 002 migration |
| Exits | Full+ExperienceLetter | ExitsPage.jsx | resignations | Needs 002 migration |
| Students | Full CRUD | via ModulePage | students | ModulePage wrapper |
| Projects | Full CRUD | via ModulePage | projects,tasks | ModulePage wrapper |
| Announcements | CRUD | via ModulePage | announcements | Working |
| Assets | CRUD | via ModulePage | assets | Working |
| Expenses | CRUD | via ModulePage | expenses | Working |
| Reports | Full+Excel | via ModulePage | N/A | Working |
| Audit Logs | Full | via ModulePage | audit_logs | Working |
| Notifications | Full | Layout header | notifications | Working |

## Critical Issues
1. Backend CRASHES - placeholder Supabase keys in backend/.env
2. Missing tables: salary_bonuses, experience_letters (run 002 migration)
3. Missing department/designation management UI and backend CRUD routes

## Run Commands
### Backend: cd c:\Niha\company\backend && npm run dev (port 5000)
### Frontend: cd c:\Niha\company\frontend && npm run dev (port 5173)
### DB: Run 001 then 002 SQL migrations in Supabase SQL editor
### Seed: npm run seed:admin (creates admin@company.com / Admin@123456)

## Current Phase: 2 - Building Missing Features
## Next: Add department/designation CRUD backend routes + frontend pages
