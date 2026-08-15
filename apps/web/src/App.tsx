import { Suspense, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LoadingScreen } from '@/components/brand/LoadingScreen';
import { RouteTransition } from '@/components/transition/RouteTransition';
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

/**
 * 品牌加载页 boot overlay: 首帧展示产品标识, 最短 ~700ms 后淡出,
 * 让首屏数据请求在后台先行, 露出时多为就绪态。
 */
function BootLoader({ done }: { done: boolean }) {
  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          key="boot-loader"
          className="fixed inset-0 z-50"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <LoadingScreen />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** 路由级过渡: location-frozen 的 Routes (退出动画渲染旧路由内容) */
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <RouteTransition>
      <Routes location={location}>
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
    </RouteTransition>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooted(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {/* 路由级 Suspense fallback: 页面为 eager 加载时不会触发, 为后续懒加载预留 */}
      <Suspense fallback={<LoadingScreen />}>
        <AnimatedRoutes />
      </Suspense>
      {/* 演示走查浮层 — 全局挂载, 跨路由保持 */}
      <GuidedTour />
      <BootLoader done={booted} />
    </>
  );
}
