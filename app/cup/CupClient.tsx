"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import WorkshopLogo from "../WorkshopLogo";
import CupRules from "./CupRules";
import { divisionNames, phaseNames, phases, type CupEntry, type CupStatus, type Division, type EntryStatus } from "./types";

type AuthMode = "login" | "signup" | "verify" | "recover" | "reset";
type AuthReply = { step?: "verify" | "recovery"; message?: string };
type Feedback = { error: boolean; text: string };
const authTitles: Record<AuthMode, string> = { login: "登录参赛账号", signup: "创建参赛账号", verify: "验证你的邮箱", recover: "找回账号密码", reset: "设置新密码" };
const reviewNames: Record<EntryStatus, string> = { pending: "等待审核", approved: "已公开", rejected: "未通过", hidden: "已隐藏" };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const payload = await response.json().catch(() => { throw new Error("服务暂时没有返回有效内容，请稍后重试。"); });
  if (!response.ok || payload.error) throw new Error(payload.error || payload.message || "操作未完成，请稍后重试。");
  return payload as T;
}

async function prepareImages(files: File[]): Promise<File[]> {
  if (!files.length || files.length > 4) throw new Error("请选择 1–4 张作品照片。");
  const images: File[] = [];
  let total = 0;
  for (const [index, file] of files.entries()) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("作品照片请使用 JPG、PNG 或 WebP 格式。");
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error(`无法读取照片「${file.name}」，请换一张照片。`); });
    try {
      const ratio = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器暂时无法处理照片，请更换浏览器后重试。");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("照片处理失败，请换一张照片。")), "image/jpeg", 0.84));
      total += blob.size;
      if (total >= 5_900_000) throw new Error("照片压缩后的总大小仍接近 6 MB，请减少照片数量或先裁切照片。");
      images.push(new File([blob], `photo-${index + 1}.jpg`, { type: "image/jpeg" }));
    } finally { bitmap.close(); }
  }
  return images;
}

export default function CupClient({ isAdmin, authOnly = false }: { isAdmin: boolean; authOnly?: boolean }) {
  const router=useRouter();
  useEffect(()=>{
    const refreshIdentity=()=>{if(!document.hidden)router.refresh();};
    window.addEventListener('focus',refreshIdentity);window.addEventListener('pageshow',refreshIdentity);document.addEventListener('visibilitychange',refreshIdentity);
    return()=>{window.removeEventListener('focus',refreshIdentity);window.removeEventListener('pageshow',refreshIdentity);document.removeEventListener('visibilitychange',refreshIdentity);};
  },[router]);
  const [status, setStatus] = useState<CupStatus | null>(null);
  const [division, setDivision] = useState<Division>("beginner");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [photo, setPhoto] = useState<{ entry: CupEntry; index: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const user = status?.user;
  const fallbackAt = status?.fallbackAt;
  const canSubmit = !!user && !user.disabled && status?.event.phase === "submission";
  const authUnavailable = !status || status.authReady === false;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!authOnly && params.get("returnTo") === "registration") {
      window.location.replace(`/cup/login?${params.get("signup") === "1" ? "signup=1&" : ""}returnTo=registration`);
      return;
    }
    if (params.get("signup") === "1") setAuthMode("signup");
  }, [authOnly]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    request<CupStatus>(`/api/cup?division=${division}&page=${page}`).then(data => {
      if (active) setStatus(data);
    }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : "活动状态读取失败。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [division, page, refresh]);

  useEffect(() => {
    if (authOnly && status?.user) window.location.replace(new URLSearchParams(window.location.search).get("returnTo") === "registration" ? "/cup/register" : "/cup#participate");
  }, [authOnly, status?.user?.id]);

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendSeconds(remaining);
      if (!remaining) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (photo && !dialog.current?.open) dialog.current?.showModal();
    if (!photo) dialog.current?.close();
  }, [photo]);

  function showError(error: unknown) { setFeedback({ error: true, text: error instanceof Error ? error.message : "操作未完成，请重试。" }); }
  function startCooldown() { setResendAt(Date.now() + 60_000); setResendSeconds(60); }
  function changeAuthMode(mode: AuthMode) { if (mode === authMode) return; setAuthMode(mode); setPassword(""); setCode(""); setFeedback(null); }
  function reload() { setRefresh(value => value + 1); }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || authUnavailable) return;
    setBusy("auth"); setFeedback(null);
    let navigating = false;
    const normalizedEmail = email.trim().toLowerCase();
    setEmail(normalizedEmail);
    try {
      const reply = await request<AuthReply>("/api/cup/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: authMode, email: normalizedEmail, password, displayName: displayName.trim(), code: code.trim() }) });
      setPassword(""); setCode("");
      if (reply.step === "verify") { setAuthMode("verify"); startCooldown(); }
      else if (reply.step === "recovery") { setAuthMode("reset"); startCooldown(); }
      else setAuthMode("login");
      if (!reply.step && (authOnly || new URLSearchParams(window.location.search).get("returnTo") === "registration")) {
        navigating = true;
        window.location.assign(new URLSearchParams(window.location.search).get("returnTo") === "registration" ? "/cup/register" : "/cup#participate");
        return;
      }
      reload();
      setFeedback({ error: false, text: reply.message || (reply.step ? "请查收邮箱中的验证码，有效期为 5 分钟。" : "操作完成。") });
    } catch (error) { showError(error); }
    finally { setBusy(""); if (!navigating) router.refresh(); }
  }

  async function resendCode() {
    if (busy || resendSeconds || authUnavailable) return;
    setBusy("resend"); setFeedback(null);
    try {
      const reply = await request<AuthReply>("/api/cup/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: authMode === "reset" ? "recover" : "resend", email: email.trim().toLowerCase() }) });
      startCooldown();
      setFeedback({ error: false, text: reply.message || "请查收新的邮箱验证码，有效期为 5 分钟。" });
    } catch (error) { showError(error); }
    finally { setBusy(""); }
  }

  async function logout() {
    if (busy) return;
    setBusy("logout"); setFeedback(null);
    try {
      await request("/api/cup/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "logout" }) });
      setStatus(current => current ? { ...current, user: null, myEntries: [] } : null);
      setPassword(""); setCode(""); setAuthMode("login"); reload();
      setFeedback({ error: false, text: "已退出登录。" });
    } catch (error) { showError(error); }
    finally { setBusy(""); router.refresh(); }
  }

  function voteReason(entry: CupEntry): string {
    if (!user) return "登录后投票";
    if (user.disabled) return "账号已停用";
    if (status?.event.phase !== "voting") return status?.event.phase === "ended" ? "投票已结束" : "投票尚未开放";
    if (user.votedAuthors[entry.division].includes(entry.authorId)) return "已为此作者投票";
    if (user.votesUsed[entry.division] >= 5) return "本组票数已用完";
    return "";
  }

  async function vote(entry: CupEntry) {
    if (busy || voteReason(entry)) return;
    setBusy(entry.id); setFeedback(null);
    try {
      await request("/api/cup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "vote", entryId: entry.id }) });
      reload();
      setFeedback({ error: false, text: `已为「${entry.title}」投出 1 票。` });
    } catch (error) { showError(error); reload(); }
    finally { setBusy(""); }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSubmit) return;
    const form = event.currentTarget;
    setBusy("upload"); setFeedback(null);
    try {
      if (!frontFile) throw new Error("请上传一张作品正面图。");
      const payload = new FormData(form);
      payload.set("title", String(payload.get("title") || "").trim());
      payload.set("description", String(payload.get("description") || "").trim());
      payload.delete("images");
      payload.delete("frontImage");
      const images = await prepareImages([frontFile, ...files]);
      payload.append("frontImage", images[0]);
      for (const image of images.slice(1)) payload.append("images", image);
      await request("/api/cup/upload", { method: "POST", body: payload });
      form.reset(); setFrontFile(null); setFiles([]); reload();
      setFeedback({ error: false, text: "作品已提交，审核通过后会公开展示。" });
    } catch (error) { showError(error); }
    finally { setBusy(""); }
  }

  return (
    <div className={`cup-shell${authOnly ? " cup-login-page" : ""}`}>
      <a className="skip-link" href="#cup-main">跳到内容</a>
      <header className="cup-header"><div className="cup-header-inner">
        <a className="brand" href="/" aria-label="返回星界工坊首页"><WorkshopLogo className="brand-mark" /><span>星界工坊<small>ASTRAL WORKSHOP</small></span></a>
        <nav aria-label="赛事导航"><a href="/">工坊首页</a><a href={authOnly ? "/cup#rules" : "#rules"}>赛事规则</a><a href={authOnly ? "/cup#entries" : "#entries"}>作品展示</a><a href={user ? authOnly ? "/cup#participate" : "#participate" : "/cup/login"}>{user ? "参赛中心" : "登录 / 注册"}</a><a className="cup-header-action" href="/cup/register">报名 / 查看报名<span aria-hidden="true">↗</span></a>{isAdmin && <a href="/admin/cup">赛事管理</a>}</nav>
      </div></header>
      <main className="cup-page" id="cup-main">
        {fallbackAt && <p className="cup-notice" role="status">赛事服务暂不可用。当前显示 {new Date(fallbackAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} 记录的活动信息，报名、投稿与投票暂缓。 <button type="button" className="text-button" onClick={reload}>刷新赛事状态</button></p>}
        {!authOnly && <>
        <section className="cup-hero" aria-labelledby="cup-title">
          <div className="cup-hero-topline"><p className="cup-eyebrow">TRPG MINIATURE PAINTING COMPETITION</p><span className="cup-phase">{status ? phaseNames[status.event.phase] : "正在读取活动状态"}</span></div>
          <div className="cup-hero-layout">
            <div className="cup-hero-copy">
              <h1 id="cup-title" aria-label="星界杯第一届——矮人涂装大赛！"><span className="cup-hero-edition">第一届 · 矮人涂装大赛<i>CUP—01 / DWARVES</i></span><span className="cup-hero-title">星界杯<span className="cup-title-star" aria-hidden="true">✳</span></span><span className="cup-hero-subtitle">让热爱，落在每一笔。</span></h1>
              <p>一场面向新手与老手的棋子涂装交流。用颜色讲述你的冒险，也让第一份勇气被看见。</p>
              <div className="cup-hero-actions"><a className="button primary" href="/cup/register">我要报名 <span aria-hidden="true">↗</span></a><a className="button secondary" href="#entries">浏览参赛作品 <span aria-hidden="true">→</span></a></div>
              <p className="cup-hero-note"><span>新手组 ¥15.9 · 1 只已处理矮人，包邮到家</span><span>老手组 ¥19.9 · 寄送 2 只未处理矮人</span></p>
            </div>
            <figure className="cup-poster">
              <div className="cup-poster-image"><img src="/assets/demo-model.svg" alt="提亚马特五首龙模型，老手组金奖展示" width={1254} height={1254} fetchPriority="high" /><div className="cup-poster-meta" aria-hidden="true"><span>ASTRAL CUP<br />PAINT YOUR STORY.</span><strong>01</strong></div></div>
              <figcaption><span>老手组金奖展示 / 提亚马特</span><strong>奖品形象参考 · 非参赛作品</strong></figcaption>
            </figure>
          </div>
          <div className="cup-hero-bottom"><p>主办 <strong>星界研究所 TRPG</strong><span> / </span>赞助 <strong>希梦魔法屋</strong></p><a href="#rules">从这里了解比赛 <span aria-hidden="true">↓</span></a></div>
        </section>
        {isAdmin && <section className="cup-admin-console" aria-labelledby="cup-admin-console-title">
          <div className="cup-admin-console-heading"><div><p className="cup-eyebrow">ADMINISTRATOR WORKSPACE</p><h2 id="cup-admin-console-title">赛事管理员控制台</h2><p>管理活动阶段、登录账号与参赛作品。</p></div><a className="button primary" href="/admin/cup">打开管理后台 <span aria-hidden="true">↗</span></a></div>
          <div className="cup-admin-console-phase"><span>{fallbackAt ? "最近记录的阶段" : "当前活动阶段"}</span><strong>{loadError ? "读取失败，请到后台核对" : status ? phaseNames[status.event.phase] : "正在读取活动状态"}</strong><a href="/admin/cup#cup-stage">调整活动阶段 →</a></div>
          <div className="cup-admin-console-links">
            <a href="/admin/cup#cup-stage"><span className="cup-admin-console-index">01</span><div><h3>活动开始 / 结束</h3><p>切换报名、涂装、投票及结束阶段。</p></div><span className="cup-admin-console-arrow" aria-hidden="true">↗</span></a>
            <a href="/admin/cup#cup-members"><span className="cup-admin-console-index">02</span><div><h3>登录用户与账号管理</h3><p>查看用户邮箱、最近登录记录，停用或恢复账号。</p></div><span className="cup-admin-console-arrow" aria-hidden="true">↗</span></a>
          </div>
        </section>}
        <section className="cup-progress" aria-label="赛事阶段">
          <div className="cup-progress-label"><span className="cup-eyebrow">EVENT PROGRESS</span><p>具体日期由主办方发布</p></div>
          <ol className="cup-phase-track">{phases.map((phase, index) => <li key={phase} className={status?.event.phase === phase ? "current" : ""} aria-current={status?.event.phase === phase ? "step" : undefined}><span>0{index + 1}</span><strong>{phaseNames[phase]}</strong></li>)}</ol>
        </section>
        <CupRules />
        <section className="cup-section" id="entries" aria-labelledby="cup-entries-title">
          <div className="cup-heading"><div className="cup-section-headline"><span className="cup-section-number" aria-hidden="true">05</span><div><p className="cup-eyebrow">THE ENTRIES</p><h2 id="cup-entries-title">每一笔，都有自己的故事</h2></div></div><p>审核通过的作品在这里公开展示</p></div>
          <div className="cup-toolbar"><div className="cup-tabs" aria-label="作品组别">{(["beginner", "experienced"] as Division[]).map(group => <button key={group} type="button" aria-pressed={division === group} className={division === group ? "active" : ""} onClick={() => { setDivision(group); setPage(1); }}>{divisionNames[group]}</button>)}</div><span className="cup-vote-badge">{user ? `本组剩余 ${Math.max(0, 5 - user.votesUsed[division])} / 5 票` : "登录后，每组各有 5 票"}</span></div>
          {user && <div className="cup-vote-summary"><span>新手组剩余 <strong>{Math.max(0, 5 - user.votesUsed.beginner)}</strong> 票</span><span>老手组剩余 <strong>{Math.max(0, 5 - user.votesUsed.experienced)}</strong> 票</span><small>同一作者同组最多 1 票 · 未用完也可结束</small></div>}
          {!user && !fallbackAt && <p className="cup-gallery-note"><a href="/cup/login">登录参赛账号</a> 后参与投票。投票仅在公开投票阶段开放。</p>}
          {loadError ? <div className="cup-empty" role="alert"><h3>暂时无法读取作品</h3><p>{loadError}</p><button className="button secondary" onClick={reload}>重新加载</button></div> : loading ? <div className="cup-empty" role="status"><p>正在读取作品，请稍候…</p></div> : fallbackAt ? <div className="cup-empty" role="status"><p>作品列表暂时无法读取。</p></div> : !status?.entries.some(entry => entry.status === "approved" && entry.division === division) ? <div className="cup-empty cup-gallery-empty"><span className="cup-empty-mark" aria-hidden="true">✳</span><span className="cup-eyebrow">WAITING FOR THE FIRST BRUSHSTROKE</span><h3>这里，等待第一件作品</h3><p>当前组别暂无公开作品。完成投稿并通过审核后，作品就会出现在这里。</p></div> : <div className="cup-grid">{status.entries.filter(entry => entry.status === "approved" && entry.division === division).map(entry => {
            const reason = voteReason(entry);
            return <article className="cup-entry" key={entry.id}><button className="cup-entry-image" onClick={() => setPhoto({ entry, index: 0 })} aria-label={`查看「${entry.title}」完整照片`}>{entry.images[0] ? <img src={entry.images[0]} alt={`${entry.title} · ${entry.authorName}的涂装作品`} loading="lazy" /> : <span>暂无照片</span>}<span className="cup-image-hint">查看大图 · {entry.images.length} 张</span></button><div className="cup-entry-copy"><span className="cup-eyebrow">{divisionNames[entry.division]}</span><h3>{entry.title}</h3><p className="cup-entry-author">作者 · {entry.authorName}</p>{entry.description && <p className="cup-entry-description">{entry.description}</p>}<div className="cup-entry-bottom"><span><strong>{entry.votes}</strong> 票</span><button className="button secondary" disabled={!!reason || !!busy || loading} onClick={() => vote(entry)}>{busy === entry.id ? "正在投票…" : reason || "投出 1 票"}</button></div></div></article>;
          })}</div>}
          <div className="cup-pagination"><button className="button secondary" disabled={page <= 1 || loading || !!busy} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} 页</span><button className="button secondary" disabled={!status?.hasMore || loading || !!busy || !!loadError} onClick={() => setPage(value => value + 1)}>下一页</button></div>
        </section>
        </>}
        <section className="cup-section cup-final-section" id="participate" aria-labelledby="cup-participate-title">
          <div className="cup-heading"><div className="cup-section-headline"><span className="cup-section-number" aria-hidden="true">06</span><div><p className="cup-eyebrow">YOUR WORKBENCH</p><h2 id="cup-participate-title">{authOnly ? "登录你的工坊账号" : "从这里，开始你的参赛之旅"}</h2></div></div><p>{authOnly ? "使用注册邮箱和密码，登录后继续报名。" : "报名事宜可联系主办微信 示例联系渠道"}</p></div>
          {(!authOnly || user) && <p className="cup-gallery-note"><a className="button primary" href="/cup/register">选择模型，报名参赛 →</a> {status?.registration ? `已报名：${divisionNames[status.registration.division]} · 查看选款与寄送资料` : "登录后选择指定矮人、参赛赛道并提交寄送资料。"}</p>}
          {!authOnly && <aside className="cup-photo-reference" id="cup-photo-guide" aria-labelledby="cup-photo-guide-title"><a href="/assets/demo-model.svg" target="_blank" rel="noreferrer" aria-label="查看正面角度参考大图（新窗口）"><img src="/assets/demo-model.svg" alt="作品正面拍摄角度参考：矮人全身、脸部、装备和底座清晰可见" width={739} height={799} loading="lazy" /></a><div><p className="cup-eyebrow">PHOTO GUIDE / 正面角度参考</p><h3 id="cup-photo-guide-title">每件作品至少上传一张正面图</h3><p>参考左图拍摄，完整展示模型正面，保持脸部、装备及底座清晰，避免裁切。示例仅用于说明拍摄角度。</p><p>请在“作品正面图”中上传，作为作品首图；可另附最多 3 张其他角度。主办方将审核正面角度是否符合要求。</p></div></aside>}
          {status?.authReady === false && !fallbackAt && <p className="cup-notice">邮箱验证服务维护中，账号注册、登录及找回暂不可用。活动规则与公开作品仍可浏览。</p>}
          {!status ? <div className="cup-empty"><p>{loadError || "正在读取参赛账号状态…"}</p>{loadError && <button className="button secondary" onClick={reload}>重新加载</button>}</div> : !user ? <div className="cup-auth-layout"><div className="cup-auth-intro"><p className="cup-eyebrow">ONE ACCOUNT · EVERY BRUSHSTROKE</p><h3>留下你的署名</h3><p>使用邮箱创建参赛账号。登录后，可以提交作品、查看审核进度，并在投票开放后为喜欢的作品投票。</p><p>新手组 ¥15.9 · 老手组 ¥19.9<br />新手组寄送 1 只已处理矮人（包邮）；老手组寄送 2 只未处理矮人。</p></div><form className="cup-form cup-auth" onSubmit={authenticate}><div className="cup-auth-tabs"><button type="button" disabled={!!busy} className={authMode !== "signup" ? "active" : ""} onClick={() => changeAuthMode("login")}>登录</button><button type="button" disabled={!!busy} className={authMode === "signup" ? "active" : ""} onClick={() => changeAuthMode("signup")}>注册</button></div><h3>{authTitles[authMode]}</h3>{authOnly && feedback && <p className={"cup-auth-feedback"+(feedback.error ? " error" : "")} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}<div className="cup-auth-admin-entry"><span>管理赛事？请使用独立的管理员账号。</span><a href="/admin/login?next=/admin/cup">管理员登录 ↗</a></div><label>邮箱<input type="email" disabled={!!busy} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} readOnly={authMode === "verify" || authMode === "reset"} /></label>{authMode === "signup" && <label>参赛署名<input disabled={!!busy} autoComplete="nickname" value={displayName} onChange={event => setDisplayName(event.target.value)} required minLength={2} maxLength={30} placeholder="2–30 个字符" /></label>}{["login", "signup", "reset"].includes(authMode) && <label>{authMode === "reset" ? "新密码" : "密码"}<input type="password" disabled={!!busy} autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} required minLength={10} maxLength={20} placeholder="10–20 个字符" /></label>}{(authMode === "verify" || authMode === "reset") && <><label>邮箱验证码<input disabled={!!busy} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} required pattern="[0-9]{6}" maxLength={6} placeholder="6 位数字" /></label><div className="cup-code-row"><small>验证码有效期为 5 分钟</small><button type="button" className="text-button" disabled={!!busy || resendSeconds > 0 || authUnavailable} onClick={resendCode}>{resendSeconds ? `${resendSeconds} 秒后可重发` : busy === "resend" ? "正在发送…" : "重新发送验证码"}</button></div></>}<button className="button primary" type="submit" disabled={!!busy || authUnavailable}>{busy === "auth" ? "正在处理…" : authMode === "signup" || authMode === "recover" ? "发送邮箱验证码" : authMode === "verify" ? "验证并登录" : authMode === "reset" ? "更新密码" : authOnly ? "登录并继续" : "登录"}</button><div className="cup-auth-links"><button type="button" disabled={!!busy} className="text-button" onClick={() => changeAuthMode(authMode === "login" ? "recover" : "login")}>{authMode === "login" ? "忘记密码？" : "返回登录"}</button><a href={authOnly ? "/cup#rules" : "#rules"}>查看参赛规则 ↗</a></div></form></div> : <>
            <div className="cup-account-bar"><div><span className="cup-eyebrow">WELCOME BACK</span><h3>{user.displayName}</h3><p>{user.email}</p></div><button className="button secondary" disabled={!!busy} onClick={logout}>{busy === "logout" ? "正在退出…" : "退出登录"}</button></div>
            {user.disabled ? <p className="cup-notice">当前账号已停用，暂时无法投稿或投票。如有疑问，请联系主办方。</p> : <div className="cup-participant-grid"><div><h3 className="cup-subheading">提交参赛作品</h3>{canSubmit ? <form className="cup-form cup-upload" onSubmit={upload}><label>参赛组别<select name="division" defaultValue="beginner" disabled={!!busy}><option value="beginner">新手组 · ¥15.9</option><option value="experienced">老手组 · ¥19.9</option></select></label><label>作品标题<input name="title" disabled={!!busy} required maxLength={80} placeholder="为你的作品起个名字" /></label><label>作品说明<textarea name="description" disabled={!!busy} rows={4} maxLength={1000} placeholder="分享配色思路、创作故事或你想记录的细节" /></label><label>作品正面图（必传，作为首图）<input type="file" disabled={!!busy} name="frontImage" accept="image/jpeg,image/png,image/webp" required aria-describedby="cup-photo-guide" onChange={event => setFrontFile(event.target.files?.[0] || null)} /></label><label>其他角度照片（选填，最多 3 张）<input type="file" disabled={!!busy} name="images" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { const selected = Array.from(event.target.files || []); if (selected.length > 3) { event.target.value = ""; setFiles([]); setFeedback({ error: true, text: "除正面图外，最多选择 3 张补充照片。" }); } else setFiles(selected); }} /></label><p className="cup-form-hint">必须上传 1 张正面图，可附 0–3 张其他角度的 JPG、PNG 或 WebP 照片。上传前会按比例缩小至最长边 1920 像素，总上传大小需小于 6 MB。</p>{(frontFile || files.length > 0) && <ul className="cup-file-list">{frontFile && <li>正面图：{frontFile.name}</li>}{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}</ul>}<button className="button primary" type="submit" disabled={!!busy}>{busy === "upload" ? "正在处理照片并提交…" : "提交作品，等待审核"}</button><p className="cup-form-hint">提交作品后，由主办方审核正面照片及作品内容；通过后才会向公众展示。</p></form> : <div className="cup-empty cup-empty-small"><p>{status.event.phase === "upcoming" ? "活动尚未开始，请等待主办方开放报名。" : "当前阶段不接受新投稿。"}</p><p>仅在投稿阶段可提交作品，具体日期请留意主办方发布。</p></div>}</div><div><h3 className="cup-subheading">我的投稿 <small>{status.myEntries.length} 件</small></h3>{status.myEntries.length ? <div className="cup-my-entries">{status.myEntries.map(entry => <article className="cup-my-entry" key={entry.id}><div className="cup-my-entry-top"><span className={`cup-state cup-state-${entry.status}`}>{reviewNames[entry.status]}</span><small>{divisionNames[entry.division]}</small></div><h4>{entry.title}</h4><p>{entry.description || "未填写作品说明"}</p>{entry.reviewNote && <p className="cup-review-note">主办方反馈：{entry.reviewNote}</p>}<div className="cup-my-entry-bottom"><span>{entry.votes} 票 · {entry.images.length} 张照片</span>{entry.images.length > 0 && <button className="text-button" onClick={() => setPhoto({ entry, index: 0 })}>查看照片 ↗</button>}</div></article>)}</div> : <div className="cup-empty cup-empty-small"><p>你还没有提交作品。</p><p>参赛作品与审核进度会显示在这里。</p></div>}</div></div>}
          </>}
        </section>
      </main>
      <footer className="cup-footer"><div className="cup-footer-wordmark" aria-hidden="true">PAINT YOUR STORY<span>✳</span></div><span>© 星界工坊 · ASTRAL WORKSHOP</span><p>主办：星界研究所 TRPG <i>·</i> 赞助：希梦魔法屋</p><a href="/admin/cup">{isAdmin ? "赛事管理 ↗" : "管理员登录 ↗"}</a><a href="/">返回工坊首页 ↗</a></footer>
      {feedback && (!authOnly || user) && <div className={`cup-feedback ${feedback.error ? "cup-feedback-error" : ""}`} role={feedback.error ? "alert" : "status"}><p>{feedback.text}</p><button type="button" onClick={() => setFeedback(null)} aria-label="关闭提示">×</button></div>}
      <dialog ref={dialog} className="cup-dialog" aria-label={photo ? `${photo.entry.title}的作品照片` : "作品照片"} onClose={() => setPhoto(null)} onCancel={() => setPhoto(null)} onClick={event => { if (event.target === event.currentTarget) setPhoto(null); }}><div className="cup-dialog-inner">{photo && <><div className="cup-dialog-heading"><div><h2>{photo.entry.title}</h2><p>作者 · {photo.entry.authorName}</p></div><button className="icon-button" type="button" onClick={() => setPhoto(null)} aria-label="关闭作品照片">×</button></div><img className="cup-dialog-photo" src={photo.entry.images[photo.index]} alt={`${photo.entry.title}第 ${photo.index + 1} 张照片`} /><div className="cup-photo-tabs">{photo.entry.images.map((image, index) => <button type="button" key={`${image}-${index}`} className={photo.index === index ? "active" : ""} onClick={() => setPhoto({ entry: photo.entry, index })} aria-label={`查看第 ${index + 1} 张照片`} aria-pressed={photo.index === index}><img src={image} alt="" /></button>)}</div></>}</div></dialog>
    </div>
  );
}

