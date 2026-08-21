import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTourStore } from '@/stores/tourStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandMark } from '@/components/brand/BrandMark';
import { hasDismissedTour } from '@/lib/demo';
import { Sparkles } from 'lucide-react';

/** 密码策略客户端预检: 与服务端 passwordPolicySchema 一致 (≥8 位且含字母+数字) */
const PASSWORD_POLICY_OK = (pw: string) => pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // 首登强制改密 (#139): 登录成功但账号仍持有初始密码时, 先在本页完成改密
  const [forceChange, setForceChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(username, password);
    const state = useAuthStore.getState();
    if (!state.isAuthenticated) return;
    if (state.mustChangePassword) {
      setForceChange(true);
      return;
    }
    navigate('/');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!PASSWORD_POLICY_OK(newPassword)) {
      useAuthStore.setState({ error: '新密码至少 8 位，且必须同时包含字母和数字' });
      return;
    }
    if (newPassword !== confirmPassword) {
      useAuthStore.setState({ error: '两次输入的新密码不一致' });
      return;
    }
    setChanging(true);
    const ok = await useAuthStore.getState().changePassword(password, newPassword);
    setChanging(false);
    if (ok) navigate('/');
  };

  /** 一键演示登录: 服务端 /api/auth/demo-login 用播种演示账号登录, 前端无凭据 */
  const handleDemoLogin = async () => {
    clearError();
    await useAuthStore.getState().demoLogin();
    if (useAuthStore.getState().isAuthenticated) {
      // 首次进入演示模式: 自动建议走查 (跳过会持久化, 不再打扰)
      if (!useTourStore.getState().active && !hasDismissedTour()) {
        useTourStore.getState().start('app');
      }
      navigate('/');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* 环境氛围: 近黑底 + 低照度 teal 辉光 (cinematic) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 left-1/4 h-[30rem] w-[30rem] rounded-full bg-brand-400/[0.08] blur-[110px]" />
        <div className="absolute -bottom-44 -right-24 h-[26rem] w-[26rem] rounded-full bg-brand-600/[0.08] blur-[120px]" />
        <div className="absolute top-1/2 right-1/4 h-64 w-64 rounded-full bg-cyan-400/[0.05] blur-[90px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* 品牌区: Logo + 明瞳 + 英文副标 */}
        <div className="mb-9 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center drop-shadow-[0_0_28px_hsl(var(--primary)/0.45)]">
            <BrandMark animate uniqueId="login-iris" />
          </div>
          <h1 className="mt-6 text-[2.5rem] font-bold leading-none tracking-tight text-foreground">
            {t('app.brand')}
          </h1>
          <p className="mt-2.5 text-[11px] font-medium uppercase tracking-[0.42em] text-muted-foreground">
            PACS Viewer
          </p>
          <div className="mx-auto mt-4 h-px w-14 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        </div>

        {/* 玻璃拟态登录卡 (仅动态表面用 glass) */}
        <Card className="glass-surface rounded-lg border-white/10">
          <CardHeader className="space-y-1 pb-4 pt-6 text-center">
            <CardTitle className="text-lg font-semibold text-foreground">
              {t('auth.login')}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              {t('app.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forceChange ? (
              /* 首登强制改密表单 (#139) */
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  检测到您仍在使用初始密码，为保障患者数据安全，请先设置新密码。
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">新密码</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="至少 8 位，包含字母和数字"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">确认新密码</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <div className="text-sm text-destructive">{error}</div>}
                <Button type="submit" className="w-full" disabled={changing}>
                  {changing ? '提交中…' : '修改密码并进入系统'}
                </Button>
              </form>
            ) : (
              <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('auth.username')}</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder={t('auth.username')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('auth.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t('auth.loggingIn') : t('auth.login')}
              </Button>
            </form>

            {/* 演示入口: 仅开发构建存在; 生产构建无此路径 (服务端路由同样移除, #139) */}
            {!import.meta.env.PROD && (
              <>
                <div className="my-3 flex items-center gap-3" aria-hidden>
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    {t('demo.or')}
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
                <Button
                  type="button"
                  data-tour="demo-login"
                  variant="outline"
                  className="group w-full border-brand-400/40 bg-brand-400/10 text-brand-300 shadow-[0_0_24px_rgba(45,212,191,0.12)] backdrop-blur-sm transition-colors hover:border-brand-400/60 hover:bg-brand-400/20 hover:text-brand-200"
                  onClick={handleDemoLogin}
                  disabled={isLoading}
                >
                  <Sparkles className="mr-2 h-4 w-4 text-brand-400 transition-transform group-hover:scale-110" />
                  {t('demo.login')}
                </Button>
                <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                  {t('demo.loginHint')}
                </p>
              </>
            )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
