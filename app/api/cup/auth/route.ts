import { BackendError,invokeBackend } from '../../../backend';
import { sameSiteOrigin } from '../../../request-origin';
import { clearAdminSession } from '../../../admin-auth';
import { authReady,authRequest,clearCupSession,cupFailure,cupReply,cupToken,getPending,readCupBody,setCupSession,setPending } from '../../../cup/auth';
export const dynamic='force-dynamic';
const emailOf=(value:unknown)=>{if(typeof value!=='string'||value.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(value.trim()))throw new BackendError(400,'请填写有效邮箱。');return value.trim().toLowerCase();};
const passwordOf=(value:unknown)=>{if(typeof value!=='string'||value.length<10||value.length>20)throw new BackendError(400,'密码需为10–20个字符。');return value;};
export async function POST(request:Request){
  if(!sameSiteOrigin(request))return cupReply({error:'请从本站登录页面操作。'},403);
  try{
    let body:Record<string,unknown>;try{body=JSON.parse((await readCupBody(request,8192)).toString());}catch(error){if(error instanceof BackendError)throw error;throw new BackendError(400,'登录内容无效。');}
    if(!body||typeof body!=='object'||Array.isArray(body))throw new BackendError(400,'登录内容无效。');
    if(body.op==='logout'){try{await clearAdminSession();try{const token=await cupToken();if(token)await authRequest('/logout?scope=local',{},token);}catch{/* Clear local identity even when email auth is unavailable. */}return cupReply({ok:true});}finally{await clearCupSession();}}
    if(['login','signup','recover','verify','reset'].includes(String(body.op)))await clearAdminSession();
    if(!await authReady())throw new BackendError(503,'邮箱验证服务正在准备，请稍后再试。');
    const email=emailOf(body.email),now=Date.now();
    if(body.op==='signup'){
      const password=passwordOf(body.password),name=typeof body.displayName==='string'?body.displayName.trim():'';
      if(name.length<2||name.length>30)throw new BackendError(400,'作者名称需为2–30个字符。');
      await authRequest('/signup',{email,password,data:{display_name:name,username:name}});
      await setPending({kind:'signup',email,expires:now+300000,sentAt:now});
      return cupReply({step:'verify',message:'验证邮件已申请发送，请输入邮件中的验证码。'});
    }
    if(body.op==='login'){
      const data=await authRequest('/token?grant_type=password',{email,password:passwordOf(body.password)});
      if(typeof data.access_token!=='string')throw new Error('Invalid session');
      try{await invokeBackend('cup',{op:'status',userToken:data.access_token});}
      catch(error){
        if(!(error instanceof BackendError)||error.status!==403)throw error;
        await authRequest('/otp',{email,create_user:false});
        await setPending({kind:'email',email,token:data.access_token,expires:now+300000,sentAt:now});
        return cupReply({step:'verify',message:'首次参与需验证邮箱，请输入邮件中的验证码。'});
      }
      await setCupSession(data);return cupReply({ok:true});
    }
    const pending=await getPending();
    if(body.op==='recover'){
      if(pending?.email===email&&now-pending.sentAt<60000)throw new BackendError(429,'请60秒后再申请邮件。');
      await authRequest('/recover',{email});await setPending({kind:'recovery',email,expires:now+300000,sentAt:now});
      return cupReply({step:'recovery',message:'若邮箱已注册，将收到密码恢复邮件。验证码5分钟内有效。'});
    }
    if(!pending||pending.email!==email)throw new BackendError(400,'验证已过期，请重新申请邮件。');
    if(body.op==='resend'){
      if(now-pending.sentAt<60000)throw new BackendError(429,'请60秒后再申请邮件。');
      if(pending.kind==='email'){
        const user=await authRequest('/user',undefined,pending.token);if(user.email!==email)throw new BackendError(401,'请重新登录。');
        await authRequest('/otp',{email,create_user:false});
      }else if(pending.kind==='signup')await authRequest('/resend',{type:'signup',email});
      else throw new BackendError(400,'请使用找回密码重新申请。');
      await setPending({...pending,expires:now+300000,sentAt:now});return cupReply({step:'verify',message:'验证邮件已重新申请发送。'});
    }
    if(body.op!=='verify'&&body.op!=='reset')throw new BackendError(400,'操作无效。');
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw new BackendError(400,'请填写6位邮件验证码。');
    if((body.op==='reset')!==(pending.kind==='recovery'))throw new BackendError(400,'验证流程无效，请重新操作。');
    if(pending.kind==='email'){const user=await authRequest('/user',undefined,pending.token);if(user.email!==email)throw new BackendError(401,'请重新登录。');}
    const nextPassword=body.op==='reset'?passwordOf(body.password):undefined;
    const data=await authRequest('/verify',{email,token:body.code,type:pending.kind});
    const user=await authRequest('/user',undefined,data.access_token as string);
    if(user.email!==email||!user.email_confirmed_at)throw new BackendError(403,'邮箱验证尚未完成。');
    if(body.op==='reset'){
      await authRequest('/user',{password:nextPassword},data.access_token as string,'PUT');
    }
    await invokeBackend('cup',{op:'status',userToken:data.access_token});
    await setCupSession(data);return cupReply({ok:true});
  }catch(error){return cupFailure(error);}
}
