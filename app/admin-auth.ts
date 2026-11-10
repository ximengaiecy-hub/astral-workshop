import { cookies } from 'next/headers';
import { BackendError, invokeBackend } from './backend';
import { sameSiteOrigin } from './request-origin';
import { clearCupSession } from './cup/auth';
const COOKIE='__Host-astral-admin';
const SESSION_SECONDS=8*60*60;
const sessionCookie=(token:string,maxAge:number)=>COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge;
const reply=(body:object,status=200,cookie?:string)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
const failure=(error:unknown)=>error instanceof BackendError?reply({error:error.message},error.status):reply({error:'管理员服务暂不可用，请稍后重试。'},503);
export async function adminSessionToken(){
  const store=await cookies();
  // Old browsers can still hold both identities; never grant admin access in that state.
  if(store.get('__Host-astral-cup')?.value||store.get('__Host-astral-cup-refresh')?.value)return undefined;
  return store.get(COOKIE)?.value;
}
export async function clearAdminSession(){
  const store=await cookies(),token=store.get(COOKIE)?.value;
  try{if(token&&/^[a-f0-9]{64}$/.test(token))await invokeBackend('logout',{sessionToken:token});}
  finally{store.set(COOKIE,'',{path:'/',httpOnly:true,secure:true,sameSite:'strict',maxAge:0});}
}
export async function getAdminUser():Promise<{username:string}|null> {
  const token=await adminSessionToken();
  if(!token||!/^[a-f0-9]{64}$/.test(token)) return null;
  const data=await invokeBackend('session',{sessionToken:token});
  const user=data.user as {username?:unknown}|null;
  return user&&typeof user.username==='string'?{username:user.username}:null;
}
export async function isAdmin(){return !!await getAdminUser();}
export async function authenticate(request:Request,activate=false):Promise<Response> {
  if(!sameSiteOrigin(request)) return reply({error:'请从本站管理员页面操作。'},403);
  try {
    const reader=request.body?.getReader();
    if(!reader) return reply({error:'登录内容无效。'},400);
    let size=0,text='';const decoder=new TextDecoder();
    while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8192){await reader.cancel();return reply({error:'登录内容过长。'},413);}text+=decoder.decode(chunk.value,{stream:true});}
    let body:Record<string,unknown>;
    try{body=JSON.parse(text+decoder.decode());}catch{return reply({error:'登录内容无效。'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'登录内容无效。'},400);
    const result=await invokeBackend(activate?'activate':'login',body);
    if(typeof result.token!=='string'||!/^[a-f0-9]{64}$/.test(result.token))throw new Error('Invalid session response');
    await clearCupSession();
    return reply({ok:true},200,sessionCookie(result.token,SESSION_SECONDS));
  }catch(error){return failure(error);}
}
export async function signOut(request:Request):Promise<Response> {
  if(!sameSiteOrigin(request)) return reply({error:'请从本站管理员页面操作。'},403);
  try {
    await clearCupSession();
    await clearAdminSession();
    return new Response(null,{status:303,headers:{Location:'/admin/login','Cache-Control':'no-store','Set-Cookie':sessionCookie('',0)}});
  }catch(error){return failure(error);}
}
