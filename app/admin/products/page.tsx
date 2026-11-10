import { redirect } from 'next/navigation';
import { getAdminUser, adminSessionToken } from '../../admin-auth';
import { invokeBackend } from '../../backend';
import { resolveProductCatalog } from '../../product-catalog';
import ProductManager, { type AdminProduct } from './ProductManager';
import './products.css';

export const dynamic = 'force-dynamic';
const money = (value:number) => '¥' + value.toLocaleString('zh-CN');

export default async function ProductsPage() {
  if (!await getAdminUser()) redirect('/admin/login');
  let resolved = resolveProductCatalog({deleted:[]}), error = '';
  try { resolved = resolveProductCatalog(await invokeBackend('catalogState',{includeDeleted:true,sessionToken:await adminSessionToken()})); }
  catch { error = '商品状态暂时无法读取，请刷新页面重试。'; }
  const {catalog,cardPackages,deleted,versions} = resolved;
  const sources = new Map(catalog.sources.map(source => [source.id,source.name]));
  const models = new Map(catalog.models.map(model => [model.id,model]));
  const products:AdminProduct[] = [
    ...catalog.models.map(model => ({kind:'model' as const,id:model.id,name:model.name,image:model.image,source:sources.get(model.sourceId) || model.sourceId,detail:[model.series,model.issue].filter(Boolean).join(' · '),quoteOnly:model.quoteOnly,price:model.quoteOnly ? '待确认报价' : money(model.prices.supported) + ' / 枚 · 带支撑',prices:model.prices,printSize:model.printSize === 'large' ? 'large' as const : 'medium' as const,version:versions['model:'+model.id] || 'base',editable:{quoteOnly:model.quoteOnly,name:model.name,sourceId:model.sourceId,series:model.series,issue:model.issue,sourceUrl:model.sourceUrl,prices:model.prices}})),
    ...cardPackages.map(card => ({kind:'card' as const,id:card.id,name:card.name,image:card.image,source:card.sourceLabel ?? '希梦魔法屋',detail:[card.game,card.category,card.issue].filter(Boolean).join(' · '),price:money(card.price) + ' / ' + card.unit,version:versions['card:'+card.id] || 'base',editable:{name:card.name,sourceLabel:card.sourceLabel,issue:card.issue,price:card.price}})),
    ...catalog.bundles.map(bundle => ({kind:'bundle' as const,id:bundle.id,name:bundle.name,image:bundle.image,source:bundle.sourceLabel ?? [...new Set(bundle.items.map(item => sources.get(models.get(item.modelId)?.sourceId || '')).filter(Boolean))].join(' / '),detail:[bundle.issue,bundle.description].filter(Boolean).join(' · '),price:bundle.purchasable === false ? '按单款选购' : money(bundle.items.reduce((sum,item) => sum + (models.get(item.modelId)?.prices.supported || 0) * item.quantity,0)) + ' / 套 · 带支撑',modelIds:bundle.items.map(item => item.modelId),version:versions['bundle:'+bundle.id] || 'base',editable:{name:bundle.name,sourceLabel:bundle.sourceLabel,issue:bundle.issue}})),
  ];
  return <main className="product-admin">
    <nav className="product-admin-top" aria-label="后台导航"><a href="/admin">← 订单管理</a><a href="/">星界工坊</a><a href="/admin/cup">星界杯管理</a><form action="/api/admin/logout" method="post"><button className="text-button" type="submit">退出登录</button></form></nav>
    <header className="product-admin-header"><div><p className="product-admin-eyebrow">ASTRAL WORKSHOP</p><h1>商品管理</h1><p>上架、编辑或隐藏商品，历史订单保持原样。</p></div><a href="/admin/products">刷新目录</a></header>
    {error ? <p className="product-admin-error" role="alert">{error}</p> : <ProductManager products={products} initialDeleted={deleted} sources={catalog.sources.map(source => ({id:source.id,name:source.name}))} />}
  </main>;
}
