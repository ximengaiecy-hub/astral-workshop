'use client';

import { useEffect, useRef, useState } from 'react';
import { divisionNames, phaseNames, phases } from '../../cup/types';
import type { CupAdminData, Division, EntryStatus, Phase } from '../../cup/types';
import RegistrationEditor from './RegistrationEditor';

const statusNames: Record<EntryStatus, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝', hidden: '已隐藏' };
const auditNames: Record<string, string> = { adminUpdateRegistration: '修改报名组别和模型', adminSetPhase: '切换阶段', adminReviewEntry: '审核作品', adminDeleteEntry: '删除投稿', adminSetMember: '设置参与者状态', adminRevokeVote: '撤销投票', adminClearVotes: '清空票数' };
const date = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

async function request(body: Record<string, unknown>) {
  const response = await fetch('/api/cup', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : '操作未完成，请稍后重试。');
  return result;
}

export default function CupAdmin() {
  const [data, setData] = useState<CupAdminData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [phase, setPhase] = useState<Phase>('upcoming');
  const [statusFilter, setStatusFilter] = useState<EntryStatus | 'all'>('all');
  const [clearDivision, setClearDivision] = useState<Division | 'all'>('all');
  const [confirmation, setConfirmation] = useState('');
  const working = useRef(false);

  async function reload() {
    const overview = await request({ op: 'adminOverview' }) as CupAdminData;
    setData(overview);
    setPhase(overview.event.phase);
  }

  useEffect(() => {
    let active = true;
    request({ op: 'adminOverview' }).then((overview: CupAdminData) => {
      if (active) { setData(overview); setPhase(overview.event.phase); }
    }).catch(problem => { if (active) setError(problem instanceof Error ? problem.message : '暂时无法读取赛事数据。'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function run(body?: Record<string, unknown>, message = '数据已刷新。') {
    if (working.current) return;
    working.current = true;
    setBusy(true); setError(''); setNotice('');
    let changed = false;
    try {
      if (body) { await request(body); changed = true; }
      await reload();
      setNotice(message);
      return true;
    } catch (problem) {
      setError((changed ? '操作已提交，但列表刷新失败，请先刷新核对。' : '') + (problem instanceof Error ? problem.message : '连接中断，请刷新后重试。'));
      return false;
    } finally { working.current = false; setBusy(false); }
  }

  useEffect(()=>{
    const refresh=()=>{if(!document.hidden)void run(undefined,'');};
    window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);

  const members = new Map(data?.members.map(member => [member.id, member]));
  const entries = data?.entries.filter(entry => statusFilter === 'all' || entry.status === statusFilter) ?? [];

  return <main className="cup-admin">
    <nav className="cup-admin-top" aria-label="管理员导航"><a href="/admin">← 订单后台</a><a href="/cup">查看星界杯</a><form action="/api/admin/logout" method="post"><button type="submit" className="text-button">退出登录</button></form></nav>
    <header className="cup-admin-header"><div><p className="cup-admin-eyebrow">ASTRAL CUP · ADMIN</p><h1>星界杯管理员控制台</h1><p>活动开始与结束、登录账号、作品审核与投票管理</p></div><button type="button" className="button secondary" onClick={() => void run()} disabled={busy}>{busy ? '正在读取…' : '刷新数据'}</button></header>
    <div className="cup-admin-messages" aria-live="polite" aria-atomic="true">{error && <p className="cup-admin-error" role="alert">{error}</p>}{notice && <p className="cup-admin-notice" role="status">{notice}</p>}</div>
    {!data && <p className="cup-admin-empty">{busy ? '正在读取星界杯数据…' : '未能读取赛事数据，请点击刷新重试。'}</p>}
    {data && <>
      <nav className="cup-admin-sections" aria-label="管理分区"><a href="#cup-stage">活动开始 / 结束</a><a href="#cup-registrations">赛事报名 · {data.registrations?.length??0}</a><a href="#cup-entries">作品审核 · {data.entries.length}</a><a href="#cup-members">用户账号 · {data.members.length}</a><a href="#cup-votes">投票记录 · {data.votes.length}</a><a href="#cup-audit">操作审计</a></nav>
      <section className="cup-admin-panel" id="cup-stage" aria-labelledby="cup-stage-title">
        <div className="cup-admin-section-heading"><h2 id="cup-stage-title">活动开始 / 结束</h2><span className="cup-admin-badge">当前阶段：{phaseNames[data.event.phase]}</span></div>
        <p className="cup-admin-muted">更新时间：{date(data.event.updatedAt)}。切换阶段后立即生效，请核对再确认。</p><p className="cup-admin-muted">仅在投稿阶段开放作品上传，仅在公开投票阶段开放投票；选择“本届已结束”后停止投稿与投票。</p>
        <form className="cup-admin-inline" onSubmit={event => { event.preventDefault(); if (window.confirm(`将星界杯从「${phaseNames[data.event.phase]}」切换为「${phaseNames[phase]}」？\n此操作将影响报名、投稿或投票的开放状态。`)) void run({ op: 'adminSetPhase', phase }, '赛事阶段已更新。'); }}>
          <label htmlFor="cup-phase">选择活动阶段<select id="cup-phase" value={phase} onChange={event => setPhase(event.target.value as Phase)} disabled={busy}>{phases.map(value => <option key={value} value={value}>{phaseNames[value]}</option>)}</select></label>
          <button className="button primary" type="submit" disabled={busy || phase === data.event.phase}>确认切换阶段</button>
        </form>
      </section>
      <section className="cup-admin-panel" id="cup-registrations" aria-labelledby="cup-registrations-title">
        <h2 id="cup-registrations-title">赛事报名与寄送资料</h2><p className="cup-admin-muted">报名同步保存至工坊订单后台；删除报名订单会同时取消对应报名。这里的资料仅管理员和报名本人可查看；提交资料不代表在线付款。</p>
        {(data.registrations??[]).length===0&&<p className="cup-admin-empty">还没有报名记录。</p>}
        <div className="cup-admin-entries">{(data.registrations??[]).map(registration=><details className="cup-admin-entry" key={registration.id}><summary><strong>{registration.display_name}</strong><span>{divisionNames[registration.division]} · ¥{(registration.fee_cents/100).toFixed(1)}</span><span>{date(registration.created_at)}</span></summary><div className="cup-admin-entry-body"><p>注册邮箱：{registration.email}</p><p>联系方式：{registration.contact}</p><p>收件人：{registration.recipient} · {registration.phone}<br/>邮寄地址：{registration.address}</p><p>{registration.division==='beginner'?'赠送 1 只打磨预处理矮人，包邮到家':'赠送 2 只未处理矮人，由主办方寄送'}</p><div className="cup-admin-photos">{registration.models.map((model,index)=><a href={model.image} key={index} target="_blank" rel="noreferrer"><img src={model.image} alt={model.name} loading="lazy"/><span>{index+1}. {model.name} · {model.officialName}</span></a>)}</div><p className="cup-admin-id">报名编号：{registration.id}<br/>关联订单：{registration.order_id||'订单记录已删除'}</p><RegistrationEditor registration={registration} busy={busy} onSave={run} /><a href="/admin">打开订单后台 →</a></div></details>)}</div>
      </section>
      <section className="cup-admin-panel" id="cup-entries" aria-labelledby="cup-entries-title">
        <p className="cup-admin-muted">新投稿须包含清晰、完整的正面图，并作为首图。请在通过审核前核对拍摄角度。</p>
        <div className="cup-admin-section-heading"><h2 id="cup-entries-title">作品审核</h2><label className="cup-admin-filter" htmlFor="cup-status">审核状态<select id="cup-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as EntryStatus | 'all')}><option value="all">全部状态</option>{(Object.keys(statusNames) as EntryStatus[]).map(value => <option key={value} value={value}>{statusNames[value]}</option>)}</select></label></div>
        {entries.length === 0 && <p className="cup-admin-empty">{data.entries.length ? '当前状态下没有作品。' : '还没有投稿。'}</p>}
        <div className="cup-admin-entries">{entries.map(entry => <details className="cup-admin-entry" key={entry.id + entry.status + entry.reviewNote}>
          <summary><strong>{entry.title}</strong><span>{entry.authorName} · {divisionNames[entry.division]}</span><span className={'cup-admin-badge status-' + entry.status}>{statusNames[entry.status]}</span><span>{entry.votes} 票</span></summary>
          <div className="cup-admin-entry-body"><p>作者：{entry.authorName} · {members.get(entry.authorId)?.email || '邮箱未提供'}</p><p className="cup-admin-muted">作者编号：{entry.authorId}<br />作品编号：{entry.id}<br />投稿时间：{date(entry.createdAt)}</p><p className="cup-admin-description">{entry.description || '未填写作品说明。'}</p>
            <div className="cup-admin-photos">{entry.images.map((image, index) => <a href={image} target="_blank" rel="noreferrer" key={image + index} aria-label={`查看「${entry.title}」第${index + 1}张原图（新窗口）`}><img src={image} alt={`${entry.title} · 实拍 ${index + 1}`} loading="lazy" /><span>查看原图 ↗</span></a>)}</div>
            {entry.images.length === 0 && <p className="cup-admin-muted">该投稿没有可显示的照片。</p>}
            <form className="cup-admin-review" onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); const status = values.get('status') as EntryStatus; if (window.confirm(`确定将「${entry.title}」设为「${statusNames[status]}」？`)) void run({ op: 'adminReviewEntry', entryId: entry.id, status, reviewNote: values.get('reviewNote') }, '作品审核已保存。'); }}>
              <label htmlFor={'cup-review-note-' + entry.id}>审核备注<textarea id={'cup-review-note-' + entry.id} name="reviewNote" defaultValue={entry.reviewNote} maxLength={1000} rows={2} disabled={busy} /></label>
              <div className="cup-admin-inline"><label htmlFor={'cup-review-status-' + entry.id}>审核结果<select id={'cup-review-status-' + entry.id} name="status" defaultValue={entry.status === 'pending' ? 'approved' : entry.status} disabled={busy}><option value="approved">通过，公开作品</option><option value="rejected">拒绝投稿</option><option value="hidden">隐藏作品</option></select></label><button className="button primary" type="submit" disabled={busy}>保存审核</button></div>
            </form>
            <button className="button cup-admin-danger" type="button" disabled={busy} onClick={() => { if (window.confirm(`删除「${entry.title}」的投稿？\n将撤销该作品的关联投票，并从作品展示、作者投稿和管理列表中移除。此操作无法从后台恢复，操作记录会保留。`)) void run({ op: 'adminDeleteEntry', entryId: entry.id, confirmation: '删除投稿' }, '投稿及关联投票已删除。'); }}>删除投稿</button>
          </div>
        </details>)}</div>
      </section>
      <section className="cup-admin-panel" id="cup-members" aria-labelledby="cup-members-title">
        <h2 id="cup-members-title">已登录用户与参赛账号</h2><p className="cup-admin-muted">查看用户邮箱与最近登录记录。最近登录不代表当前在线；禁用与恢复仅作用于星界杯账号。</p>
        <div className="cup-admin-table"><table><caption className="sr-only">星界杯账号与最近登录记录</caption><thead><tr><th scope="col">参与者 / 邮箱</th><th scope="col">状态</th><th scope="col">注册时间 / 最近登录</th><th scope="col">账号管理</th></tr></thead><tbody>{data.members.map(member => <tr key={member.id}><td><strong>{member.displayName}</strong><p>{member.email}</p><p className="cup-admin-id">{member.id}</p></td><td>{member.disabled ? '已禁用' : '正常'}</td><td>注册：{date(member.createdAt)}<p>最近登录：{member.lastLoginAt ? date(member.lastLoginAt) : '尚未登录'}</p></td><td><button type="button" className={'button ' + (member.disabled ? 'secondary' : 'cup-admin-danger')} disabled={busy} onClick={() => { if (window.confirm(`确定${member.disabled ? '恢复' : '禁用'}「${member.displayName}」的星界杯账号？\n${member.email}`)) void run({ op: 'adminSetMember', memberId: member.id, disabled: !member.disabled }, '参与者状态已更新。'); }}>{member.disabled ? '恢复账号' : '禁用账号'}</button></td></tr>)}</tbody></table></div>
        {data.members.length === 0 && <p className="cup-admin-empty">还没有参与者。</p>}
      </section>
      <section className="cup-admin-panel" id="cup-votes" aria-labelledby="cup-votes-title">
        <h2 id="cup-votes-title">投票记录</h2><p className="cup-admin-muted">可按记录撤销真实投票。撤销与清空后，请核对更新后的票数。</p>
        <div className="cup-admin-table"><table><caption className="sr-only">星界杯逐票记录</caption><thead><tr><th scope="col">投票者</th><th scope="col">投给作品 / 作者</th><th scope="col">组别 / 时间</th><th scope="col">操作</th></tr></thead><tbody>{data.votes.map(vote => <tr key={vote.id}><td>{vote.voterEmail}<p className="cup-admin-id">{vote.voterId}</p></td><td><strong>{vote.entryTitle}</strong><p>{vote.authorName}</p></td><td>{divisionNames[vote.division]}<p>{date(vote.createdAt)}</p></td><td><button type="button" className="button cup-admin-danger" disabled={busy} onClick={() => { if (window.confirm(`撤销这张投票？\n投票者：${vote.voterEmail}\n作品：${vote.entryTitle}\n组别：${divisionNames[vote.division]}`)) void run({ op: 'adminRevokeVote', voteId: vote.id }, '投票已撤销。'); }} aria-label={`撤销${vote.voterEmail}投给${vote.entryTitle}的票`}>撤销此票</button></td></tr>)}</tbody></table></div>
        {data.votes.length === 0 && <p className="cup-admin-empty">还没有投票记录。</p>}
        <form className="cup-admin-clear" onSubmit={event => { event.preventDefault(); if (confirmation !== '清空票数') return; const scope = clearDivision === 'all' ? '全部组别' : divisionNames[clearDivision]; if (window.confirm(`确定清空${scope}的全部投票？\n此操作无法恢复，请确认已核对。`)) void run({ op: 'adminClearVotes', division: clearDivision, confirmation }, `${scope}票数已清空。`).then(ok => { if (ok) setConfirmation(''); }); }}>
          <h3>清空投票</h3><p className="cup-admin-muted">此操作无法恢复。选择范围并输入“清空票数”后确认。</p><div className="cup-admin-inline"><label htmlFor="cup-clear-division">清空范围<select id="cup-clear-division" value={clearDivision} onChange={event => setClearDivision(event.target.value as Division | 'all')} disabled={busy}><option value="all">全部组别</option><option value="beginner">新手组</option><option value="experienced">老手组</option></select></label><label htmlFor="cup-clear-confirm">输入确认文字<input id="cup-clear-confirm" value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder="清空票数" autoComplete="off" disabled={busy} required /></label><button className="button cup-admin-danger" type="submit" disabled={busy || confirmation !== '清空票数' || data.votes.length === 0}>确认清空票数</button></div>
        </form>
      </section>
      <section className="cup-admin-panel" id="cup-audit" aria-labelledby="cup-audit-title">
        <h2 id="cup-audit-title">操作审计</h2><div className="cup-admin-table"><table><caption className="sr-only">星界杯管理员操作记录</caption><thead><tr><th scope="col">时间</th><th scope="col">操作者</th><th scope="col">操作</th><th scope="col">目标</th></tr></thead><tbody>{data.audit.map(item => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{item.actor}</td><td>{auditNames[item.action] || item.action}</td><td className="cup-admin-id">{item.target}</td></tr>)}</tbody></table></div>{data.audit.length === 0 && <p className="cup-admin-empty">还没有操作记录。</p>}
      </section>
    </>}
  </main>;
}

