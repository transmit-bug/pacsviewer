import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * 品牌 Logo — 瞳孔/光圈意象 (pure SVG, no image assets)。
 * 意象: 外圈光圈刻度(镜头) + 六瓣光圈叶片 + 虹膜渐变 + 瞳孔 + 高光。
 * 配色取品牌 teal (#2DD4BF → #14B8A6 系)。
 */
function BrandMark() {
  // 六瓣光圈叶片 (梯形, 60° 旋转排布, 形成镜头虹膜)
  const blades = Array.from({ length: 6 }).map((_, i) => {
    const rad = (i * 60) * (Math.PI / 180);
    const a = rad - Math.PI / 6;
    const b = rad + Math.PI / 6;
    const pt = (r: number, ang: number) =>
      `${(48 + r * Math.sin(ang)).toFixed(1)},${(48 - r * Math.cos(ang)).toFixed(1)}`;
    return `${pt(13, a)} ${pt(13, b)} ${pt(31, b)} ${pt(31, a)}`;
  });

  return (
    <svg viewBox="0 0 96 96" className="h-24 w-24" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="login-iris" cx="40%" cy="38%" r="65%">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#2dd4bf" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 外圈光圈刻度 (缓慢旋转, 镜头环意象) */}
      <g className="[transform-origin:48px_48px] animate-[spin_60s_linear_infinite]">
        {Array.from({ length: 24 }).map((_, i) => (
          <line
            key={i}
            x1="48"
            y1="6"
            x2="48"
            y2={i % 3 === 0 ? 12 : 10}
            stroke="#2dd4bf"
            strokeOpacity={i % 6 === 0 ? 0.7 : 0.28}
            strokeWidth={i % 6 === 0 ? 1.6 : 1}
            transform={`rotate(${i * 15} 48 48)`}
          />
        ))}
      </g>

      {/* 虹膜 */}
      <circle cx="48" cy="48" r="33" fill="url(#login-iris)" />
      <circle cx="48" cy="48" r="38" stroke="#2dd4bf" strokeOpacity="0.5" strokeWidth="1.2" />
      <circle cx="48" cy="48" r="30" stroke="#2dd4bf" strokeOpacity="0.22" strokeWidth="1" />

      {/* 光圈叶片 (镜头虹膜) */}
      {blades.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="#14b8a6"
          fillOpacity="0.22"
          stroke="#2dd4bf"
          strokeOpacity="0.45"
          strokeWidth="0.8"
        />
      ))}

      {/* 瞳孔 + 高光 */}
      <circle cx="48" cy="48" r="9" fill="#0b0e13" stroke="#5eead4" strokeWidth="1.4" />
      <circle cx="44.5" cy="44.5" r="2.8" fill="#ffffff" fillOpacity="0.85" />
      <circle cx="41" cy="48" r="1.3" fill="#ffffff" fillOpacity="0.4" />
    </svg>
  );
}

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
            <BrandMark />
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
