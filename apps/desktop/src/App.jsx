import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Attendance from './pages/Attendance'
import Cameras from './pages/Cameras'
import ManageFaces from './pages/ManageFaces'
import Report from './pages/Report'
import AccountManagement from './pages/AccountManagement'
import Departments from './pages/Departments'
import SystemSettings from './pages/SystemSettings'
import Billing from './pages/Billing'
import NotFound from './pages/NotFound'
import { ROUTES } from './config/routes'

export default function App() {
  useEffect(() => {
    document.title = 'CovaVision'
  }, [])

  return (
    <ThemeProvider>
      <ToastProvider>
        <HashRouter>
          <Routes>
            <Route path={ROUTES.login} element={<Login />} />
            <Route element={<Layout />}>
              <Route index element={<Navigate to={ROUTES.dashboard} replace />} />
              <Route path={ROUTES.dashboard} element={<Dashboard />} />
              <Route path={ROUTES.attendance} element={<Attendance />} />
              <Route path={ROUTES.cameras} element={<Cameras />} />
              <Route path={ROUTES.employees} element={<ManageFaces />} />
              <Route path={ROUTES.reports} element={<Report />} />
              <Route path={ROUTES.accounts} element={<AccountManagement />} />
              <Route path={ROUTES.departments} element={<Departments />} />
              <Route path={ROUTES.settings} element={<SystemSettings />} />
              <Route path={ROUTES.billing} element={<Billing />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </ThemeProvider>
  )
}
