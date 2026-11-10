"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

type Activation = { token: string; username: string };

export function activationFromFragment(fragment: string): Activation | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  if (!params.has("activate")) return null;
  const token = params.get("activate") || "";
  const username = (params.get("account") || "").trim();
  if (!token || !username || username.length > 160) throw new Error("开通链接不完整或无效，请联系工坊管理员。");
  return { token, username };
}

export default function AdminLogin({ allowActivation = false }: { allowActivation?: boolean }) {
  const id = useId();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [activation, setActivation] = useState<Activation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!allowActivation) return;
    function readFragment() {
      if (!window.location.hash) return;
      const fragment = window.location.hash;
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      try {
        const details = activationFromFragment(fragment);
        if (details) {
          setActivation(details);
          setUsername(details.username);
          setPassword("");
          setConfirmation("");
          setError("");
        }
      } catch (problem) { setError(problem instanceof Error ? problem.message : "无法读取开通链接。"); }
    }
    // Read arriving activation links in the browser and immediately remove their fragments.
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, [allowActivation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const account = username.trim();
    if (!account || account.length > 160) { setError("请填写有效的管理员账号。"); return; }
    if (!password || password.length > (activation ? 20 : 128) || (activation && password.length < 10)) { setError(activation ? "密码需要 10–20 位。" : "请填写密码，最多 128 位。"); return; }
    if (activation && password !== confirmation) { setError("两次输入的密码不一致。"); return; }
    setPending(true); setError("");
    try {
      const response = await fetch(activation ? "/api/admin/activate" : "/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activation ? { username: activation.username, token: activation.token, password } : { username: account, password }),
      });
      const result = await response.json() as { ok?: unknown; error?: unknown };
      if (activation && response.status === 409) {
        setActivation(null); setPassword(""); setConfirmation(""); setPending(false);
        setError("账号已开通，请使用此前设置的密码登录。");
        return;
      }
      if (!response.ok || !result || result.ok !== true) throw new Error(typeof result?.error === "string" ? result.error : "暂时无法完成登录，请稍后重试。");
      setPassword(""); setConfirmation(""); setActivation(null);
      // Reload the protected page after the server has set the session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(new URLSearchParams(window.location.search).get("next") === "/admin/cup" ? "/admin/cup" : "/admin");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "连接暂时中断，请稍后重试。"); setPending(false); }
  }

  return <div className="admin-login-panel">
    <p className="eyebrow">WORKSHOP ADMINISTRATION</p>
    <h2>{activation ? "开通管理员账号" : "管理员登录"}</h2>
    <p className="admin-login-description">仅已授权账号可管理订单、商品与赛事。<br />所有管理员拥有相同的管理权限。</p>
    <p className="admin-password-note">使用已设置的管理员密码直接登录，无需注册参赛账号。管理员密码与参赛账号密码分别设置。</p>
    <form className="admin-login-form" onSubmit={submit} aria-label={activation ? "开通管理员账号" : "管理员登录"}>
      <label htmlFor={`${id}-username`}>管理员账号</label>
      <input id={`${id}-username`} name="username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={160} required disabled={pending} readOnly={!!activation} placeholder="输入管理员账号" />
      <label htmlFor={`${id}-password`}>{activation ? "设置密码" : "密码"}</label>
      <input id={`${id}-password`} name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={activation ? "new-password" : "current-password"} minLength={activation ? 10 : undefined} maxLength={activation ? 20 : 128} required disabled={pending} placeholder={activation ? "设置 10–20 位密码" : "输入密码"} />
      {activation && <><label htmlFor={`${id}-confirmation`}>再次输入密码</label><input id={`${id}-confirmation`} name="confirmation" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" minLength={10} maxLength={20} required disabled={pending} placeholder="再次输入刚设置的密码" /><p className="admin-password-note">密码由你自行设置，需要 10–20 位。</p></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" type="submit" disabled={pending}>{pending ? "正在确认…" : activation ? "设置密码并进入后台" : "登录管理后台"}</button>
    </form>
    {activation && <p className="admin-password-note"><a href="/admin/login">已有账号？使用已设置的密码登录</a></p>}
  </div>;
}



