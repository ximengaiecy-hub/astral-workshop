import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { loadPublicCatalog } from '../../../product-catalog';
import type { Model, Bundle, CardPackage } from '../../../catalog';
import { classifyModel, taxonomyLabel } from '../../../model-taxonomy';
import { calculateQuote } from '../../../quote';
import CatalogImage from '../../../CatalogImage';
import ShareProductButton from '../../../ShareProductButton';
import WorkshopLogo from '../../../WorkshopLogo';
import '../../../product-share.css';
import '../../../astral.css';

export const dynamic = 'force-dynamic';
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_ORIGIN || 'http://127.0.0.1:9000');
type Catalog = Awaited<ReturnType<typeof loadPublicCatalog>>['catalog'];
type PublicProduct = ({kind:'model';product:Model;catalog:Catalog}|{kind:'card';product:CardPackage;catalog:Catalog}|{kind:'bundle';product:Bundle;catalog:Catalog}) & {fallbackAt:string|null};
type Context = {params:Promise<{kind:string;id:string}>};
const money = (value:number) => '¥' + Number(value.toFixed(2)).toLocaleString('zh-CN');
const pathFor = (kind:string,id:string) => '/products/' + kind + '/' + encodeURIComponent(id);
async function findProduct(kind:string,id:string):Promise<PublicProduct|null> {
  if (!['model','card','bundle'].includes(kind) || !/^[a-z0-9][a-z0-9_-]{0,159}$/.test(id)) return null;
  const {catalog,cardPackages,fallbackAt} = await loadPublicCatalog();
  if (kind === 'model') {
    const canonical = Object.hasOwn(catalog.modelAliases,id) ? catalog.modelAliases[id] : id;
    const product = catalog.models.find(model => model.id === canonical);
    return product ? {kind:'model',product,catalog,fallbackAt} : null;
  }
  if (kind === 'card') {
    const product = cardPackages.find(card => card.id === id);
    return product ? {kind:'card',product,catalog,fallbackAt} : null;
  }
  const product = catalog.bundles.find(bundle => bundle.id === id);
  return product ? {kind:'bundle',product,catalog,fallbackAt} : null;
}
function sourceLabel(item:PublicProduct) {
  if (item.kind === 'model') return item.catalog.sources.find(source => source.id === item.product.sourceId)?.name || item.product.sourceId;
  if (item.product.sourceLabel) return item.product.sourceLabel;
  if (item.kind === 'card') return '希梦魔法屋';
  const models = new Map(item.catalog.models.map(model => [model.id,model]));
  return [...new Set(item.product.items.map(row => item.catalog.sources.find(source => source.id === models.get(row.modelId)?.sourceId)?.name).filter(Boolean))].join(' / ') || '星界工坊';
}
function description(item:PublicProduct) {
  const details = item.kind === 'model' ? item.product.series + ' · ' + item.product.issue : item.product.description;
  return [item.product.name,sourceLabel(item),details].join(' · ').replace(/\s+/g,' ').slice(0,160);
}
export async function generateMetadata({params}:Context):Promise<Metadata> {
  const {kind,id} = await params;
  try {
    const item = await findProduct(kind,id);
    if (!item) return {title:'商品不存在或已下架 · 星界工坊',robots:{index:false,follow:false}};
    const title = item.product.name + ' · 星界工坊', text = description(item), url = ORIGIN + pathFor(item.kind,item.product.id);
    const image = item.product.image ? new URL(item.product.image,ORIGIN).href : '';
    return {title,description:text,alternates:{canonical:url},openGraph:{type:'website',locale:'zh_CN',siteName:'星界工坊',title,description:text,url,images:image?[{url:image,alt:item.product.name}]:[]},twitter:{card:'summary_large_image',title,description:text,images:image?[image]:[]}};
  } catch { return {title:'商品信息暂不可用 · 星界工坊',description:'商品信息暂不可用，请稍后重试。',robots:{index:false,follow:false}}; }
}
function Header() {
  return <header className="product-page-header"><a href="/" className="product-page-brand"><WorkshopLogo className="product-page-logo" /><span>星界工坊<em>Astral Workshop</em></span></a><a className="product-page-back" href="/">返回工坊 ↗</a></header>;
}
function Unavailable() {
  return <main className="product-page astral"><Header /><section className="product-page-unavailable" role="status"><h1>商品信息暂不可用</h1><p>请稍后刷新重试。你选择的商品链接仍然保留。</p><a className="button secondary" href="/">返回星界工坊</a></section></main>;
}
function prices(item:PublicProduct) {
  if ((item.kind === 'model' && item.product.quoteOnly) || item.kind === 'card' || (item.kind === 'bundle' && item.product.purchasable === false)) return [];
  const rows = item.kind === 'model' ? [{modelId:item.product.id,quantity:1}] : item.product.items;
  return ([['supported','带支撑'],['white','预处理白模'],['primer','黑白补土'],['painted','定制涂装']] as const).map(([tier,label]) => {
    const quote = calculateQuote(rows.map(row => ({modelId:row.modelId,quantity:row.quantity,tier})),item.catalog.models,item.catalog.sources,[],item.catalog.modelAliases);
    return {label,min:quote.totalMin,max:quote.totalMax};
  });
}
export default async function ProductPage({params}:Context) {
  const {kind,id} = await params;
  let item:PublicProduct|null;
  try { item = await findProduct(kind,id); }
  catch { return <Unavailable />; }
  if (!item) notFound();
  if (item.kind === 'model' && item.product.id !== id) permanentRedirect(pathFor('model',item.product.id));
  let tierPrices:ReturnType<typeof prices>;
  try { tierPrices = prices(item); }
  catch { return <Unavailable />; }
  const product = item.product, source = sourceLabel(item);
  const cta = '/?' + new URLSearchParams({product:item.kind,id:product.id}).toString();
  const issue = product.issue || '未标注';
  const modelMap = new Map(item.catalog.models.map(model => [model.id,model]));
  const sourceMap = new Map(item.catalog.sources.map(source => [source.id,source.name]));
  return <main className="product-page astral"><Header /><div className="product-page-layout">
    <div className="product-page-image"><CatalogImage src={product.image} alt={product.name + '完整商品预览'} loading="eager" /></div>
    <section className="product-page-copy"><p className="product-page-kicker">{item.kind === 'model' ? 'MINIATURE COLLECTION' : item.kind === 'card' ? 'THE CARD COLLECTION' : 'YOUR NEXT ADVENTURE'}</p><h1>{product.name}</h1>
      {item.fallbackAt && <p className="form-error" role="status">当前显示 {new Date(item.fallbackAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} 的商品资料，购物车和订单提交暂不可用。</p>}
      {item.kind === 'model' && <p className="product-page-original">{item.product.officialName}</p>}
      <dl className="product-page-provenance"><div><dt>商品来源</dt><dd>{source}</dd></div><div><dt>期数 / 发布期</dt><dd>{issue}</dd></div>
        {item.kind === 'model' && <><div><dt>所属系列</dt><dd>{item.product.series || '未标注'}</dd></div><div><dt>计价规格</dt><dd>{item.product.quoteOnly ? '尺寸待确认' : item.product.printSize === 'large' ? '大型棋子' : '中型棋子'}</dd></div><div><dt>模型类型</dt><dd>{item.product.modelKind || item.product.category}</dd></div><div><dt>种族 / 职业</dt><dd>{taxonomyLabel(classifyModel(item.product))}</dd></div></>}
        {item.kind === 'card' && <><div><dt>所属游戏</dt><dd>{item.product.game}</dd></div><div><dt>商品类别</dt><dd>{item.product.category}</dd></div></>}
        {item.kind === 'bundle' && <><div><dt>套餐类别</dt><dd>{item.product.kind === 'adventure' ? 'DND 模组' : '通用遭遇'}</dd></div>{item.product.version && <div><dt>版本说明</dt><dd>{item.product.version}</dd></div>}{item.product.players && <div><dt>适用玩家</dt><dd>{item.product.players} 名玩家</dd></div>}<div><dt>选款数量</dt><dd>{item.product.purchasable === false ? '按角色选择模型' : item.product.items.reduce((sum,row) => sum + row.quantity,0) + ' 枚棋子'}</dd></div></>}
      </dl>
      {item.kind === 'model' && item.product.sourceUrl && <a className="product-page-source-link" href={item.product.sourceUrl} target="_blank" rel="noopener noreferrer">查看模型原始来源 ↗</a>}
      {item.kind === 'model' ? item.product.note && <p className="product-page-description">{item.product.note}</p> : <p className="product-page-description">{item.product.description}</p>}
      {item.kind === 'card' && <><p className="product-page-price">{money(item.product.price)}<small>/ {item.product.unit}</small></p><h2>套餐内容</h2><ul className="product-page-contents">{item.product.contents.map((content,index) => <li key={index}>{content}</li>)}</ul></>}
      {item.kind === 'model' && item.product.quoteOnly && <p className="product-page-price">待确认报价</p>}
      {tierPrices.length > 0 && <><dl className="product-page-prices">{tierPrices.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{money(row.min)}{row.min !== row.max && '–' + money(row.max)}</dd></div>)}</dl><p className="product-page-note">{item.kind === 'model' ? '以上为每枚当前制作预估价。' : '整套包含清单中的可选棋子。'}涂装档位已含补土和相应涂装费用，具体制作需求由工坊与你确认。</p></>}
      {item.kind === 'bundle' && item.product.purchasable === false && <p className="product-page-note">这是角色对应选款目录，请按本次遭遇选择所需模型，各款价格见下方清单。</p>}
      <a className="button primary product-page-cta" href={cta}>{item.kind === 'model' ? item.product.quoteOnly ? '在工坊查看与咨询' : '在工坊选择档位' : item.kind === 'card' ? '在工坊打开选购预览' : '在工坊选择套餐'} ↗</a><p className="product-page-note">{item.fallbackAt ? '无需登录即可浏览和分享。' : item.kind === 'model' && item.product.quoteOnly ? '无需登录即可浏览和分享。尺寸与制作报价确认后再选购。' : '无需登录即可浏览、加入购物车和提交预估订单，无需在线付款。'}</p><ShareProductButton kind={item.kind} id={product.id} />
    </section>
  </div>
  {item.kind === 'bundle' && <section className="product-page-section"><h2>棋子清单</h2><div className="product-page-bundle-list">{item.product.items.map((row,index) => {
    const model = modelMap.get(row.modelId); if (!model) return null;
    const url = pathFor('model',model.id);
    return <article className="product-page-bundle-item" key={model.id + '-' + index}><a href={url}><img src={model.image} alt={model.name} loading="lazy" /></a><div className="product-page-bundle-info"><p className="product-page-bundle-role">{row.section || '棋子清单'} · {row.role || model.category}{row.optional && ' · 可选'}</p><h3><a href={url}>{model.name}</a></h3><p>{sourceMap.get(model.sourceId)} · {model.series} · {model.issue || '未标注'}</p><p>带支撑 {money(model.prices.supported)} / 枚</p></div><span className="product-page-bundle-count">× {row.quantity}</span></article>;
  })}</div></section>}
  </main>;
}
