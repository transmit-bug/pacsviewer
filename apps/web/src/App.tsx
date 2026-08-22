import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { GuidedTour } from '@/components/tour/GuidedTour';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import PrototypeComparisonPage from '@/pages/PrototypeComparisonPage';
import PrototypeTrendChartPage from '@/pages/PrototypeTrendChartPage';
import ViewerWorkspacePrototype from '@/prototypes/viewer/ViewerWorkspacePrototype';
import { DashboardPage } from '@/pages/DashboardPage';
import { PatientListPage } from '@/pages/PatientListPage';
import { PatientDetailPage } from '@/pages/PatientDetailPage';
import { PatientFormPage } from '@/pages/PatientFormPage';
import { ViewerPage } from '@/pages/ViewerPage';
import { OctViewerPage } from '@/pages/OctViewerPage';
import { ReportPage } from '@/pages/ReportPage';
import { ReportListPage } from '@/pages/ReportListPage';
import { ReportCreatePage } from '@/pages/ReportCreatePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { DevicesPage } from '@/pages/DevicesPage';
import { ComparisonPage } from '@/pages/ComparisonPage';
import { StudyCreatePage } from '@/pages/StudyCreatePage';
import { StudyListPage } from '@/pages/StudyListPage';
import { UserManagementPage } from '@/pages/UserManagementPage';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

/** 路由级过渡已移除 (#134 引入的黑屏闪烁问题, 2026-08-15):
 * 旧实现用 AnimatePresence mode="wait" 让页面淡出到透明度 0 再淡入,
 * 深色主题下每次跳转都会露出近黑背景 ~400ms (黑屏闪烁)。
 * 恢复为瞬时跳转; 如需动画可后续基于 "不经过全透明" 的方式重做。 */
function AppRoutes() {
  return (
    <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/prototype/viewer" element={<ViewerWorkspacePrototype />} />
        <Route path="/prototype/comparison" element={<PrototypeComparisonPage />} />
        <Route path="/prototype/trend-chart" element={<PrototypeTrendChartPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="patients" element={<PatientListPage />} />
          <Route path="patients/new" element={<PatientFormPage />} />
          <Route path="patients/:id" element={<PatientDetailPage />} />
          <Route path="patients/:id/edit" element={<PatientFormPage />} />
          <Route path="patients/:patientId/new-study" element={<StudyCreatePage />} />
          <Route path="viewer/:studyId" element={<ViewerPage />} />
          <Route path="viewer/:studyId/oct/:imageId" element={<OctViewerPage />} />
          <Route path="reports" element={<ReportListPage />} />
          <Route path="reports/new" element={<ReportCreatePage />} />
          <Route path="reports/:studyId" element={<ReportPage />} />
          <Route path="studies" element={<StudyListPage />} />
          <Route path="compare" element={<ComparisonPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/users" element={<UserManagementPage />} />
          <Route path="devices" element={<DevicesPage />} />
        </Route>
      </Routes>
  );
}

export default function App() {
  return (
    <>
      {/* 路由级 Suspense fallback: 页面为 eager 加载时不会触发, 为后续懒加载预留 */}
      <Suspense fallback={null}>
        <AppRoutes />
      </Suspense>
      {/* 演示走查浮层 — 全局挂载, 跨路由保持 */}
      <GuidedTour />
    </>
  );
}
