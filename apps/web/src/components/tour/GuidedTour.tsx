import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand/BrandMark';
import { useAuthStore } from '@/stores/authStore';
import { useTourStore, TOUR_LOGIN_STEP } from '@/stores/tourStore';
import { TOUR_STEPS, DEMO_PROTAGONIST_NAME, type TourStep } from './tourSteps';
import { dismissTour } from '@/lib/demo';
import { cn } from '@/lib/utils';

/**
 * 演示走查 — 轻量引导浮层 (无新增依赖, 纯 CSS 过渡)。
 *
 * 结构: 四象限暗化罩 (目标区域挖空, 目标仍可点击) + 高亮环 + 玻璃提示卡。
 * 步骤在页面间移动时由走查驱动 navigate; 用户手动离开当前步骤路由则只清理高亮, 不强制拉回。
 */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// ── 演示数据解析: 定位主角患者与其最新 OCT 检查, 供 :patientId/:studyId 模板填充 ──

let demoDataPromise: Promise<{ patientId?: string; studyId?: string } | null> | null = null;

function resolveDemoData(): Promise<{ patientId?: string; studyId?: string } | null> {
  if (!demoDataPromise) {
    demoDataPromise = (async () => {
      try {
        // /api/* 需认证 — 用当前会话 token 请求, 定位主角患者与其最新 OCT
        const token = useAuthStore.getState().token;
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`/api/patients/search?q=${encodeURIComponent(DEMO_PROTAGONIST_NAME)}`, { headers });
        const payload = await res.json();
        const patient = payload?.data?.[0];
        if (!patient?.id) return null;

        const sres = await fetch(`/api/studies?patientId=${patient.id}&pageSize=50`, { headers });
        const sp = await sres.json();
        const items: any[] = sp?.data?.items ?? sp?.data ?? [];
        const latestOct = items
          .filter((s) => s.modality === 'OCT')
          .sort((a, b) => String(b.studyDate || '').localeCompare(String(a.studyDate || '')))[0];

        return { patientId: patient.id, studyId: latestOct?.id ?? items[0]?.id };
      } catch {
        return null;
      }
    })();
  }
  return demoDataPromise;
}

/** 填充步骤路由模板; 演示数据不可用时返回 null (该步退化为无高亮提示) */
async function resolveStepPath(step: TourStep): Promise<string | null> {
  if (!step.path.includes(':')) return step.path;
  const demo = await resolveDemoData();
  if (!demo?.studyId && step.path.includes(':studyId')) return null;
  if (!demo?.patientId && step.path.includes(':patientId')) return null;
  return step.path
    .replace(':studyId', demo?.studyId ?? '')
    .replace(':patientId', demo?.patientId ?? '');
}

/** 轮询等待目标元素出现 (路由过渡/数据加载后可能延迟渲染) */
function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const started = Date.now();
    const timer = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        window.clearInterval(timer);
        resolve(el);
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer);
        resolve(null);
      }
    }, 120);
  });
}

export function GuidedTour() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { active, stepIndex, close, jumpTo } = useTourStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const step = active ? TOUR_STEPS[stepIndex] : undefined;
  const [rect, setRect] = useState<Rect | null>(null);
  const [found, setFound] = useState(false);
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<Rect | null>(null);

  const total = TOUR_STEPS.length;
  const isLast = stepIndex >= total - 1;

  /** 测量目标元素矩形并滚动到可视区 */
  const measure = useCallback((el: Element) => {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      rectRef.current = { top: r.top, left: r.left, width: r.width, height: r.height };
      setRect({ ...rectRef.current });
      setFound(true);
    }, 450);
  }, []);

  /** 由走查驱动的步骤跳转: 切换步骤并 (必要时) 导航到目标路由 */
  const goToStep = useCallback(
    (index: number) => {
      const s = TOUR_STEPS[index];
      if (!s) return;
      jumpTo(index);
      void resolveStepPath(s).then((p) => {
        if (p && p !== location.pathname) navigate(p);
      });
    },
    [jumpTo, navigate, location.pathname],
  );

  // ── 步骤编排: 认证推进 / 目标定位 ──
  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      setFound(false);
      return;
    }
    let cancelled = false;

    // 登录引导步: 认证完成后自动进入下一步并导航到仪表盘
    if (step.waitForAuth && isAuthenticated) {
      if (stepIndex === TOUR_LOGIN_STEP) {
        const nextStep = TOUR_STEPS[stepIndex + 1];
        jumpTo(stepIndex + 1);
        if (nextStep) {
          void resolveStepPath(nextStep).then((p) => {
            if (!cancelled && p && p !== location.pathname) navigate(p);
          });
        }
      }
      return;
    }

    void (async () => {
      // 当前路由与该步不符时不强行拉回 (由 goToStep 驱动导航), 只等待目标出现
      let el = await waitForElement(step.target, 6000);

      // 目标不在当前页 (如主角患者被分页埋没) → 自动在搜索框填入并回车, 再等待
      if (!el && step.autoSearch) {
        const input = document.querySelector(step.autoSearch.selector) as HTMLInputElement | null;
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )?.set;
          setter?.call(input, step.autoSearch.query);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          el = await waitForElement(step.target, 4000);
        }
      }

      if (cancelled) return;
      if (el) {
        measure(el);
      } else {
        setRect(null);
        setFound(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, step, stepIndex, isAuthenticated, jumpTo, navigate, location.pathname, measure]);

  // ── 用户手动离开当前步骤路由 → 清理高亮 (不强制拉回) ──
  useEffect(() => {
    if (!active || !step || step.waitForAuth) return;
    let cancelled = false;
    void resolveStepPath(step).then((p) => {
      if (cancelled) return;
      if (p && location.pathname !== p) {
        setRect(null);
        setFound(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, step, location.pathname]);

  // ── 目标定位后: 测量提示卡尺寸并计算位置 (useLayoutEffect 在绘制前完成, 无闪烁) ──
  useLayoutEffect(() => {
    if (!rect || !cardRef.current) {
      setCardPos(null);
      return;
    }
    const el = cardRef.current;
    const cw = el.offsetWidth;
    const ch = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;
    const placement = step?.placement ?? 'bottom';

    let left: number;
    let top: number;
    if (placement === 'right') {
      left = Math.min(rect.left + rect.width + pad, vw - cw - pad);
      top = Math.min(Math.max(rect.top + rect.height / 2 - ch / 2, pad), vh - ch - pad);
    } else if (placement === 'bottom') {
      left = Math.min(Math.max(rect.left + rect.width / 2 - cw / 2, pad), vw - cw - pad);
      top = rect.top + rect.height + pad;
      if (top + ch > vh - pad) top = Math.max(pad, rect.top - ch - pad);
    } else {
      left = Math.min(Math.max(rect.left + rect.width / 2 - cw / 2, pad), vw - cw - pad);
      top = rect.top - ch - pad;
      if (top < pad) top = Math.min(rect.top + rect.height + pad, vh - ch - pad);
    }
    setCardPos({
      top: Math.max(pad, Math.min(top, vh - ch - pad)),
      left: Math.max(pad, Math.min(left, vw - cw - pad)),
    });
  }, [rect, step?.placement]);

  // ── 窗口 resize / 滚动时重定位高亮 ──
  useEffect(() => {
    if (!active) return;
    const reposition = () => {
      if (!rectRef.current || !step) return;
      const el = document.querySelector(step.target);
      if (el) {
        const r = el.getBoundingClientRect();
        rectRef.current = { top: r.top, left: r.left, width: r.width, height: r.height };
        setRect({ ...rectRef.current });
      }
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [active, step]);

  // ── Escape 关闭 ──
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissTour();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close]);

  if (!active || !step) return null;

  const handleSkip = () => {
    dismissTour();
    close();
  };
  const handleFinish = () => {
    dismissTour();
    close();
  };
  const handleNext = () => {
    // 登录引导步: 「下一步」= 一键进入演示模式, 认证完成后自动前进
    if (step.waitForAuth && !isAuthenticated) {
      void useAuthStore.getState().demoLogin();
      return;
    }
    goToStep(stepIndex + 1);
  };

  const showHole = found && !!rect;

  return (
    <div role="dialog" aria-label={t('demo.tour.ariaLabel')}>
      {/* 暗化罩 — 目标区域挖空 (四象限, 目标仍可交互) */}
      {showHole && rect ? (
        <div className="fixed inset-0 z-[70]" aria-hidden>
          <div className="absolute bg-black/55" style={{ top: 0, left: 0, right: 0, height: rect.top }} />
          <div
            className="absolute bg-black/55"
            style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
          />
          <div
            className="absolute bg-black/55"
            style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
          />
          <div
            className="absolute bg-black/55"
            style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
          />
        </div>
      ) : (
        <div className="fixed inset-0 z-[70] bg-black/45" aria-hidden />
      )}

      {/* 高亮环 */}
      {showHole && rect && (
        <div
          className="pointer-events-none fixed z-[71] rounded-md border-2 border-brand-400/90 shadow-[0_0_0_4px_rgba(45,212,191,0.16),0_0_28px_rgba(45,212,191,0.28)] transition-all duration-300"
          style={{
            top: rect.top - 2,
            left: rect.left - 2,
            width: rect.width + 4,
            height: rect.height + 4,
          }}
        />
      )}

      {/* 提示卡 */}
      <div
        ref={cardRef}
        className={cn(
          'glass-surface fixed z-[72] w-[min(20rem,calc(100vw-1.5rem))] rounded-lg border border-white/10 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] transition-all duration-300',
          !showHole && 'bottom-6 left-1/2 -translate-x-1/2'
        )}
        style={showHole && cardPos ? { top: cardPos.top, left: cardPos.left } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrandMark className="h-5 w-5" uniqueId="tour-iris" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-300">
              {t('demo.tour.label')}
            </span>
          </div>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {stepIndex + 1} / {total}
          </span>
        </div>
        <h3 className="mt-2.5 text-sm font-semibold text-foreground">{t(step.titleKey)}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(step.textKey)}</p>
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
            {t('demo.tour.skip')}
          </Button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="outline" size="sm" onClick={() => goToStep(stepIndex - 1)}>
                {t('demo.tour.prev')}
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={handleFinish}>
                {t('demo.tour.done')}
              </Button>
            ) : (
              <Button size="sm" onClick={handleNext}>
                {step.waitForAuth && !isAuthenticated ? t('demo.tour.enterDemo') : t('demo.tour.next')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
