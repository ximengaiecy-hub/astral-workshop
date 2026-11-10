import 'server-only';
import { backendUrl, anonKey } from './cloud-endpoint';
export class BackendError extends Error {constructor(public status:number,message:string){super(message);}}
export async function invokeBackend(action:string,input:Record<string,unknown>={},timeoutMs=15000) {
  const url=new URL(backendUrl);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid backend endpoint');
  const response=await fetch(backendUrl,{method:'POST',headers:{apikey:anonKey,Authorization:'Bearer '+anonKey,'Content-Type':'application/json'},body:JSON.stringify({...input,action}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  const data=await response.json() as Record<string,unknown>;
  if(!response.ok) throw new BackendError(response.status,typeof data.error==='string'?data.error:'服务暂不可用，请稍后重试。');
  return data;
}
