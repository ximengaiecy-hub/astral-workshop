'use client';

import { useState } from 'react';
import models from '../../cup/registration-models.json';
import { divisionNames, type CupRegistration, type Division } from '../../cup/types';

export default function RegistrationEditor({ registration, busy, onSave }: { registration: CupRegistration; busy: boolean; onSave: (body: Record<string, unknown>, message: string) => Promise<boolean | undefined> }) {
  const [editing, setEditing] = useState(false);
  const [original, setOriginal] = useState(registration);
  const [division, setDivision] = useState<Division>(registration.division);
  const [modelIds, setModelIds] = useState(registration.models.map(model => model.id));
  const count = division === 'beginner' ? 1 : 2;
  const complete = modelIds.length === count && modelIds.every(id => models.some(model => model.id === id));
  const changed = division !== original.division || JSON.stringify(modelIds) !== JSON.stringify(original.models.map(model => model.id));
  if (!editing) return <button className="button secondary" type="button" disabled={busy} onClick={() => { setOriginal(registration); setDivision(registration.division); setModelIds(registration.models.map(model => model.id)); setEditing(true); }}>修改组别和模型</button>;
  return <form className="cup-registration-editor" onSubmit={async event => {
    event.preventDefault();
    if (!complete || !changed || busy) return;
    if (!window.confirm(`保存「${original.display_name}」的报名修改？\n${divisionNames[division]}：${modelIds.map(id => models.find(model => model.id === id)!.name).join(' + ')}\n地址、联系方式和原报名费保持不变。`)) return;
    if (await onSave({ op: 'adminUpdateRegistration', registrationId: original.id, division, modelIds, expectedDivision: original.division, expectedModelIds: original.models.map(model => model.id) }, '组别和模型已保存，关联订单已同步。')) setEditing(false);
  }}>
    <h3>修改组别和模型</h3>
    <p className="cup-admin-muted">新手组选择 1 枚打磨预处理模型，老手组选择 2 枚未处理模型，可选同款。收件资料、联系方式、报名时间和原报名费保持不变。</p>
    <label>参赛组别<select aria-label="参赛组别" value={division} disabled={busy} onChange={event => { const value = event.target.value as Division; setDivision(value); setModelIds(current => value === 'beginner' ? current.slice(0, 1) : [current[0] || '', current[1] || '']); }}><option value="beginner">新手组 · 1 枚打磨预处理</option><option value="experienced">老手组 · 2 枚未处理</option></select></label>
    <div className="cup-registration-editor-models">{Array.from({ length: count }, (_, index) => {
      const selected = models.find(model => model.id === modelIds[index]);
      return <div key={index}><label>模型 {index + 1}<select aria-label={`模型 ${index + 1}`} value={modelIds[index] || ''} required disabled={busy} onChange={event => setModelIds(current => Array.from({ length: count }, (_, slot) => slot === index ? event.target.value : current[slot] || ''))}><option value="">请选择模型</option>{models.map((model, modelIndex) => <option key={model.id} value={model.id}>{String(modelIndex + 1).padStart(2, '0')} / {model.name} · {model.source}</option>)}</select></label>{selected && <img src={selected.image} alt={selected.name} width={160} height={160} />}</div>;
    })}</div>
    <div className="cup-admin-inline"><button className="button primary" type="submit" disabled={busy || !complete || !changed}>{busy ? '正在保存…' : '保存组别和模型'}</button><button className="button secondary" type="button" disabled={busy} onClick={() => setEditing(false)}>取消修改</button></div>
  </form>;
}
