import Workshop from './Workshop';
import { catalog } from './catalog';
import { isAdmin } from './admin-auth';
import { loadPublicCatalog } from './product-catalog';
import { classifyModel } from './model-taxonomy';
export const dynamic = 'force-dynamic';
type PublicCatalog = Awaited<ReturnType<typeof loadPublicCatalog>>['catalog'];
const partyStatsByCatalog=new WeakMap<PublicCatalog,Record<string,{count:number;races:[string,number][];classCount:number}>>();
function getPartyStats(current:PublicCatalog) {
  const cached=partyStatsByCatalog.get(current);
  if(cached)return cached;
  const taxonomy=current.models.map(classifyModel);
  const stats=Object.fromEntries(['monster','adventurer'].map(party=>{
    const members=taxonomy.filter(item=>item.party===party),races=new Map<string,number>();
    for(const item of members)races.set(item.race,(races.get(item.race)||0)+1);
    return [party,{count:members.length,races:[...races].sort((a,b)=>b[1]-a[1]),classCount:new Set(members.map(item=>item.charClass).filter(value=>value&&value!=='平民与其他')).size}];
  }));
  partyStatsByCatalog.set(current,stats);
  return stats;
}
export default async function Home(props:{searchParams?:Promise<Record<string,string|string[]|undefined>>}) {
  let current:Awaited<ReturnType<typeof loadPublicCatalog>>;
  try { current=await loadPublicCatalog(); }
  catch { return <Workshop catalog={{...catalog,models:[],bundles:[]}} cardPackages={[]} isAdmin={false} catalogError="商品目录暂不可用，请稍后刷新。" />; }
  const params=await props?.searchParams, kind=params?.product, rawId=params?.id;
  const id=typeof rawId==='string' && kind==='model' && Object.hasOwn(catalog.modelAliases,rawId) ? catalog.modelAliases[rawId] : rawId;
  const initialProduct=typeof id==='string' && (kind==='model' ? current.catalog.models : kind==='card' ? current.cardPackages : kind==='bundle' ? current.catalog.bundles : []).some(product=>product.id===id) ? {kind:kind as 'model'|'card'|'bundle',id} : undefined;
  const initialSearch=typeof params?.search==='string' ? params.search.trim().slice(0,100) : '';
  const initialModels=current.catalog.models.filter(model=>!model.quoteOnly || model.id===initialProduct?.id);
  const partyStats=getPartyStats(current.catalog);
  return <Workshop {...current} catalog={{...current.catalog,models:initialModels}} modelCount={current.catalog.models.length} partyStats={partyStats} initialProduct={initialProduct} initialSearch={initialSearch} isAdmin={!current.fallbackAt && await isAdmin().catch(()=>false)} />;
}
