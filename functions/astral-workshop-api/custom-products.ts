import { databaseBase } from './config.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import jpeg from 'npm:jpeg-js@0.4.4';
import catalog from './catalog.json' with { type:'json' };
import staticCards from './card-packages.json' with { type:'json' };
import { request as database, type ProductKind } from './store.ts';

declare const Deno: { env:{ get(name:string):string|undefined } };
type Json = Record<string,unknown>;
export type ProductModel = {id:string;name:string;officialName:string;sourceId:string;series:string;issue:string;sourceUrl:string;image:string;category:string;prices:{supported:number;white:number;primer:number};quoteOnly?:boolean;printSize?:string;creatureType?:string;multiplier:number;note:string;evidence:string[]};
export type ProductCard = {id:string;name:string;game:string;category:string;description:string;contents:string[];price:number;unit:string;image:string;sourceLabel?:string;issue?:string};
export type ProductBundle = {id:string;name:string;kind:'adventure'|'encounter';description:string;image:string;sourceLabel?:string;issue?:string;version?:string;players?:number;purchasable?:boolean;items:{modelId:string;quantity:number;role:string;section:string;optional:boolean}[]};
export type CustomProduct = {kind:'model';product:ProductModel}|{kind:'card';product:ProductCard}|{kind:'bundle';product:ProductBundle};
export type ProductOverride = CustomProduct & {version:string};
export class ProductError extends Error { constructor(public status:number,message:string){super(message);} }
const BASE=databaseBase, BUCKET='astral-products', MAX_IMAGE=1572864;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID=/^[a-z0-9][a-z0-9_-]{0,159}$/;
const object=(value:unknown):Json=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new ProductError(400,'商品内容无效。');return value as Json;};
function text(value:unknown,max:number,required=true):string {
  if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new ProductError(400,'商品文字内容无效或过长。');
  return value.trim();
}
function cents(value:unknown):number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||!Number.isSafeInteger(Math.round(value*100))||Math.abs(value*100-Math.round(value*100))>0.000001)throw new ProductError(400,'价格须为非负金额，最多保留两位小数。');
  return Math.round(value*100);
}
function url(value:unknown):string {
  const result=text(value,2048,false);if(!result)return '';
  try{const parsed=new URL(result);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error();return parsed.href;}catch{throw new ProductError(400,'来源链接须为 HTTPS 地址或留空。');}
}
function imageBytes(value:unknown):Uint8Array {
  if(typeof value!=='string'||!value.length||value.length>MAX_IMAGE/3*4||value.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new ProductError(400,'请上传不超过1.5MiB的 JPEG 图片。');
  let bytes:Uint8Array;
  try{bytes=Uint8Array.from(atob(value),char=>char.charCodeAt(0));}catch{throw new ProductError(400,'图片内容无效。');}
  if(bytes.length>MAX_IMAGE||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new ProductError(400,'仅支持完整的 JPEG 图片。');
  try{
    const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:12,maxMemoryUsageInMB:128});
    if(decoded.width<1||decoded.height<1||decoded.width>6000||decoded.height>6000||decoded.width*decoded.height>12000000)throw new Error();
  }catch{throw new ProductError(400,'图片无法读取或像素过大，请重新选择。');}
  return bytes;
}
function storageApi(){
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!key)throw new Error('Product storage unavailable.');
  return createClient(BASE,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
}
const errorStatus=(error:unknown)=>{const value=error as {status?:unknown;statusCode?:unknown};return Number(value.status??value.statusCode);};
async function ensureBucket(){
  const api=storageApi();let result=await api.getBucket(BUCKET);
  if(result.error){
    const status=errorStatus(result.error);
    if(status!==404&&!(status===400&&result.error.message==='Bucket not found'))throw new Error('Product storage unavailable.');
    const created=await api.createBucket(BUCKET,{public:true,fileSizeLimit:MAX_IMAGE,allowedMimeTypes:['image/jpeg']});
    if(created.error&&errorStatus(created.error)!==409)throw new Error('Product storage creation failed.');
    result=await api.getBucket(BUCKET);
  }
  const bucket=result.data;
  if(result.error||!bucket||bucket.public!==true||Number(bucket.file_size_limit)!==MAX_IMAGE||!Array.isArray(bucket.allowed_mime_types)||bucket.allowed_mime_types.length!==1||bucket.allowed_mime_types[0]!=='image/jpeg')throw new Error('Product storage configuration requires review.');
}
function customRow(value:unknown):CustomProduct {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid custom product record.');
  const row=value as Json,product=row.product;
  if((row.kind!=='model'&&row.kind!=='card'&&row.kind!=='bundle')||typeof row.product_id!=='string'||!ID.test(row.product_id)||!product||typeof product!=='object'||Array.isArray(product)||(product as Json).id!==row.product_id)throw new Error('Invalid custom product record.');
  return {kind:row.kind,product} as CustomProduct;
}
async function requestRow(requestId:string):Promise<(CustomProduct&{requestHash:string})|undefined>{
  const result=await database('rpc/astral_workshop_custom_product_request',{},'POST',{p_request_id:requestId});
  if(!Array.isArray(result)||result.length>1)throw new Error('Invalid custom product response.');
  if(!result.length)return undefined;
  const row=object(result[0]);if(typeof row.request_hash!=='string')throw new Error('Invalid custom product hash.');
  return {...customRow(row),requestHash:row.request_hash};
}
export async function getProductState(){
  const value=await database('rpc/astral_workshop_catalog_state',{},'POST',{});
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid product state snapshot.');
  const snapshot=value as Json;
  if(!Array.isArray(snapshot.products)||!Array.isArray(snapshot.deleted)||!Array.isArray(snapshot.overrides))throw new Error('Invalid product state snapshot.');
  const customProducts=snapshot.products.map(customRow);
  const deleted=snapshot.deleted.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid product deletion state.');
    const row=value as Json;
    if((row.kind!=='model'&&row.kind!=='card'&&row.kind!=='bundle')||typeof row.productId!=='string'||!ID.test(row.productId))throw new Error('Invalid product deletion state.');
    return {kind:row.kind as ProductKind,productId:row.productId};
  });
  const models=[...catalog.models as ProductModel[],...customProducts.filter((row):row is Extract<CustomProduct,{kind:'model'}>=>row.kind==='model').map(row=>row.product)];
  const cards=[...staticCards as ProductCard[],...customProducts.filter((row):row is Extract<CustomProduct,{kind:'card'}>=>row.kind==='card').map(row=>row.product)];
  const bundles=[...catalog.bundles as ProductBundle[],...customProducts.filter((row):row is Extract<CustomProduct,{kind:'bundle'}>=>row.kind==='bundle').map(row=>row.product)];
  const existing=new Set([...models.map(product=>'model:'+product.id),...cards.map(product=>'card:'+product.id),...bundles.map(product=>'bundle:'+product.id)]);
  const overrides=snapshot.overrides.map(value=>{
    const product=customRow(value),version=(value as Json).version;
    if(typeof version!=='string'||!UUID.test(version))throw new Error('Invalid product override version.');
    return {...product,version} as ProductOverride;
  }).filter(row=>existing.has(row.kind+':'+row.product.id));
  const byId=new Map(overrides.map(row=>[row.kind+':'+row.product.id,row.product]));
  return {deleted,customProducts,overrides,
    models:models.map(product=>(byId.get('model:'+product.id)??product) as ProductModel).filter(model=>model.sourceId!=='epic'),
    cards:cards.map(product=>(byId.get('card:'+product.id)??product) as ProductCard),
    bundles:bundles.map(product=>(byId.get('bundle:'+product.id)??product) as ProductBundle)};
}
function buildProduct(kind:ProductKind,input:Json,id:string,image:string,models:ProductModel[]):CustomProduct {
  const name=text(input.name,120);
  if(kind==='model'){
    const sourceId=text(input.sourceId,40);if(!catalog.sources.some(source=>source.id===sourceId))throw new ProductError(400,'请选择现有模型工作室。');
    if(input.printSize!=='medium'&&input.printSize!=='large')throw new ProductError(400,'请选择中型或大型规格。');
    const supported=cents(input.supportedPrice),white=supported+(input.printSize==='large'?1000:400),primer=supported+(input.printSize==='large'?2000:700);
    if(!Number.isSafeInteger(primer))throw new ProductError(400,'商品金额无法精确计算。');
    const sourceUrl=url(input.sourceUrl);
    return {kind,product:{id,name,officialName:text(input.officialName,160),sourceId,series:text(input.series,160),issue:text(input.issue,120),sourceUrl,image,category:text(input.category??'怪物',80),creatureType:text(input.creatureType??'',80,false),printSize:input.printSize,prices:{supported:supported/100,white:white/100,primer:primer/100},multiplier:1,note:text(input.note??'',2000,false),evidence:sourceUrl?[sourceUrl]:[]}};
  }
  if(kind==='card'){
    if(!Array.isArray(input.contents)||!input.contents.length)throw new ProductError(400,'请填写卡牌套餐内容。');
    if(input.unit!=='套'&&input.unit!=='本')throw new ProductError(400,'卡牌单位须为套或本。');
    return {kind,product:{id,name,game:text(input.game,80),category:text(input.category,80),description:text(input.description,3000),contents:input.contents.map(value=>text(value,300)),price:cents(input.price)/100,unit:input.unit,image}};
  }
  if(input.kind!=='adventure'&&input.kind!=='encounter')throw new ProductError(400,'请选择模组或遭遇套餐。');
  if(!Array.isArray(input.items)||!input.items.length)throw new ProductError(400,'请添加套餐模型。');
  const modelMap=new Map(models.map(model=>[model.id,model])),aliases=(catalog as typeof catalog&{modelAliases?:Record<string,string>}).modelAliases??{};
  let count=0,amount=0;
  const items=input.items.map(value=>{
    const item=object(value),rawId=text(item.modelId,160);if(!ID.test(rawId))throw new ProductError(400,'套餐模型无效。');
    const modelId=aliases[rawId]??rawId,model=modelMap.get(modelId);
    if(!model)throw new ProductError(400,'套餐包含不存在或已下架的模型。');
    if(model.quoteOnly)throw new ProductError(400,'待确认报价的模型不能加入定价套餐。');
    if(!Number.isSafeInteger(item.quantity)||(item.quantity as number)<1)throw new ProductError(400,'模型数量须为可精确表示的正整数。');
    const quantity=item.quantity as number;
    count+=quantity;amount+=cents(model.prices.primer)*quantity;
    if(!Number.isSafeInteger(count)||!Number.isSafeInteger(amount))throw new ProductError(400,'套餐数量或金额无法精确计算。');
    if(item.optional!==undefined&&typeof item.optional!=='boolean')throw new ProductError(400,'套餐可选标记无效。');
    return {modelId,quantity,role:text(item.role??'',120,false),section:text(item.section??'棋子清单',160,false),optional:item.optional===true};
  });
  const product:ProductBundle={id,name,kind:input.kind,description:text(input.description,3000),image,items,purchasable:true};
  if(input.version!==undefined)product.version=text(input.version,160,false);
  if(input.players!==undefined){if(!Number.isSafeInteger(input.players)||(input.players as number)<1)throw new ProductError(400,'玩家人数须为正整数。');product.players=input.players as number;}
  return {kind,product};
}
const digest=async(value:Uint8Array|string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',(typeof value==='string'?new TextEncoder().encode(value):value) as BufferSource)),byte=>byte.toString(16).padStart(2,'0')).join('');
export async function createCustomProduct(body:Json,username:string){
  if((body.kind!=='model'&&body.kind!=='card'&&body.kind!=='bundle')||typeof body.requestId!=='string'||!UUID.test(body.requestId))throw new ProductError(400,'商品类型或提交标识无效。');
  const kind=body.kind,requestId=body.requestId.toLowerCase(),input=object(body.product),bytes=imageBytes(body.image);
  if(JSON.stringify(input).length>100000)throw new ProductError(400,'商品内容过长。');
  const requestHash=await digest(JSON.stringify({kind,product:input,imageHash:await digest(bytes)},(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value));
  const previous=await requestRow(requestId);
  if(previous){if(previous.requestHash!==requestHash)throw new ProductError(409,'此次提交内容已改变，请重新发起上架。');return {ok:true,kind:previous.kind,productId:previous.product.id};}
  const id='custom-'+kind+'-'+crypto.randomUUID(),imagePath=kind+'/'+id+'.jpg';
  const state=kind==='bundle'?await getProductState():null;
  const hidden=new Set(state?.deleted.filter(row=>row.kind==='model').map(row=>row.productId));
  const built=buildProduct(kind,input,id,BASE+'/storage/v1/object/public/'+BUCKET+'/'+imagePath,state?.models.filter(model=>!hidden.has(model.id))??[]);
  await ensureBucket();const bucket=storageApi().from(BUCKET);
  const uploaded=await bucket.upload(imagePath,bytes,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
  if(uploaded.error)throw new Error('Product image upload failed.');
  try{
    const rows=await database('astral_workshop_custom_products',{on_conflict:'request_id',select:'kind,product_id,product,request_hash'},'POST',{kind,product_id:id,product:built.product,request_id:requestId,request_hash:requestHash,created_by:username},'resolution=ignore-duplicates,return=representation');
    if(!Array.isArray(rows)||rows.length>1)throw new Error('Invalid custom product response.');
    const saved=rows.length?{...customRow(rows[0]),requestHash:object(rows[0]).request_hash}:await requestRow(requestId);
    if(!saved)throw new Error('Product save confirmation missing.');
    if(saved.product.id!==id)await bucket.remove([imagePath]).catch(()=>undefined);
    if(saved.requestHash!==requestHash)throw new ProductError(409,'此次提交内容已改变，请重新发起上架。');
    return {ok:true,kind:saved.kind,productId:saved.product.id};
  }catch(problem){
    // A lost insert response may still have committed; keep its image unless the database confirms otherwise.
    let safeToRemove=false;
    try{const saved=await requestRow(requestId);safeToRemove=!saved||saved.product.id!==id;}catch{safeToRemove=false;}
    if(safeToRemove)await bucket.remove([imagePath]).catch(()=>undefined);
    throw problem;
  }
}
function editedProduct(current:CustomProduct,input:Json,image:string):CustomProduct {
  const name=text(input.name,120);
  if(current.kind==='model'){
    const sourceId=text(input.sourceId,40);if(!catalog.sources.some(source=>source.id===sourceId))throw new ProductError(400,'请选择现有模型工作室。');
    const prices=object(input.prices);
    const quoteOnly=input.quoteOnly===undefined?current.product.quoteOnly===true:input.quoteOnly;
    if(typeof quoteOnly!=='boolean')throw new ProductError(400,'报价状态无效。');
    if(input.printSize!==undefined&&input.printSize!=='medium'&&input.printSize!=='large')throw new ProductError(400,'请选择中型或大型规格。');
    if(!quoteOnly && current.product.quoteOnly && (!['medium','large'].includes(String(input.printSize))||Object.values(prices).some(value=>typeof value!=='number'||value<=0)))throw new ProductError(400,'确认报价时请填写规格和大于零的三档价格。');
    return {kind:'model',product:{...current.product,quoteOnly,...(current.product.quoteOnly && !quoteOnly && input.printSize!==undefined?{printSize:text(input.printSize,20)}:{}),name,sourceId,series:text(input.series,160),issue:text(input.issue,120),sourceUrl:url(input.sourceUrl),image,prices:{supported:cents(prices.supported)/100,white:cents(prices.white)/100,primer:cents(prices.primer)/100}}};
  }
  const metadata:Pick<ProductCard,'sourceLabel'|'issue'>={};
  if(input.sourceLabel!==undefined)metadata.sourceLabel=text(input.sourceLabel,160,false);
  if(input.issue!==undefined)metadata.issue=text(input.issue,120,false);
  if(current.kind==='card')return {kind:'card',product:{...current.product,name,...metadata,price:cents(input.price)/100,image}};
  return {kind:'bundle',product:{...current.product,name,...metadata,image}};
}
export async function updateExistingProduct(body:Json,username:string){
  if((body.kind!=='model'&&body.kind!=='card'&&body.kind!=='bundle')||typeof body.productId!=='string'||!ID.test(body.productId)||typeof body.requestId!=='string'||!UUID.test(body.requestId)||typeof body.expectedVersion!=='string'||(body.expectedVersion!=='base'&&!UUID.test(body.expectedVersion)))throw new ProductError(400,'商品、版本或提交标识无效。');
  const kind=body.kind,aliases=(catalog as typeof catalog&{modelAliases?:Record<string,string>}).modelAliases??{};
  const productId=kind==='model'?aliases[body.productId]??body.productId:body.productId;
  const requestId=body.requestId.toLowerCase(),expectedVersion=body.expectedVersion.toLowerCase(),input=object(body.product);
  if(JSON.stringify(input).length>100000)throw new ProductError(400,'商品内容过长。');
  const state=await getProductState(),products=kind==='model'?state.models:kind==='card'?state.cards:state.bundles;
  const existing=products.find(product=>product.id===productId);if(!existing)throw new ProductError(404,'商品不存在。');
  const bytes=body.image===undefined?null:imageBytes(body.image);
  const imagePath=bytes?kind+'/'+productId+'-edit-'+crypto.randomUUID()+'.jpg':null;
  const image=imagePath?BASE+'/storage/v1/object/public/'+BUCKET+'/'+imagePath:existing.image;
  const updated=editedProduct({kind,product:existing} as CustomProduct,input,image);
  const requestHash=await digest(JSON.stringify({kind,productId,expectedVersion,product:input,imageHash:bytes?await digest(bytes):null},(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value));
  const bucket=bytes?storageApi().from(BUCKET):null;
  if(bytes&&imagePath&&bucket){
    await ensureBucket();
    const result=await bucket.upload(imagePath,bytes,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
    if(result.error){await bucket.remove([imagePath]).catch(()=>undefined);throw new Error('Product image upload failed.');}
  }
  let confirmedRejected=false;
  try{
    const value=await database('rpc/astral_workshop_update_product',{},'POST',{p_kind:kind,p_product_id:productId,p_expected_version:expectedVersion,p_request_id:requestId,p_request_hash:requestHash,p_product:updated.product,p_updated_by:username});
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid product update response.');
    const result=value as Json;
    if(result.ok!==true){
      if((result.status===400||result.status===409)&&typeof result.error==='string'){confirmedRejected=true;throw new ProductError(result.status,result.error);}
      throw new Error('Product update confirmation missing.');
    }
    if(typeof result.version!=='string'||!UUID.test(result.version)||typeof result.applied!=='boolean')throw new Error('Invalid product update version.');
    if(result.applied===false&&bucket&&imagePath)await bucket.remove([imagePath]).catch(()=>undefined);
    return {ok:true,kind,productId,version:result.version};
  }catch(problem){
    // Preserve an upload after an uncertain write: a committed version or order may already reference it.
    if(confirmedRejected&&bucket&&imagePath)await bucket.remove([imagePath]).catch(()=>undefined);
    throw problem;
  }
}
