import { adminSessionToken } from '../../admin-auth';
import { BackendError, invokeBackend } from '../../backend';
import { sameSiteOrigin } from '../../request-origin';
import { authReady,cupFailure,cupReply,cupToken,readCupBody } from '../../cup/auth';
import { phases, type CupEvent } from '../../cup/types';
import snapshot from '../../public-fallback.json';
import { cacheRead } from '../../short-read-cache';
export const dynamic='force-dynamic';

// ponytail: keep only the last public phase in memory, never participants or submissions.
let lastEvent:{event:CupEvent;capturedAt:string}|undefined;
function unavailableStatus() {
  const {event,capturedAt}=lastEvent??snapshot;
  return {event,entries:[],myEntries:[],user:null,registration:null,page:1,hasMore:false,authReady:false,fallbackAt:capturedAt};
}
async function readStatus(division:string|undefined,page:number,userToken?:string) {
  try {
    const [data,ready]=await Promise.all([invokeBackend('cup',{op:'status',division,page,userToken},5000),authReady()]);
    const event=data.event as CupEvent|undefined;
    if(event?.id!==snapshot.event.id || !phases.includes(event.phase) || !Number.isFinite(Date.parse(event.updatedAt)))throw new Error('Invalid cup event');
    lastEvent={event:{id:event.id,phase:event.phase,updatedAt:event.updatedAt},capturedAt:new Date().toISOString()};
    return {...data,...(!userToken&&{user:null,registration:null,myEntries:[]}),authReady:ready};
  } catch(error) {
    if(error instanceof BackendError && error.status<500 && error.status!==429)throw error;
    return unavailableStatus();
  }
}
const firstPages={
  all:cacheRead(()=>readStatus(undefined,1),10000),
  beginner:cacheRead(()=>readStatus('beginner',1),10000),
  experienced:cacheRead(()=>readStatus('experienced',1),10000),
};
export async function GET(request:Request){
  const url=new URL(request.url), sessionOnly=url.searchParams.get('view')==='session';
  let userToken:string|undefined;
  try{userToken=await cupToken();}
  catch(error){return sessionOnly?cupFailure(error):cupReply(unavailableStatus());}
  try{
    if(sessionOnly){
      if(!userToken)return cupReply({user:null});
      const data=await invokeBackend('cup',{op:'status',userToken},5000);
      return cupReply({user:data.user});
    }
    const division=url.searchParams.get('division')||undefined,page=Number(url.searchParams.get('page')||1);
    if(!userToken && page===1 && (division===undefined||division==='beginner'||division==='experienced')){
      return cupReply(await firstPages[division??'all'].get());
    }
    return cupReply(await readStatus(division,page,userToken));
  }catch(error){return cupFailure(error);}
}
export async function POST(request:Request){
  if(!sameSiteOrigin(request))return cupReply({error:'请从本站赛事页面操作。'},403);
  try{
    let body:Record<string,unknown>;try{body=JSON.parse((await readCupBody(request)).toString());}catch(error){if(error instanceof BackendError)throw error;throw new BackendError(400,'提交内容无效。');}
    if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.op!=='string'||!['register','vote','adminOverview','adminUpdateRegistration','adminSetPhase','adminReviewEntry','adminDeleteEntry','adminSetMember','adminRevokeVote','adminClearVotes'].includes(body.op))throw new BackendError(400,'操作无效。');
    const result=await invokeBackend('cup',{...body,userToken:await cupToken(),sessionToken:await adminSessionToken()});
    if(!['register','adminOverview','adminUpdateRegistration'].includes(body.op))for(const entry of Object.values(firstPages))entry.clear();
    return cupReply(result);
  }catch(error){return cupFailure(error);}
}
