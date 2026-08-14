/**
 * 演示走查步骤配置 — 主演示路径: 登录 → 仪表盘 → 患者 → 查看器 → 测量 → 随访对比 → 报告。
 *
 * target 为高亮目标的 CSS 选择器; path 为所在路由 (模板中的 :studyId/:patientId
 * 由 GuidedTour 通过演示数据解析, 见 resolveDemoData)。
 */

export interface TourStep {
  id: string;
  /** 该步所在路由 (支持 :studyId / :patientId 模板) */
  path: string;
  /** 高亮目标 CSS 选择器 */
  target: string;
  titleKey: string;
  textKey: string;
  /** 提示卡相对目标的方位 */
  placement: 'top' | 'bottom' | 'right';
  /** 登录引导步: 等待认证完成 (一键登录或手动登录) 后自动进入下一步 */
  waitForAuth?: boolean;
  /** 目标未出现时的兜底: 在指定输入框中填入 query 并回车搜索, 再等待目标 */
  autoSearch?: {
    selector: string;
    query: string;
  };
}

/** 演示主角患者姓名 (seed #111) — 走查用它定位演示数据 */
export const DEMO_PROTAGONIST_NAME = '周建国';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'login',
    path: '/login',
    target: '[data-tour="demo-login"]',
    titleKey: 'demo.tour.login.title',
    textKey: 'demo.tour.login.text',
    placement: 'bottom',
    waitForAuth: true,
  },
  {
    id: 'dashboard',
    path: '/',
    target: '[data-tour="demo-indicator"]',
    titleKey: 'demo.tour.dashboard.title',
    textKey: 'demo.tour.dashboard.text',
    placement: 'bottom',
  },
  {
    id: 'patients',
    path: '/patients',
    target: '[data-tour="demo-patient"]',
    titleKey: 'demo.tour.patients.title',
    textKey: 'demo.tour.patients.text',
    placement: 'top',
    autoSearch: {
      selector: '[data-tour-search="patient-search"]',
      query: DEMO_PROTAGONIST_NAME,
    },
  },
  {
    id: 'viewer',
    path: '/viewer/:studyId',
    target: '[data-tour="viewer-toolbar"]',
    titleKey: 'demo.tour.viewer.title',
    textKey: 'demo.tour.viewer.text',
    placement: 'bottom',
  },
  {
    id: 'measurement',
    path: '/viewer/:studyId',
    target: '[data-tour="measurement-tools"]',
    titleKey: 'demo.tour.measurement.title',
    textKey: 'demo.tour.measurement.text',
    placement: 'right',
  },
  {
    id: 'followup',
    path: '/patients/:patientId',
    target: '[data-tour="followup-compare"]',
    titleKey: 'demo.tour.followup.title',
    textKey: 'demo.tour.followup.text',
    placement: 'top',
  },
  {
    id: 'report',
    path: '/reports/:studyId',
    target: '[data-tour="report-body"]',
    titleKey: 'demo.tour.report.title',
    textKey: 'demo.tour.report.text',
    placement: 'top',
  },
];
