import { databaseBase } from './config.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import jpeg from 'npm:jpeg-js@0.4.4';
import { request as database, recordAdminAttempt } from './store.ts';
import registrationModels from './registration-models.json' with { type:'json' };

declare const Deno: { env:{ get(name:string):string|undefined } };
type Json = Record<string,unknown>;
type AdminCheck = (token:unknown)=>Promise<{username:string}|null>;
type Member = { id:string; email:string; display_name:string; disabled:boolean };
class CupError extends Error { constructor(public status:number,message:string){super(message);} }
const BASE=databaseBase;
const AUTH=databaseBase+'/auth/v1';
const BUCKET='astral-cup';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIVISIONS=['beginner','experienced'];
const PHASES=['upcoming','registration','painting','submission','voting','ended'];
const REGISTRATION_FIELDS='id,order_id,member_id,display_name,email,division,models,recipient,phone,address,contact,fee_cents,created_at';
const encoder=new TextEncoder();
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const text=(value:unknown,max:number,required=true)=>{
  if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))throw new CupError(400,'填写内容无效或过长。');
  return value.trim();
};
const id=(value:unknown)=>{if(typeof value!=='string'||!UUID.test(value))throw new CupError(400,'内容标识无效。');return value.toLowerCase();};
function object(value:unknown):Json {if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid response.');return value as Json;}
async function rpc(name:string,input:Json={}):Promise<Json>{
  const value=object(await database('rpc/astral_cup_'+name,{},'POST',input));
  if(typeof value.error==='string')throw new CupError(typeof value.status==='number'?value.status:400,value.error);
  return value;
}
function storageApi(){
  const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!key)throw new Error('Storage unavailable.');
  return createClient(BASE,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage;
}
const storage=()=>storageApi().from(BUCKET);
async function ensureBucket(){
  const api=storageApi();
  let result=await api.getBucket(BUCKET);
  if(result.error){
    const status=Number((result.error as unknown as {status?:unknown;statusCode?:unknown}).status??(result.error as unknown as {statusCode?:unknown}).statusCode);
    if(status!==404&&!(status===400&&result.error.message==='Bucket not found'))throw new Error('Cup storage unavailable.');
    const created=await api.createBucket(BUCKET,{public:false,fileSizeLimit:1500000,allowedMimeTypes:['image/jpeg']});
    if(created.error){
      const code=Number((created.error as unknown as {status?:unknown;statusCode?:unknown}).status??(created.error as unknown as {statusCode?:unknown}).statusCode);
      if(code!==409)throw new Error('Cup storage creation failed.');
    }
    result=await api.getBucket(BUCKET);
  }
  const bucket=result.data;
  if(result.error||!bucket||bucket.public!==false||Number(bucket.file_size_limit)!==1500000||!Array.isArray(bucket.allowed_mime_types)||bucket.allowed_mime_types.length!==1||bucket.allowed_mime_types[0]!=='image/jpeg')throw new Error('Cup storage configuration requires review.');
}
async function authSettings():Promise<boolean>{
  const key=Deno.env.get('SUPABASE_ANON_KEY');
  if(!key)throw new Error('Authentication unavailable.');
  const response=await fetch(AUTH+'/settings',{headers:{apikey:key},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Authentication settings unavailable.');
  return object(await response.json()).mailer_autoconfirm===false;
}
function claims(token:string):Json {
  try{
    const part=token.split('.')[1];
    if(!part)throw new Error();
    const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
    return object(JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='))));
  }catch{throw new CupError(401,'登录凭证无效，请重新登录。');}
}
async function memberUser(value:unknown):Promise<Member|null>{
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||value.length>16384||value.split('.').length!==3)throw new CupError(401,'登录凭证无效，请重新登录。');
  const key=Deno.env.get('SUPABASE_ANON_KEY');
  if(!key)throw new Error('Authentication unavailable.');
  const response=await fetch(AUTH+'/user',{headers:{apikey:key,Authorization:'Bearer '+value},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});
  if(response.status===401||response.status===403)throw new CupError(401,'登录已过期，请重新登录。');
  if(!response.ok)throw new CupError(503,'登录验证服务暂不可用，请稍后重试。');
  const user=object(await response.json());
  if(typeof user.id!=='string'||!UUID.test(user.id)||typeof user.email!=='string'||!user.email.trim()||!user.email_confirmed_at||user.is_anonymous===true)throw new CupError(403,'请先完成邮箱验证。');
  const token=claims(value);
  if(token.sub!==user.id)throw new CupError(401,'登录凭证无效，请重新登录。');
  const existing=await database('astral_cup_members',{id:'eq.'+user.id,select:'id',limit:'1'});
  if(!Array.isArray(existing))throw new Error('Invalid account response.');
  if(!existing.length){
    if(!await authSettings())throw new CupError(503,'邮箱验证暂未启用，请联系管理员。');
    const events=await database('astral_cup_events',{id:'eq.astral-cup-1',select:'created_at',limit:'1'});
    if(!Array.isArray(events)||!events.length)throw new Error('Event unavailable.');
    const createdAt=Date.parse(String(object(events[0]).created_at));
    const now=Date.now(),methods=['otp','email/signup','email_change','recovery'];
    const recent=Array.isArray(token.amr)&&token.amr.some(item=>{
      if(!item||typeof item!=='object')return false;
      const amr=item as Json,time=Number(amr.timestamp)*1000;
      return methods.includes(String(amr.method))&&Number.isFinite(time)&&time>=createdAt&&time>=now-15*60*1000&&time<=now+30000;
    });
    if(!recent)throw new CupError(403,'首次参与请重新验证邮箱，验证链接15分钟内有效。');
  }
  const metadata=user.user_metadata&&typeof user.user_metadata==='object'?user.user_metadata as Json:{};
  const name=typeof metadata.display_name==='string'&&metadata.display_name.trim()?metadata.display_name.trim():user.email.split('@')[0];
  const result=await rpc('register_member',{p_id:user.id,p_email:user.email,p_display_name:name.slice(0,60)||'参赛者'});
  if(typeof result.id!=='string'||typeof result.email!=='string'||typeof result.display_name!=='string'||typeof result.disabled!=='boolean')throw new Error('Invalid member response.');
  return result as Member;
}
async function activeMember(value:unknown){
  const member=await memberUser(value);
  if(!member)throw new CupError(401,'请先验证邮箱并登录。');
  if(member.disabled)throw new CupError(403,'此账号已停用，请联系管理员。');
  return member;
}
async function signImages(data:Json):Promise<Json>{
  const entries=[...(Array.isArray(data.entries)?data.entries:[]),...(Array.isArray(data.myEntries)?data.myEntries:[])].map(object);
  const paths=[...new Set(entries.flatMap(entry=>Array.isArray(entry.images)?entry.images.filter((path):path is string=>typeof path==='string'):[]))];
  if(!paths.length)return data;
  if(paths.some(path=>!/^astral-cup-1\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(path)))throw new Error('Invalid image path.');
  const {data:signed,error}=await storage().createSignedUrls(paths,1800);
  if(error||!signed)throw new Error('Image links unavailable.');
  const urls=new Map(signed.map(item=>[item.path,item.signedUrl]));
  for(const entry of entries)entry.images=(entry.images as string[]).map(path=>{
    const url=urls.get(path);if(!url)throw new Error('Image link unavailable.');return url;
  });
  return data;
}
function imageBytes(value:unknown):Uint8Array{
  if(typeof value!=='string'||value.length>2000000||!value.length||value.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new CupError(400,'照片内容无效，请重新选择 JPG 图片。');
  let bytes:Uint8Array;
  try{bytes=Uint8Array.from(atob(value),char=>char.charCodeAt(0));}catch{throw new CupError(400,'照片内容无效。');}
  if(bytes.length>1500000||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new CupError(400,'仅接受单张不超过1.5MB的 JPG 照片。');
  try{
    const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:5,maxMemoryUsageInMB:64});
    if(decoded.width<1||decoded.height<1||decoded.width>2048||decoded.height>2048||decoded.width*decoded.height>5000000)throw new Error();
  }catch{throw new CupError(400,'照片无法读取或尺寸超过2048像素，请重新选择。');}
  return bytes;
}
async function submitEntry(body:Json,member:Member):Promise<Response>{
  const title=text(body.title,80),description=text(body.description,1000,false),division=text(body.division,20);
  if(!DIVISIONS.includes(division)||!Array.isArray(body.images)||body.images.length<1||body.images.length>4)throw new CupError(400,'请选择组别并上传1至4张照片。');
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode('cup-upload:'+member.id));
  const attemptKey=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const now=Date.now();
  const attempts=await recordAdminAttempt(attemptKey,now,now-15*60*1000);
  if(attempts>20)throw new CupError(429,'投稿次数较多，请15分钟后再试。');
  const events=await database('astral_cup_events',{id:'eq.astral-cup-1',select:'phase',limit:'1'});
  if(!Array.isArray(events)||!events.length)throw new Error('Event unavailable.');
  if(object(events[0]).phase!=='submission')throw new CupError(409,'当前阶段暂不接受投稿。');
  await ensureBucket();
  const entryId=crypto.randomUUID(),bucket=storage(),paths:string[]=[];
  let finalizing=false;
  try{
    for(const value of body.images){
      const bytes=imageBytes(value),path='astral-cup-1/'+member.id+'/'+crypto.randomUUID()+'.jpg';
      paths.push(path);
      const {error}=await bucket.upload(path,bytes,{contentType:'image/jpeg',cacheControl:'1800',upsert:false});
      if(error)throw new Error('Upload failed.');
    }
    finalizing=true;
    const result=await rpc('submit_entry',{p_id:entryId,p_member_id:member.id,p_title:title,p_description:description,p_division:division,p_images:paths});
    return reply(result,201);
  }catch(problem){
    let safeToRemove=!finalizing||problem instanceof CupError;
    if(finalizing&&!(problem instanceof CupError)){
      // A lost response may still have committed; never remove a live entry's images.
      try{
        const rows=await database('astral_cup_entries',{id:'eq.'+entryId,author_id:'eq.'+member.id,select:'id',limit:'1'});
        if(Array.isArray(rows)&&rows.length)return reply({ok:true,id:entryId},201);
        safeToRemove=Array.isArray(rows)&&rows.length===0;
      }catch{safeToRemove=false;}
    }
    if(safeToRemove&&paths.length)await bucket.remove(paths).catch(()=>undefined);
    throw problem;
  }
}

export async function handleCup(body:Json,request:Request,adminUser:AdminCheck):Promise<Response>{
  try{
    if(request.method!=='POST')throw new CupError(405,'请求方式无效。');
    const op=text(body.op,40);
    if(op.startsWith('admin')){
      const admin=await adminUser(body.sessionToken);
      if(!admin)throw new CupError(401,'请先登录管理员账号。');
      if(op==='adminOverview')return reply({...await signImages(await rpc('admin_overview')),registrations:await database('astral_cup_registrations',{event_id:'eq.astral-cup-1',select:REGISTRATION_FIELDS,order:'created_at.desc'})});
      if(op==='adminUpdateRegistration'){
        const registrationId=id(body.registrationId),division=text(body.division,20),expectedDivision=text(body.expectedDivision,20);
        if(!DIVISIONS.includes(division)||!DIVISIONS.includes(expectedDivision)||!Array.isArray(body.modelIds)||body.modelIds.length!==(division==='beginner'?1:2)||!Array.isArray(body.expectedModelIds)||body.expectedModelIds.length!==(expectedDivision==='beginner'?1:2))throw new CupError(400,'请选择组别及对应数量的模型。');
        const models=body.modelIds.map(modelId=>{const model=registrationModels.find(m=>m.id===modelId);if(!model)throw new CupError(400,'请选择本届指定的矮人模型。');return model;});
        if(body.expectedModelIds.some(modelId=>!registrationModels.some(model=>model.id===modelId)))throw new CupError(400,'原选款无效，请刷新报名记录。');
        return reply(await rpc('admin_update_registration',{p_actor:admin.username,p_id:registrationId,p_division:division,p_models:models,p_expected:{division:expectedDivision,modelIds:body.expectedModelIds}}));
      }
      const payload:Json={};
      switch(op){
        case 'adminSetPhase':
          payload.phase=text(body.phase,20);if(!PHASES.includes(payload.phase as string))throw new CupError(400,'活动阶段无效。');break;
        case 'adminReviewEntry':
          payload.entryId=id(body.entryId);payload.status=text(body.status,20);payload.reviewNote=text(body.reviewNote??'',1000,false);
          if(!['approved','rejected','hidden'].includes(payload.status as string))throw new CupError(400,'审核状态无效。');break;
        case 'adminDeleteEntry':
          payload.entryId=id(body.entryId);payload.confirmation=body.confirmation;
          if(payload.confirmation!=='删除投稿')throw new CupError(400,'请确认删除投稿。');break;
        case 'adminSetMember':
          payload.memberId=id(body.memberId);if(typeof body.disabled!=='boolean')throw new CupError(400,'账号状态无效。');payload.disabled=body.disabled;break;
        case 'adminRevokeVote':payload.voteId=id(body.voteId);break;
        case 'adminClearVotes':
          payload.division=text(body.division,20);payload.confirmation=body.confirmation;
          if(![...DIVISIONS,'all'].includes(payload.division as string)||payload.confirmation!=='清空票数')throw new CupError(400,'清票范围或确认文字无效。');break;
        default:throw new CupError(400,'管理操作无效。');
      }
      return reply(await rpc('admin_action',{p_actor:admin.username,p_op:op,p_payload:payload}));
    }
    if(op==='status'){
      const member=await memberUser(body.userToken);
      const division=body.division===undefined||body.division===null?null:text(body.division,20);
      const page=body.page===undefined?1:body.page;
      if(division!==null&&!DIVISIONS.includes(division)||!Number.isSafeInteger(page)||Number(page)<1||Number(page)>10000)throw new CupError(400,'展示参数无效。');
      const data=await rpc('status',{p_member_id:member?.id??null,p_division:division,p_page:page});
      const registrations=member?await database('astral_cup_registrations',{event_id:'eq.astral-cup-1',member_id:'eq.'+member.id,select:REGISTRATION_FIELDS,limit:'1'}):[];
      if(!Array.isArray(registrations))throw new Error('Registration unavailable.');
      data.registration=registrations[0]??null;
      return reply(await signImages(data));
    }
    const member=await activeMember(body.userToken);
    if(op==='register'){
      const division=text(body.division,20),requestId=id(body.requestId),recipient=text(body.recipient,60),phone=text(body.phone,30),address=text(body.address,300),contact=text(body.contact,160);
      if(!DIVISIONS.includes(division)||!Array.isArray(body.modelIds)||body.modelIds.length!==(division==='beginner'?1:2))throw new CupError(400,'请选择赛道及对应数量的模型。');
      if(!/^[+\d][\d ()-]{5,29}$/.test(phone)||address.length<8)throw new CupError(400,'请填写有效收件电话及完整邮寄地址（至少8个字符）。');
      const models=body.modelIds.map(modelId=>{const model=registrationModels.find(m=>m.id===modelId);if(!model)throw new CupError(400,'请选择本届指定的矮人模型。');return model;});
      const normalized={division,models,recipient,phone,address,contact};
      const payloadHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(normalized)))),byte=>byte.toString(16).padStart(2,'0')).join('');
      return reply(await rpc('enroll',{p_id:crypto.randomUUID(),p_member_id:member.id,p_request_id:requestId,p_payload_hash:payloadHash,p_division:division,p_models:models,p_recipient:recipient,p_phone:phone,p_address:address,p_contact:contact}),201);
    }
    if(op==='submitEntry')return await submitEntry(body,member);
    if(op==='vote')return reply(await rpc('vote',{p_member_id:member.id,p_entry_id:id(body.entryId)}));
    throw new CupError(400,'活动操作无效。');
  }catch(problem){
    return problem instanceof CupError?reply({error:problem.message},problem.status):reply({error:'活动服务暂不可用，请稍后重试。'},503);
  }
}
