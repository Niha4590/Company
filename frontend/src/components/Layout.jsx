import { useState, useEffect } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { operationApi } from '../api';
import toast from 'react-hot-toast';

const allNavItems = [
  {
    section: 'Overview',
    items: [
      { to: '/', icon: '📊', label: 'Dashboard', roles: ['super_admin','hr','manager','finance','faculty'] },
    ],
  },
  {
    section: 'Workforce',
    items: [
      { to: '/employees', icon: '👥', label: 'Employees', roles: ['super_admin','hr','manager','finance'] },
      { to: '/attendance', icon: '🕒', label: 'Attendance', roles: ['super_admin','hr','manager','employee','faculty'] },
      { to: '/leave', icon: '🌴', label: 'Leave', roles: ['super_admin','hr','manager','employee','faculty'] },
    ],
  },
  {
    section: 'Finance',
    items: [
      { to: '/payroll', icon: '💰', label: 'Payroll', roles: ['super_admin','hr','finance'] },
      { to: '/payroll/my-payslips', icon: '🧾', label: 'My Payslips', roles: ['employee','faculty'] },
      { to: '/expenses', icon: '🧳', label: 'Expenses', roles: ['super_admin','hr','finance','manager','employee','faculty'] },
    ],
  },
  {
    section: 'People',
    items: [
      { to: '/exits', icon: '🚪', label: 'Exit Management', roles: ['super_admin','hr','manager'] },
    ],
  },
  {
    section: 'Students',
    items: [
      { to: '/students', icon: '🎓', label: 'Students', roles: ['super_admin','hr','faculty'] },
      { to: '/students/courses', icon: '📚', label: 'Courses & Batches', roles: ['super_admin','hr','faculty'] },
      { to: '/student/portal', icon: '🎓', label: 'My Learning & Fees', roles: ['student'] },
    ],
  },
  {
    section: 'Operations',
    items: [
      { to: '/projects', icon: '📁', label: 'Projects & Tasks', roles: ['super_admin','hr','manager','finance'] },
      { to: '/announcements', icon: '📢', label: 'Announcements', roles: ['super_admin','hr','manager','finance','employee','faculty','student'] },
      { to: '/assets', icon: '🖥️', label: 'Assets', roles: ['super_admin','hr','finance'] },
    ],
  },
  {
    section: 'Reports',
    items: [
      { to: '/reports', icon: '📈', label: 'Reports & Exports', roles: ['super_admin','hr','finance','manager'] },
      { to: '/audit-logs', icon: '🔍', label: 'Audit Logs', roles: ['super_admin'] },
    ],
  },
];

export default function Layout() {
  const { user, logout, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    operationApi.notifications()
      .then(({ data }) => {
        setNotifs(data.data || []);
        setNotifCount((data.data || []).filter(n => !n.is_read).length);
      })
      .catch(() => {});
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
    toast.success('Logged out successfully');
  };

  const handleMarkAllRead = async () => {
    await operationApi.markAllRead();
    setNotifCount(0);
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const filteredNav = allNavItems.map(section => ({
    ...section,
    items: section.items.filter(item => !item.roles || item.roles.includes(user?.role)),
  })).filter(s => s.items.length > 0);

  const initials = user?.profile?.full_name
    ? user.profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() || '?';

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <div className="text-white font-bold text-sm leading-tight">
                {import.meta.env.VITE_APP_NAME || 'CompanyOS'}
              </div>
              <div className="text-slate-400 text-xs truncate max-w-[140px]">
                {import.meta.env.VITE_APP_COMPANY || 'Management'}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 scrollbar-thin space-y-0.5">
          {filteredNav.map((section) => (
            <div key={section.section}>
              <div className="nav-section">{section.section}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User area */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors">
            <div className="avatar w-9 h-9 text-sm flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">
                {user?.profile?.full_name || user?.email}
              </div>
              <div className="text-slate-400 text-xs capitalize">
                {user?.role?.replace('_', ' ')}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-red-500/20 text-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarOpen ? 'ml-[260px]' : 'ml-0'}`}>
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-100 flex items-center px-6 flex-shrink-0 shadow-sm z-30">
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 mr-4 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex-1" />

          {/* Notifications */}
          <div className="relative mr-2">
            <button
              onClick={() => setShowNotifs(p => !p)}
              className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  {notifCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-sm">No notifications</div>
                  ) : notifs.slice(0, 10).map((n) => (
                    <div key={n.id} className={`p-4 border-b last:border-b-0 ${!n.is_read ? 'bg-blue-50' : ''}`}>
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(n.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User badge */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-100">
            <div className="avatar w-8 h-8 text-xs">
              {initials}
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-medium text-slate-800 leading-tight">
                {user?.profile?.full_name?.split(' ')[0] || 'User'}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
