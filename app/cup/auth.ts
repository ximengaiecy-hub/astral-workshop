import 'server-only';
import { cookies } from 'next/headers';
import { anonKey, authBase } from '../cloud-endpoint';
import { BackendError } from '../backend';
import { cacheRead } from '../short-read-cache';

const BASE=authBase;
const ACCESS='__Host-astral-cup',REFRESH='__Host-astral-cup-refresh',PENDING='__Host-astral-cup-pending';
const options={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/'};
export const cupReply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export const cupFailure=(error:unknown)=>error instanceof BackendError?cupReply({error:error.message},error.status):cupReply({error:'赛事服务暂不可用，请稍后重试。'},503);
export async function authRequest(path:string,body?:Record<string,unknown>,token?:string,method?:'PUT'){
  const result=await fetch(BASE+path,{method:method||(body?'POST':'GET'),headers:{apikey:anonKey,Authorization:'Bearer '+(token||anonKey),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  const raw=await result.text();
  let data:Record<string,unknown>;
  try{const parsed=JSON.parse(raw||'{}');if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();data=parsed;}catch{throw new BackendError(result.ok?502:result.status>=500?503:result.status,'邮箱服务返回内容异常，请稍后重试。');}
  if(result.ok&&!raw&&!['/logout?scope=local','/recover','/resend'].includes(path))throw new BackendError(502,'邮箱服务返回内容异常，请稍后重试。');
  if(!result.ok){
    const code=String(data.error_code||data.code||'');
    const message=result.status>=500?'邮件或登录服务暂不可用，请稍后重试。':result.status===429?'操作频繁，请稍后再试。':code==='user_already_exists'?'此邮箱已注册，请切换到登录；忘记参赛账号密码可使用“忘记密码”。管理员请使用“管理员登录”，无需重新注册。':code==='email_not_confirmed'?'请先验证邮箱，或使用找回密码完成验证。':path.startsWith('/token')?'邮箱或密码不正确。':path==='/verify'?'验证码无效或已过期，请重发后再试。':'邮件服务暂不可用，请稍后重试。';
    throw new BackendError(result.status>=500?503:Math.max(400,result.status),message);
  }
  return data;
}
const emailReady=cacheRead(async()=>{
  try{const settings=await authRequest('/settings');return settings.mailer_autoconfirm===false&&(settings.external as Record<string,unknown>|undefined)?.email===true;}catch{return false;}
},10000);
export const authReady=emailReady.get;
export async function setCupSession(data:Record<string,unknown>){
  if(typeof data.access_token!=='string'||typeof data.refresh_token!=='string')throw new Error('Invalid auth session');
  const store=await cookies();
  store.set(ACCESS,data.access_token,{...options,maxAge:Math.max(60,Number(data.expires_in)||3600)});
  store.set(REFRESH,data.refresh_token,{...options,maxAge:7*86400});
  store.set(PENDING,'',{...options,maxAge:0});
}
export async function clearCupSession(){const store=await cookies();for(const key of [ACCESS,REFRESH,PENDING])store.set(key,'',{...options,maxAge:0});}
export async function cupToken(){
  const store=await cookies(),token=store.get(ACCESS)?.value;
  if(token){try{const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());if(Number(payload.exp)*1000>Date.now()+30000)return token;}catch{/* A malformed cookie is never an identity. */}}
  const refresh=store.get(REFRESH)?.value;
  if(!refresh)return undefined;
  try{const data=await authRequest('/token?grant_type=refresh_token',{refresh_token:refresh});await setCupSession(data);return data.access_token as string;}catch(error){if(error instanceof BackendError&&[400,401].includes(error.status)){await clearCupSession();return undefined;}throw error;}
}
type Pending={kind:'signup'|'email'|'recovery';email:string;expires:number;sentAt:number;token?:string};
export async function setPending(value:Pending){(await cookies()).set(PENDING,Buffer.from(JSON.stringify(value)).toString('base64url'),{...options,maxAge:300});}
export async function getPending():Promise<Pending|null>{
  try{const value=JSON.parse(Buffer.from((await cookies()).get(PENDING)?.value||'','base64url').toString()) as Pending;return ['signup','email','recovery'].includes(value.kind)&&value.expires>Date.now()&&typeof value.email==='string'?value:null;}catch{return null;}
}
export async function readCupBody(request:Request,max=131072){
  const reader=request.body?.getReader();if(!reader)throw new BackendError(400,'提交内容无效。');
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;if(size>max){await reader.cancel();throw new BackendError(413,'提交内容过大，请减少照片尺寸。');}chunks.push(result.value);}
  return Buffer.concat(chunks,size);
}
