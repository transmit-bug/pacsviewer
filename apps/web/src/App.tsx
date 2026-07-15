import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PatientListPage } from '@/pages/PatientListPage';
import { PatientDetailPage } from '@/pages/PatientDetailPage';
import { ViewerPage } from '@/pages/ViewerPage';
import { ReportPage } from '@/pages/ReportPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientListPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route path="viewer/:studyId" element={<ViewerPage />} />
        <Route path="reports/:studyId" element={<ReportPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
