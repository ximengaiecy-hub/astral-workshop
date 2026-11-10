"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import CatalogImage from '../../CatalogImage';
import { useRouter } from 'next/navigation';

export type ProductKind = 'model' | 'card' | 'bundle';
export type DeletedProduct = {kind:ProductKind;productId:string};
export type EditableProduct = {quoteOnly?:boolean;name:string;sourceId?:string;series?:string;issue?:string;sourceUrl?:string;prices?:{supported:number;white:number;primer:number};sourceLabel?:string;price?:number};
export type AdminProduct = {quoteOnly?:boolean;kind:ProductKind;id:string;name:string;image:string;source:string;detail:string;price:string;modelIds?:string[];prices?:{supported:number;white:number;primer:number};printSize?:'medium'|'large';version:string;editable:EditableProduct};
export type ProductSource = {id:string;name:string};
const names:Record<ProductKind,string> = {model:'模型',card:'卡牌与卡册',bundle:'模组与套餐'};
const keyOf = (kind:ProductKind,id:string) => kind + ':' + id;

export default function ProductManager({products,initialDeleted,sources=[]}:{products:AdminProduct[];initialDeleted:DeletedProduct[];sources?:ProductSource[]}) {
  const router = useRouter();
  const [creating,setCreating] = useState(false);
  const [editing,setEditing] = useState<AdminProduct|null>(null);
  const [deleted,setDeleted] = useState(initialDeleted);
  const [view,setView] = useState<'active'|'deleted'>('active');
  const [kind,setKind] = useState('');
  const [search,setSearch] = useState('');
  const [page,setPage]=useState(1);
  const [pageScope,setPageScope]=useState('');
  const [pending,setPending] = useState('');
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const deletedKeys = new Set(deleted.map(row => keyOf(row.kind,row.productId)));
  const modelNames = new Map(products.filter(product => product.kind === 'model').map(product => [product.id,product.name]));
  const blockedModels = (product:AdminProduct) => (product.modelIds || []).filter(id => deletedKeys.has(keyOf('model',id)));
  const isHidden = (product:AdminProduct) => deletedKeys.has(keyOf(product.kind,product.id)) || blockedModels(product).length > 0;
  const hiddenCount = products.filter(isHidden).length;
  const query = search.trim().toLocaleLowerCase();
  const visible = products.filter(product => isHidden(product) === (view === 'deleted') && (!kind || product.kind === kind) && (!query || [product.name,product.source,product.detail,product.id].join(' ').toLocaleLowerCase().includes(query)));

  const scope=[view,kind,search].join('|'),pageCount=Math.max(1,Math.ceil(visible.length/36)),currentPage=Math.min(pageCount,pageScope===scope?page:1);
  async function change(product:AdminProduct,remove:boolean) {
    if (pending) return;
    if (remove && !window.confirm(`确定从公开目录删除「${product.name}」？\n\n只隐藏商品，不改动历史订单。${product.kind === 'model' ? '\n包含该模型的套餐也会暂时隐藏。' : ''}\n可在“已删除”中恢复。`)) return;
    const key = keyOf(product.kind,product.id);
    setEditing(null); setCreating(false);
    setPending(key); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/products/${product.kind}/${encodeURIComponent(product.id)}`,{method:remove ? 'DELETE' : 'POST',cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : '操作未完成，请稍后重试。');
      if (result?.kind !== product.kind || result?.productId !== product.id || result?.deleted !== remove) throw new Error('未收到操作确认，请刷新目录核对状态。');
      setDeleted(rows => remove ? [...rows.filter(row => keyOf(row.kind,row.productId) !== key),{kind:product.kind,productId:product.id}] : rows.filter(row => keyOf(row.kind,row.productId) !== key));
      setNotice(`「${product.name}」已${remove ? '从公开目录删除，可在“已删除”中恢复' : '恢复'}。`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '连接暂时中断，请刷新目录核对状态。'); }
    finally { setPending(''); }
  }

  return <section aria-label="商品列表" aria-busy={Boolean(pending)}>
    <div className="product-admin-create-bar"><button type="button" className="product-admin-create-button" aria-expanded={creating} aria-controls="new-product-form" disabled={Boolean(pending)} onClick={() => { setEditing(null); setCreating(!creating); }}>{creating ? '收起上架表单' : '＋ 新增商品'}</button></div>
    {creating && <NewProductForm sources={sources} models={products.filter(product => product.kind === 'model' && !product.quoteOnly && !deletedKeys.has(keyOf('model',product.id)))} busy={Boolean(pending)} onBusy={busy => setPending(busy ? 'create' : '')} onCreated={(createdKind,name) => { setCreating(false); setView('active'); setKind(createdKind); setSearch(''); setError(''); setNotice(`「${name}」已上架。`); router.refresh(); }} />}
    {editing && <EditProductForm key={keyOf(editing.kind,editing.id) + ':' + editing.version} product={editing} sources={sources} busy={Boolean(pending)} onBusy={busy => setPending(busy ? 'edit:' + editing.id : '')} onClose={() => setEditing(null)} onUpdated={name => { setEditing(null); setSearch(''); setError(''); setNotice(`「${name}」已保存，价格和目录将同步更新。`); router.refresh(); }} />}
    <div className="product-admin-tabs" role="group" aria-label="商品状态"><button type="button" aria-pressed={view === 'active'} onClick={() => setView('active')}>展示中 <span>{products.length - hiddenCount}</span></button><button type="button" aria-pressed={view === 'deleted'} onClick={() => setView('deleted')}>已删除 <span>{hiddenCount}</span></button></div>
    <div className="product-admin-filters"><label><span>搜索商品</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="名称、来源或期数" /></label><label><span>商品类型</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="">全部商品</option>{Object.entries(names).map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label></div>
    {error && <p className="product-admin-error" role="alert">{error}</p>}{notice && <p className="product-admin-notice" role="status">{notice}</p>}
    <p className="product-admin-count">找到 {visible.length} 款商品{view === 'deleted' && ' · 包括因关联模型被删除而暂时隐藏的套餐'}</p>
    <div className="product-admin-list">{visible.slice((currentPage-1)*36,currentPage*36).map(product => {
      const key = keyOf(product.kind,product.id), removed = deletedKeys.has(key), blocked = blockedModels(product);
      return <article className="product-admin-item" key={key}>
        <CatalogImage src={product.image} alt={product.name} />
        <div className="product-admin-info"><span className="product-admin-kind">{names[product.kind]}</span><h2>{product.name}</h2><p>{product.source}</p><p>{product.detail}</p>{blocked.length > 0 && <p className="product-admin-blocked">关联模型已删除：{blocked.map(id => modelNames.get(id) || id).join('、')}。恢复关联模型后，套餐才可重新展示。</p>}</div>
        <strong className="product-admin-price">{product.price}</strong>
        <div className="product-admin-actions"><button type="button" className="product-admin-edit" disabled={Boolean(pending)} onClick={() => { setCreating(false); setEditing(product); setError(''); setNotice(''); }} aria-label={`编辑${product.name}`}>编辑商品</button>
        {view === 'active' ? <button type="button" className="product-admin-delete" disabled={Boolean(pending)} onClick={() => change(product,true)} aria-label={`删除${product.name}`}>{pending === key ? '正在删除…' : '删除商品'}</button> : removed ? <button type="button" className="product-admin-restore" disabled={Boolean(pending)} onClick={() => change(product,false)} aria-label={`恢复${product.name}`}>{pending === key ? '正在恢复…' : '恢复商品'}</button> : <span className="product-admin-muted">随关联模型恢复</span>}</div>
      </article>;
    })}</div>
    {pageCount>1 && <nav className="catalog-pagination" aria-label="商品管理分页"><button disabled={currentPage<=1} onClick={()=>{setPage(currentPage-1);setPageScope(scope);}}>上一页</button><span>{currentPage} / {pageCount} 页</span><button disabled={currentPage>=pageCount} onClick={()=>{setPage(currentPage+1);setPageScope(scope);}}>下一页</button></nav>}
    {!visible.length && <p className="product-admin-empty">{search || kind ? '没有符合筛选条件的商品。' : view === 'deleted' ? '还没有删除的商品。' : '当前没有展示中的商品。'}</p>}
  </section>;
}

type BundleDraftItem = {modelId:string;quantity:string;role:string;section:string;optional:boolean};
const money = (value:number) => '¥' + Number(value.toFixed(2)).toLocaleString('zh-CN');

export function NewProductForm({sources,models,busy,onBusy,onCreated}:{sources:ProductSource[];models:AdminProduct[];busy:boolean;onBusy:(busy:boolean)=>void;onCreated:(kind:ProductKind,name:string)=>void}) {
  const [draft,setDraft] = useState({kind:'model' as ProductKind,name:'',officialName:'',sourceId:sources[0]?.id || '',series:'',issue:'',sourceUrl:'',printSize:'medium' as 'medium'|'large',modelCategory:'怪物',supportedPrice:'8',note:'',game:'DND',category:'',description:'',contents:'',price:'',unit:'套',bundleKind:'encounter',version:'',players:''});
  const [image,setImage] = useState<File|null>(null);
  const [preview,setPreview] = useState('');
  const [items,setItems] = useState<BundleDraftItem[]>([]);
  const [modelSearch,setModelSearch] = useState('');
  const [selectedModel,setSelectedModel] = useState('');
  const [error,setError] = useState('');
  const requestId = useRef('');
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  },[image]);
  function edit<K extends keyof typeof draft>(field:K,value:(typeof draft)[K]) { requestId.current = ''; setDraft(previous => ({...previous,[field]:value})); }
  function editItem(index:number,change:Partial<BundleDraftItem>) { requestId.current = ''; setItems(previous => previous.map((item,i) => i === index ? {...item,...change} : item)); }
  function addModel() {
    if (!models.some(model => model.id === selectedModel)) return;
    if (items.some(item => item.modelId === selectedModel)) { setError('该模型已在清单里，可直接调整数量。'); return; }
    requestId.current = ''; setItems(previous => [...previous,{modelId:selectedModel,quantity:'1',role:'',section:'',optional:false}]); setSelectedModel(''); setError('');
  }
  const modelMap = new Map(models.map(model => [model.id,model]));
  const matchingModels = models.filter(model => [model.name,model.source,model.detail].join(' ').toLocaleLowerCase().includes(modelSearch.trim().toLocaleLowerCase()));
  const base = Number(draft.kind === 'model' ? draft.supportedPrice : draft.price);
  const validPrice = (draft.kind === 'model' ? draft.supportedPrice : draft.price) !== '' && Number.isFinite(base) && base >= 0;
  const large = draft.printSize === 'large';
  const white = base + (large ? 10 : 4), primer = base + (large ? 20 : 7);
  const bundleTotals = {supported:0,white:0,primer:0,paintedMin:0,paintedMax:0};
  const validBundle = items.length > 0 && items.every(item => {
    const model = modelMap.get(item.modelId), quantity = Number(item.quantity);
    if (!model?.prices || !Number.isSafeInteger(quantity) || quantity < 1) return false;
    for (const tier of ['supported','white','primer'] as const) bundleTotals[tier] += Math.round(model.prices[tier] * 100) * quantity;
    bundleTotals.paintedMin += (Math.round(model.prices.primer * 100) + (model.printSize === 'large' ? 4000 : 2000)) * quantity;
    bundleTotals.paintedMax += (Math.round(model.prices.primer * 100) + (model.printSize === 'large' ? 10000 : 5000)) * quantity;
    return Object.values(bundleTotals).every(Number.isSafeInteger);
  });

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setError('');
    try {
      if (!image) throw new Error('请选择一张商品图片。');
      const name = draft.name.trim();
      if (!name) throw new Error('请填写商品名称。');
      let product:Record<string,unknown>;
      if (draft.kind === 'model') {
        if (!validPrice || !Number.isSafeInteger(Math.round((primer + 100) * 100))) throw new Error('请填写可精确计算的非负价格。');
        if (draft.sourceUrl && !draft.sourceUrl.startsWith('https://')) throw new Error('来源链接请使用 https:// 开头的网址。');
        product = {name,officialName:draft.officialName.trim(),sourceId:draft.sourceId,series:draft.series.trim(),issue:draft.issue.trim() || '未标注',sourceUrl:draft.sourceUrl.trim(),printSize:draft.printSize,category:draft.modelCategory,supportedPrice:base,note:draft.note.trim()};
      } else if (draft.kind === 'card') {
        if (!validPrice || !Number.isSafeInteger(Math.round(base * 100))) throw new Error('请填写可精确计算的非负价格。');
        const contents = draft.contents.split('\n').map(line => line.trim()).filter(Boolean);
        if (!contents.length) throw new Error('请至少填写一项套餐内容。');
        product = {name,game:draft.game.trim(),category:draft.category.trim(),description:draft.description.trim(),contents,price:base,unit:draft.unit};
      } else {
        if (!validBundle) throw new Error('请至少加入一款可用模型，数量须为可精确计算的正整数，且总价可精确计算。');
        const players = draft.players === '' ? undefined : Number(draft.players);
        if (players !== undefined && (!Number.isSafeInteger(players) || players < 1)) throw new Error('玩家人数请填写正整数或留空。');
        product = {name,kind:draft.bundleKind,description:draft.description.trim(),version:draft.version.trim(),...(players === undefined ? {} : {players}),items:items.map(item => ({...item,quantity:Number(item.quantity),role:item.role.trim(),section:item.section.trim()}))};
      }
      onBusy(true);
      requestId.current ||= crypto.randomUUID();
      const form = new FormData(); form.set('kind',draft.kind); form.set('requestId',requestId.current); form.set('product',JSON.stringify(product)); form.set('image',image);
      const response = await fetch('/api/admin/products',{method:'POST',body:form,cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : '上架未完成，请稍后重试。');
      if (result?.ok !== true || result?.kind !== draft.kind || typeof result?.productId !== 'string') throw new Error('未收到上架确认，请保留内容并重试。');
      onCreated(draft.kind,name);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '连接暂时中断，请保留内容并重试。'); }
    finally { onBusy(false); }
  }

  return <form id="new-product-form" className="product-admin-new" onSubmit={submit}>
    <h2>新增商品</h2><p className="product-admin-muted">图片与信息确认后，将直接上架到公开目录。</p>
    <fieldset disabled={busy}>
      <div className="product-admin-form-grid"><label><span>商品类型</span><select value={draft.kind} onChange={event => edit('kind',event.target.value as ProductKind)}>{Object.entries(names).map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label><label><span>商品名称 *</span><input value={draft.name} onChange={event => edit('name',event.target.value)} required /></label></div>
      <div className="product-admin-upload"><label><span>商品图片 *</span><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={event => { requestId.current = ''; const file = event.target.files?.[0] || null; if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024)) { setError('请选择不超过6MB的 JPG、PNG 或 WebP 图片。'); setImage(null); event.target.value = ''; } else { setImage(file); setError(''); } }} /><small>JPG、PNG 或 WebP，单张不超过6MB，保留完整画面。</small></label>{preview && <img src={preview} alt="待上架商品图片预览" className="product-admin-upload-preview" />}</div>
      {draft.kind === 'model' && <>
        <div className="product-admin-form-grid"><label><span>原作者模型名称 *</span><input value={draft.officialName} onChange={event => edit('officialName',event.target.value)} required /></label><label><span>工作室来源 *</span><select value={draft.sourceId} onChange={event => edit('sourceId',event.target.value)} required><option value="" disabled>请选择来源</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label><span>所属系列 *</span><input value={draft.series} onChange={event => edit('series',event.target.value)} required /></label><label><span>期数 / 发布期</span><input value={draft.issue} onChange={event => edit('issue',event.target.value)} placeholder="未标注时可留空" /></label><label><span>来源链接</span><input type="url" value={draft.sourceUrl} onChange={event => edit('sourceUrl',event.target.value)} placeholder="https://" /></label><label><span>模型类别</span><select value={draft.modelCategory} onChange={event => edit('modelCategory',event.target.value)}>{['NPC','冒险者','巨龙','怪物','类人'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label><span>计价规格</span><select value={draft.printSize} onChange={event => edit('printSize',event.target.value as 'medium'|'large')}><option value="medium">中型棋子</option><option value="large">大型棋子</option></select></label><label><span>带支撑单价（元） *</span><input type="number" min="0" step="0.01" value={draft.supportedPrice} onChange={event => edit('supportedPrice',event.target.value)} required /></label></div><label><span>模型说明</span><textarea value={draft.note} onChange={event => edit('note',event.target.value)} rows={3} placeholder="姿态、底座、打印尺寸或选款说明" /></label>
      </>}
      {draft.kind === 'card' && <>
        <div className="product-admin-form-grid"><label><span>所属游戏 *</span><input value={draft.game} onChange={event => edit('game',event.target.value)} required /></label><label><span>卡牌类别 *</span><input value={draft.category} onChange={event => edit('category',event.target.value)} placeholder="法术卡、图鉴、卡册等" required /></label><label><span>售价（元） *</span><input type="number" min="0" step="0.01" value={draft.price} onChange={event => edit('price',event.target.value)} required /></label><label><span>计价单位</span><select value={draft.unit} onChange={event => edit('unit',event.target.value)}><option value="套">套</option><option value="本">本</option></select></label></div><label><span>商品介绍 *</span><textarea value={draft.description} onChange={event => edit('description',event.target.value)} rows={3} required /></label><label><span>套餐内容（每行一项） *</span><textarea value={draft.contents} onChange={event => edit('contents',event.target.value)} rows={4} required /></label>
      </>}
      {draft.kind === 'bundle' && <>
        <div className="product-admin-form-grid"><label><span>套餐类别</span><select value={draft.bundleKind} onChange={event => edit('bundleKind',event.target.value)}><option value="adventure">DND 模组</option><option value="encounter">通用遭遇</option></select></label><label><span>版本说明</span><input value={draft.version} onChange={event => edit('version',event.target.value)} /></label><label><span>玩家人数（可选）</span><input type="number" min="1" step="1" value={draft.players} onChange={event => edit('players',event.target.value)} /></label></div><label><span>套餐介绍 *</span><textarea value={draft.description} onChange={event => edit('description',event.target.value)} rows={3} required /></label>
        <div className="product-admin-model-picker"><label><span>搜索需要加入的模型</span><input type="search" value={modelSearch} onChange={event => { setModelSearch(event.target.value); setSelectedModel(''); }} placeholder="名称、工作室或期数" /></label><label><span>选择模型（{matchingModels.length} 款）</span><select size={5} value={selectedModel} onChange={event => setSelectedModel(event.target.value)}><option value="">请选择模型</option>{matchingModels.map(model => <option key={model.id} value={model.id}>{model.name} · {model.source} · {money(model.prices?.supported || 0)}</option>)}</select></label><button type="button" className="product-admin-create-button" disabled={!selectedModel} onClick={addModel}>加入套餐清单</button></div>
        <ul className="product-admin-bundle-items">{items.map((item,index) => <li key={item.modelId}><div className="product-admin-bundle-name"><img src={modelMap.get(item.modelId)?.image} alt="" width={52} height={60} /><strong>{modelMap.get(item.modelId)?.name || '模型已不可用'}</strong><button type="button" onClick={() => { requestId.current = ''; setItems(previous => previous.filter((_,i) => i !== index)); }} aria-label={`移除${modelMap.get(item.modelId)?.name || '模型'}`}>移除</button></div><div className="product-admin-form-grid"><label><span>数量 *</span><input type="number" min="1" step="1" value={item.quantity} onChange={event => editItem(index,{quantity:event.target.value})} required /></label><label><span>角色说明</span><input value={item.role} onChange={event => editItem(index,{role:event.target.value})} /></label><label><span>分区 / 章节</span><input value={item.section} onChange={event => editItem(index,{section:event.target.value})} /></label><label className="product-admin-checkbox"><input type="checkbox" checked={item.optional} onChange={event => editItem(index,{optional:event.target.checked})} /><span>可选棋子（整套仍包含）</span></label></div></li>)}</ul>
      </>}
      <div className="product-admin-price-preview" aria-live="polite"><h3>价格预览</h3>{draft.kind === 'bundle' ? validBundle ? <p>整套带支撑 {money(bundleTotals.supported / 100)} · 白模 {money(bundleTotals.white / 100)} · 补土 {money(bundleTotals.primer / 100)} · 涂装 {money(bundleTotals.paintedMin / 100)}–{money(bundleTotals.paintedMax / 100)}</p> : <p>加入模型并填写有效数量后，自动计算整套价格。</p> : validPrice ? draft.kind === 'model' ? <p>带支撑 {money(base)} · 白模 {money(white)} · 补土 {money(primer)} · 涂装 {money(primer + (large ? 40 : 20))}–{money(primer + (large ? 100 : 50))} / 枚</p> : <p>{money(base)} / {draft.unit}</p> : <p>填写价格后显示预览。</p>}</div>
      {error && <p className="product-admin-error" role="alert">{error}</p>}<button type="submit" className="product-admin-create-button">{busy ? '正在上传并上架…' : '确认上架'}</button>
    </fieldset>
  </form>;
}


export function EditProductForm({product,sources,busy,onBusy,onClose,onUpdated}:{product:AdminProduct;sources:ProductSource[];busy:boolean;onBusy:(busy:boolean)=>void;onClose:()=>void;onUpdated:(name:string)=>void}) {
  const saved = product.editable;
  const initialSource = saved.sourceLabel ?? (product.kind === 'card' ? '希梦魔法屋' : product.source);
  const [draft,setDraft] = useState({quoteOnly:saved.quoteOnly===true,printSize:product.printSize || 'medium',name:saved.name,sourceId:saved.sourceId || '',series:saved.series || '',issue:saved.issue ?? '',sourceUrl:saved.sourceUrl || '',supported:saved.prices === undefined ? '' : String(saved.prices.supported),white:saved.prices === undefined ? '' : String(saved.prices.white),primer:saved.prices === undefined ? '' : String(saved.prices.primer),sourceLabel:initialSource,price:saved.price === undefined ? '' : String(saved.price)});
  const [image,setImage] = useState<File|null>(null);
  const [preview,setPreview] = useState('');
  const [error,setError] = useState('');
  const [conflict,setConflict] = useState(false);
  const requestId = useRef('');
  const formRef = useRef<HTMLFormElement>(null), fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { formRef.current?.scrollIntoView({block:'start'}); },[]);
  useEffect(() => {
    if (!image) { setPreview(''); return; }
    const url = URL.createObjectURL(image); setPreview(url);
    return () => URL.revokeObjectURL(url);
  },[image]);
  function edit<K extends keyof typeof draft>(field:K,value:(typeof draft)[K]) { requestId.current = ''; setDraft(previous => ({...previous,[field]:value})); }
  const primer = Number(draft.primer), large = product.printSize === 'large';
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || conflict) return; setError('');
    try {
      const name = draft.name.trim(); if (!name) throw new Error('请填写商品名称。');
      let values:Record<string,unknown>;
      if (product.kind === 'model') {
        const prices = {supported:Number(draft.supported),white:Number(draft.white),primer:Number(draft.primer)};
        if (!draft.quoteOnly && ([draft.supported,draft.white,draft.primer].some(value => value === '') || Object.values(prices).some(value => !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round((value + 100) * 100))))) throw new Error('三档价格请填写可精确计算的非负金额。');
        if (!draft.sourceId || !draft.series.trim()) throw new Error('请填写工作室来源和系列。');
        if (draft.sourceUrl && !draft.sourceUrl.startsWith('https://')) throw new Error('来源链接请使用 https:// 开头的网址。');
        values = {quoteOnly:draft.quoteOnly,printSize:draft.printSize,name,sourceId:draft.sourceId,series:draft.series.trim(),issue:draft.issue.trim() || '未标注',sourceUrl:draft.sourceUrl.trim(),prices};
      } else {
        values = {name};
        if (draft.sourceLabel !== initialSource) values.sourceLabel = draft.sourceLabel.trim();
        if (draft.issue !== (saved.issue ?? '')) values.issue = draft.issue.trim();
        if (product.kind === 'card') {
          const price = Number(draft.price);
          if (draft.price === '' || !Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100))) throw new Error('请填写可精确计算的非负价格。');
          values.price = price;
        }
      }
      onBusy(true); requestId.current ||= crypto.randomUUID();
      const form = new FormData(); form.set('expectedVersion',product.version); form.set('requestId',requestId.current); form.set('product',JSON.stringify(values)); if (image) form.set('image',image);
      const response = await fetch(`/api/admin/products/${product.kind}/${encodeURIComponent(product.id)}`,{method:'PATCH',body:form,cache:'no-store'});
      const result = await response.json();
      if (response.status === 409) { setConflict(true); throw new Error('商品已被其他管理员更新，或本次请求内容冲突。请刷新目录并重新打开编辑，避免覆盖最新内容。'); }
      if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : '保存未完成，请保留内容并重试。');
      if (result?.ok !== true || result?.kind !== product.kind || result?.productId !== product.id || typeof result?.version !== 'string') throw new Error('未收到保存确认，请保留内容并重试。');
      onUpdated(name);
    } catch (problem) { setError(problem instanceof Error ? problem.message : '连接暂时中断，请保留内容并重试。'); }
    finally { onBusy(false); }
  }
  return <form id="edit-product-form" ref={formRef} className="product-admin-new product-admin-editor" onSubmit={submit}>
    <div className="product-admin-editor-heading"><div><h2>编辑商品</h2><p className="product-admin-muted">{product.name} · {names[product.kind]}</p></div><button type="button" disabled={busy} onClick={onClose}>取消编辑</button></div>
    <fieldset disabled={busy}>
      <label><span>商品名称 *</span><input value={draft.name} onChange={event => edit('name',event.target.value)} required /></label>
      <div className="product-admin-upload"><label><span>替换商品图片（可选）</span><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { requestId.current = ''; const file = event.target.files?.[0] || null; if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024)) { setError('请选择不超过6MB的 JPG、PNG 或 WebP 图片。'); setImage(null); event.target.value = ''; } else { setImage(file); setError(''); } }} /><small>不选择新图片即保留当前图片。单张不超过6MB，保留完整画面。</small>{image && <button type="button" className="product-admin-keep-image" onClick={() => { requestId.current = ''; setImage(null); if (fileRef.current) fileRef.current.value = ''; }}>保留原图</button>}</label><img src={preview || product.image} alt={preview ? '替换后的商品图片预览' : '当前商品图片'} className="product-admin-upload-preview" /></div>
      {product.kind === 'model' ? <>
        <label><span>报价状态</span><select value={draft.quoteOnly?'pending':'priced'} onChange={event=>edit('quoteOnly',event.target.value==='pending')}><option value="pending">待确认报价（仅展示）</option><option value="priced">已确认价格（可选购）</option></select></label><label><span>确认后的计价规格</span><select value={draft.printSize} onChange={event=>edit('printSize',event.target.value as 'medium'|'large')}><option value="medium">中型棋子</option><option value="large">大型棋子</option></select></label>
        <div className="product-admin-form-grid"><label><span>工作室来源 *</span><select value={draft.sourceId} onChange={event => edit('sourceId',event.target.value)} required>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label><span>所属系列 *</span><input value={draft.series} onChange={event => edit('series',event.target.value)} required /></label><label><span>期数 / 发布期</span><input value={draft.issue} onChange={event => edit('issue',event.target.value)} placeholder="未标注时可留空" /></label><label><span>来源链接</span><input type="url" value={draft.sourceUrl} onChange={event => edit('sourceUrl',event.target.value)} placeholder="https://" /></label></div>
        <div className="product-admin-form-grid"><label><span>带支撑单价（元） *</span><input type="number" min="0" step="0.01" value={draft.supported} onChange={event => edit('supported',event.target.value)} required /></label><label><span>白模单价（元） *</span><input type="number" min="0" step="0.01" value={draft.white} onChange={event => edit('white',event.target.value)} required /></label><label><span>补土单价（元） *</span><input type="number" min="0" step="0.01" value={draft.primer} onChange={event => edit('primer',event.target.value)} required /></label></div><p className="product-admin-muted">三档价格独立保存；修改带支撑价时，白模与补土价格保持当前值。</p>
        <div className="product-admin-price-preview" aria-live="polite"><h3>涂装预估</h3>{!draft.quoteOnly && draft.primer !== '' && Number.isFinite(primer) && primer >= 0 ? <p>{money(primer + (large ? 40 : 20))}–{money(primer + (large ? 100 : 50))} / 枚 · 按当前{large ? '大型' : '中型'}规格计算</p> : <p>填写补土价格后显示预估。</p>}</div>
      </> : <><div className="product-admin-form-grid"><label><span>商品来源</span><input value={draft.sourceLabel} onChange={event => edit('sourceLabel',event.target.value)} /></label><label><span>期数 / 版本说明</span><input value={draft.issue} onChange={event => edit('issue',event.target.value)} /></label>{product.kind === 'card' && <label><span>售价（元） *</span><input type="number" min="0" step="0.01" value={draft.price} onChange={event => edit('price',event.target.value)} required /></label>}</div>{product.kind === 'bundle' && <div className="product-admin-price-preview"><h3>套餐价格</h3><p>{product.price}</p><p>价格由清单内模型的单价与数量自动汇总。调整价格请到对应模型编辑单价。</p></div>}</>}
      {error && <p className="product-admin-error" role="alert">{error}</p>}{conflict && <p className="product-admin-conflict"><a href="/admin/products">刷新目录后重新编辑</a> · 当前填写内容尚未保存。</p>}
      <button type="submit" className="product-admin-create-button" disabled={conflict}>{busy ? '正在保存…' : '保存修改'}</button>
    </fieldset>
  </form>;
}
