import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrandMark } from '@/components/brand/BrandMark';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(username, password);
    if (useAuthStore.getState().isAuthenticated) {
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
            明瞳
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
                {isLoading ? '登录中...' : t('auth.login')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
