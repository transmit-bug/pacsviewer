import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PatientListPage } from '@/pages/PatientListPage';
import { PatientDetailPage } from '@/pages/PatientDetailPage';
import { PatientFormPage } from '@/pages/PatientFormPage';
import { ViewerPage } from '@/pages/ViewerPage';
import { ReportPage } from '@/pages/ReportPage';
import { ReportListPage } from '@/pages/ReportListPage';
import { ReportCreatePage } from '@/pages/ReportCreatePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { ComparisonPage } from '@/pages/ComparisonPage';
import { StudyCreatePage } from '@/pages/StudyCreatePage';
import { UserManagementPage } from '@/pages/UserManagementPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientListPage />} />
        <Route path="patients/new" element={<PatientFormPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route path="patients/:id/edit" element={<PatientFormPage />} />
        <Route path="patients/:patientId/new-study" element={<StudyCreatePage />} />
        <Route path="viewer/:studyId" element={<ViewerPage />} />
        <Route path="reports" element={<ReportListPage />} />
        <Route path="reports/new" element={<ReportCreatePage />} />
        <Route path="reports/:studyId" element={<ReportPage />} />
        <Route path="compare" element={<ComparisonPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/users" element={<UserManagementPage />} />
        <Route path="devices" element={<DevicesPage />} />
      </Route>
    </Routes>
  );
}
