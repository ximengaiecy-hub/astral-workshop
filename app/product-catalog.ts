import 'server-only';
import { cache } from 'react';
import { catalog, type Model, type Bundle, type CardPackage } from './catalog';
import cards from '../card-packages.json';
import { invokeBackend } from './backend';
import snapshot from './public-fallback.json';
import { cacheRead } from './short-read-cache';

export type ProductRecord = {kind:'model';product:Model} | {kind:'card';product:CardPackage} | {kind:'bundle';product:Bundle};
type DeletedProduct = {kind:'model'|'card'|'bundle';productId:string};
const validId = (id:unknown):id is string => typeof id==='string' && /^[a-z0-9][a-z0-9_-]{0,159}$/.test(id);
function records(value:unknown):ProductRecord[] {
  if (!Array.isArray(value) || value.some(row=>!row || !['model','card','bundle'].includes(row.kind) || !row.product || !validId(row.product.id))) throw new Error('Invalid product catalog');
  return value;
}
export function resolveProductCatalog(state:Record<string,unknown>) {
  if (!Array.isArray(state.deleted) || state.deleted.some(row=>!row || !['model','card','bundle'].includes(row.kind) || !validId(row.productId))) throw new Error('Invalid product state');
  const deleted=state.deleted as DeletedProduct[], custom=records(state.customProducts ?? []), overrides=records(state.overrides ?? []);
  const versions:Record<string,string>={};
  for (const row of overrides) {
    const version=(row as ProductRecord & {version?:unknown}).version;
    if (typeof version!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(version)) throw new Error('Invalid product version');
    versions[row.kind+':'+row.product.id]=version;
  }
  const models=new Map<string,Model>(catalog.models.map(product=>[product.id,product]));
  const cardMap=new Map<string,CardPackage>(cards.map(product=>[product.id,product]));
  const bundles=new Map<string,Bundle>(catalog.bundles.map(product=>[product.id,product]));
  for (const row of custom) {
    if(row.kind==='model')models.set(row.product.id,row.product);
    else if(row.kind==='card')cardMap.set(row.product.id,row.product);
    else bundles.set(row.product.id,row.product);
  }
  for (const row of overrides) {
    if(row.kind==='model' && models.has(row.product.id))models.set(row.product.id,row.product);
    else if(row.kind==='card' && cardMap.has(row.product.id))cardMap.set(row.product.id,row.product);
    else if(row.kind==='bundle' && bundles.has(row.product.id))bundles.set(row.product.id,row.product);
  }
  return {catalog:{...catalog,models:[...models.values()].filter(model=>model.sourceId!=='epic'),bundles:[...bundles.values()]},cardPackages:[...cardMap.values()],deleted,versions};
}

function visibleCatalog(state:Record<string,unknown>) {
  const resolved=resolveProductCatalog(state);
  const hidden=new Set(resolved.deleted.map(row=>row.kind+':'+row.productId));
  const models=resolved.catalog.models.filter(model=>!hidden.has('model:'+model.id)), available=new Set(models.map(model=>model.id));
  const bundles=resolved.catalog.bundles.filter(bundle=>!hidden.has('bundle:'+bundle.id)&&bundle.items.every(item=>available.has(item.modelId)));
  return {catalog:{...resolved.catalog,models,bundles},cardPackages:resolved.cardPackages.filter(card=>!hidden.has('card:'+card.id))};
}

// ponytail: recent reads are per process; cold instances use the packaged public snapshot.
let lastCatalog:{data:ReturnType<typeof visibleCatalog>;capturedAt:string}|undefined;
let packagedCatalog:ReturnType<typeof visibleCatalog>|undefined;
const publicCatalog=cacheRead(async()=>{
  try {
    const data=visibleCatalog(await invokeBackend('catalogState',{},5000));
    lastCatalog={data,capturedAt:new Date().toISOString()};
    return {...data,fallbackAt:null};
  } catch {
    return lastCatalog
      ? {...lastCatalog.data,fallbackAt:lastCatalog.capturedAt}
      : {...(packagedCatalog??=visibleCatalog(snapshot.catalog)),fallbackAt:snapshot.capturedAt};
  }
},10000);
export const loadPublicCatalog=cache(publicCatalog.get);
export const invalidatePublicCatalog=publicCatalog.clear;
