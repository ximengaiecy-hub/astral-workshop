'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import WorkshopLogo from '../../WorkshopLogo';
import models from '../registration-models.json';
import { divisionNames, phaseNames, type CupStatus, type CupRegistration, type Division } from '../types';

async function request<T>(init?:RequestInit):Promise<T>{
  const response=await fetch('/api/cup',{credentials:'same-origin',cache:'no-store',...init});
  const data=await response.json().catch(()=>{throw new Error('服务未返回有效内容，请稍后重试。');});
  if(!response.ok)throw new Error(data.error||'提交未完成，请重试。');
  return data as T;
}

export default function RegistrationClient(){
  const [status,setStatus]=useState<CupStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [modelIds,setModelIds]=useState<string[]>([]),[division,setDivision]=useState<Division>('beginner');
  const submission=useRef({body:'',id:''}),working=useRef(false);
  const selected=modelIds.map(id=>models.find(model=>model.id===id)!),modelCount=division==='beginner'?1:2,user=status?.user,registration=status?.registration;
  const canRegister=!!user&&!user.disabled&&status?.event.phase==='registration';
  async function reload(){try{setStatus(await request<CupStatus>());setError('');}catch(problem){setError(problem instanceof Error?problem.message:'无法读取报名状态。');}}
  useEffect(()=>{let active=true;request<CupStatus>().then(value=>{if(active)setStatus(value);}).catch(problem=>{if(active)setError(problem instanceof Error?problem.message:'无法读取报名状态。');});return()=>{active=false;};},[]);
  useEffect(()=>{
    let inFlight=false;
    const refresh=async()=>{if(document.hidden||working.current||inFlight)return;inFlight=true;try{await reload();}finally{inFlight=false;}};
    window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);

  function chooseModel(id:string){
    setModelIds(current=>{
      if(division==='beginner')return[id];
      if(current.includes(id))return current.filter(value=>value!==id);
      return current.length<2?[...current,id]:current;
    });
    setError('');
  }

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(working.current||!canRegister)return;
    if(modelIds.length!==modelCount){setError(`请在模型卡片上选满${modelCount}枚矮人。`);return;}
    working.current=true;setBusy(true);setError('');
    try{
      const form=new FormData(event.currentTarget),values={op:'register',division,modelIds,recipient:String(form.get('recipient')||'').trim(),phone:String(form.get('phone')||'').trim(),address:String(form.get('address')||'').trim(),contact:String(form.get('contact')||'').trim()};
      const body=JSON.stringify(values);
      if(submission.current.body!==body)submission.current={body,id:crypto.randomUUID()};
      const result=await request<{registration:CupRegistration}>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values,requestId:submission.current.id})});
      setStatus(current=>current?{...current,registration:result.registration}:current);
      window.scrollTo({top:0,behavior:'instant'});
    }catch(problem){setError(problem instanceof Error?problem.message:'报名未完成，请重试。');}
    finally{working.current=false;setBusy(false);}
  }

  return <div className="cup-shell cup-registration-shell">
    <header className="cup-header"><div className="cup-header-inner"><a className="brand" href="/"><WorkshopLogo className="brand-mark"/><span>星界工坊<small>ASTRAL WORKSHOP</small></span></a><nav aria-label="报名导航"><a href="/cup">← 返回星界杯</a><a href="/cup#rules">赛事规则</a></nav></div></header>
    <main className="cup-register-page">
      <header className="cup-register-heading"><p className="cup-eyebrow">CUP—01 / JOIN THE COMPETITION</p><h1>为你的第一笔，<br/>选一位同行者。</h1><p>星界杯第一届 · 矮人涂装大赛</p><ol aria-label="报名步骤"><li>01 选择模型</li><li>02 选择赛道</li><li>03 填写寄送资料</li><li>04 提交报名</li></ol></header>
      {error&&<div className="cup-register-alert" role="alert"><p>{error}</p><button type="button" className="text-button" disabled={busy} onClick={()=>void reload()}>刷新报名记录</button></div>}
      {!status&&<p role="status">正在读取登录与报名状态…</p>}
      {registration?<section className="cup-registration-receipt" aria-labelledby="cup-receipt-title"><p className="cup-eyebrow">REGISTRATION RECEIVED</p><h2 id="cup-receipt-title">报名资料已提交</h2><p>主办方已收到你的选款与寄送资料。未在线付款，请联系主办微信 <strong>示例联系渠道</strong> 确认报名费用及寄送安排。</p><dl><div><dt>参赛用户名</dt><dd>{registration.display_name}</dd></div><div><dt>赛道 / 报名费</dt><dd>{divisionNames[registration.division]} · ¥{(registration.fee_cents/100).toFixed(1)}</dd></div><div><dt>赠送棋子</dt><dd>{registration.division==='beginner'?'1 只打磨预处理矮人 · 包邮到家':'2 只未处理矮人 · 主办方寄送'}</dd></div><div><dt>收件资料</dt><dd>{registration.recipient} · {registration.phone}<br/>{registration.address}</dd></div><div><dt>联系方式</dt><dd>{registration.contact}</dd></div><div><dt>报名编号</dt><dd>{registration.id}</dd></div></dl><div className="cup-registered-models">{registration.models.map((model,index)=><figure key={index}><img src={model.image} alt={model.name} width={300} height={300}/><figcaption>{index+1}. {model.name}<small>{model.officialName}</small></figcaption></figure>)}</div><p className="cup-form-hint">组图可能展示同一模型的多个角度，赠送数量按赛道计算。资料需要修改时，请联系主办方并提供报名编号。</p><a className="button primary" href="/cup#participate">返回参赛中心 →</a></section>:<>
        {status?.fallbackAt&&<p className="cup-notice" role="status">报名服务暂不可用，仍可浏览指定模型。 <button type="button" className="text-button" onClick={()=>void reload()}>刷新报名状态</button></p>}
        {status&&!user&&!status.fallbackAt&&<aside className="cup-register-login"><h2>先登录，再提交报名</h2><p>沿用星界工坊的邮箱账号。注册并验证邮箱后，会自动回到本页，报名用户名直接使用注册时的参赛署名。</p><a className="button primary" href="/cup/login?returnTo=registration">已有账号，登录报名</a><a className="button secondary" href="/cup/login?signup=1&returnTo=registration">注册账号</a></aside>}
        {status?.event.phase!=='registration'&&status&&!status.fallbackAt&&<p className="cup-notice">当前阶段：{phaseNames[status.event.phase]}。可预览指定模型，报名表将在“报名阶段”开放。</p>}
        {user?.disabled&&<p className="cup-notice">此账号已停用，请联系主办方。</p>}
        <form onSubmit={submit} className="cup-registration-form">
          <section aria-labelledby="cup-model-choice-title">
            <div className="cup-register-section-heading"><div><p className="cup-eyebrow">01 / CHOOSE YOUR DWARF</p><h2 id="cup-model-choice-title">本届指定模型 · {models.length} 款</h2></div><a href="/assets/demo-model.svg" download>下载选款总览 ↗</a></div>
            <p className="cup-form-hint">直接点击模型卡片选款，查看原图可放大细节。老手组可选两款，也可在已选卡片上再选一枚同款。组图中的不同角度不计入赠送数量。</p>
            <p className="cup-model-selection" role="status">{divisionNames[division]} · 已选 {modelIds.length} / {modelCount} 枚 <a href="#cup-track-title">切换赛道 ↓</a></p>
            <fieldset className="cup-model-choices" disabled={busy}><legend className="sr-only">{divisionNames[division]}，请选择{modelCount}枚矮人模型</legend>{models.map((model,index)=>{
              const count=modelIds.filter(id=>id===model.id).length;
              return <article key={model.id} className={count?'selected':''}>
                <label><input type={division==='beginner'?'radio':'checkbox'} name="model" value={model.id} checked={count>0} disabled={division==='experienced'&&modelIds.length===2&&!count} onChange={()=>chooseModel(model.id)} required={division==='beginner'}/><img src={model.image} alt={`${model.name} · ${model.officialName}`} width={model.width} height={model.height} loading="lazy"/><span className="cup-model-label"><strong>{String(index+1).padStart(2,'0')} / {model.name}</strong><small>{model.officialName}</small><small>{model.source} · {model.issue}</small>{count>0&&<small className="cup-model-selected-count">已选 {count} 枚</small>}</span></label>
                <a href={model.image} target="_blank" rel="noreferrer" aria-label={`查看${model.name}原图（新窗口）`}>查看原图 ↗</a>
                {division==='experienced'&&count>0&&<button type="button" disabled={modelIds.length===2&&count===1} aria-label={`${count===2?'减少一枚':'选择两枚'}${model.name}`} onClick={()=>setModelIds(count===2?[model.id]:[model.id,model.id])}>{count===2?'同款已选 2 枚 · 减少 1 枚':'同款再选 1 枚'}</button>}
              </article>;
            })}</fieldset>
          </section>
          <section className="cup-registration-details" aria-labelledby="cup-track-title"><div><p className="cup-eyebrow">02 / YOUR DIVISION</p><h2 id="cup-track-title">选择赛道</h2><fieldset className="cup-division-choices" disabled={busy}><legend className="sr-only">参赛赛道</legend>{(['beginner','experienced'] as Division[]).map(value=><label key={value} className={division===value?'selected':''}><input type="radio" name="division" value={value} checked={division===value} onChange={()=>{setDivision(value);if(value==='beginner')setModelIds(current=>current.slice(0,1));}}/><strong>{divisionNames[value]}<span>¥{value==='beginner'?'15.9':'19.9'}</span></strong><small>{value==='beginner'?'赠送 1 只打磨预处理矮人，包邮到家。':'赠送 2 只未处理矮人，由主办方寄送。'}</small></label>)}</fieldset><p className="cup-form-hint">报名费已包含上述赠送棋子。页面不提供在线付款，提交后由主办方确认。</p></div>
          <div><p className="cup-eyebrow">03 / SHIPPING DETAILS</p><h2>寄送资料</h2><fieldset className="cup-form" disabled={!canRegister||busy}><legend className="sr-only">报名用户名与寄送信息</legend><label>参赛用户名<input value={user?.displayName||'登录后自动获取'} readOnly autoComplete="off"/></label><small className="cup-form-hint">来自注册时的参赛署名，无需重复填写。</small><label>收件人<input name="recipient" required maxLength={60} autoComplete="shipping name"/></label><label>收件电话<input name="phone" type="tel" required minLength={6} maxLength={30} autoComplete="shipping tel"/></label><label>邮寄地址<textarea name="address" required minLength={8} maxLength={300} rows={3} autoComplete="shipping street-address" placeholder="省 / 市 / 区（县）及街道门牌号，请填写完整地址"/></label><label>联系方式（微信 / QQ / 手机）<input name="contact" required maxLength={160} placeholder="便于主办方核对报名及寄送安排"/></label><p className="cup-form-hint">寄送资料仅本人和赛事管理员可查看，用于本届赛事联系与寄送。</p><label className="cup-registration-consent"><input name="consent" type="checkbox" required/>我已阅读赛事规则，确认选款、赛道及寄送资料无误。</label></fieldset></div></section>
          <footer className="cup-registration-summary"><div><strong>{selected.length?'已选：'+selected.map(model=>model.name).join(' + '):'请选择矮人模型'}</strong><p>{divisionNames[division]} · 已选 {modelIds.length} / {modelCount} 枚 · {division==='beginner'?'1 只打磨预处理矮人':'2 只未处理矮人'}</p></div><strong className="cup-registration-price">¥{division==='beginner'?'15.9':'19.9'}</strong>{status&&!user?<a className="button primary" href="/cup/login?returnTo=registration">登录后继续报名 →</a>:<button className="button primary" type="submit" disabled={!canRegister||busy||modelIds.length!==modelCount}>{busy?'正在提交报名…':status?.fallbackAt?'报名服务暂不可用':!user?'请先登录':!canRegister?'报名暂未开放':modelIds.length!==modelCount?`请先选满${modelCount}枚矮人`:'确认并提交报名 →'}</button>}</footer>
        </form>
      </>}
    </main>
  </div>;
}
