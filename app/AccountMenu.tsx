'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CupStatus, CupUser } from './cup/types';
import './account-menu.css';

export default function AccountMenu({ isAdmin }: { isAdmin: boolean }) {
  const router=useRouter();
  const [user, setUser] = useState<CupUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (busy) return;
    let active = true, inFlight = false;
    const controller = new AbortController();
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch('/api/cup?view=session', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
        const data = await response.json() as CupStatus & { error?: string };
        if (!response.ok) throw new Error(data.error || '账号状态暂不可用，请稍后重试。');
        if (active) { setUser(data.user); setError(''); }
      } catch { if (active) setError('账号状态暂不可用，请稍后重试。'); }
      finally { inFlight = false; }
    }
    const visible = () => { if (!document.hidden) { void refresh(); if (isAdmin) router.refresh(); } };
    void refresh();
    window.addEventListener('focus', visible);
    window.addEventListener('pageshow', visible);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; controller.abort(); window.removeEventListener('focus', visible); window.removeEventListener('pageshow', visible); document.removeEventListener('visibilitychange', visible); };
  }, [busy,isAdmin,router]);
  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/cup/auth', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'logout' }) });
      if (!response.ok) throw new Error();
      setUser(null);
    } catch { setError('退出未完成，请稍后重试。'); }
    finally { setBusy(false); router.refresh(); }
  }
  if (!user && !isAdmin) return <div className="account-menu"><a className="account-trigger" href="/cup/login" aria-label="登录或注册工坊账号"><span className="account-avatar" aria-hidden="true">◇</span><span className="account-name">登录 / 注册</span></a>{error && <span className="account-warning" role="status">{error}</span>}</div>;
  const name = user?.displayName || '管理员';
  return <details className="account-menu">
    <summary className="account-trigger" aria-label={'账号菜单，' + name}><span className="account-avatar" aria-hidden="true">{name.slice(0, 1)}</span><span className="account-name">{name}</span></summary>
    <div className="account-panel"><p className="eyebrow">工坊账号</p><strong>{name}</strong><p>{user ? user.disabled ? '账号已停用，可联系管理员或退出。' : '已登录 · 与星界杯共用同一账号' : '管理员已登录'}</p><a href={user ? "/cup#participate" : "/cup/login"}>{user ? '我的参赛中心' : '登录普通工坊账号'} <span>↗</span></a>{isAdmin && <a className="account-admin" href="/admin/cup">星界杯管理 <span>↗</span></a>}<button type="button" disabled={busy} onClick={() => void logout()}>{busy ? '正在退出…' : '退出登录'}</button>{error && <p className="account-error" role="alert">{error}</p>}</div>
  </details>;
}
