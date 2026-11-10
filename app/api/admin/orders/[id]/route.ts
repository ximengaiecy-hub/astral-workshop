import { adminSessionToken } from '../../../../admin-auth';
import { BackendError, invokeBackend } from '../../../../backend';
import { sameSiteOrigin } from '../../../../request-origin';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) {
  if(!sameSiteOrigin(request))return reply({error:'请从本站订单管理页面操作。'},403);
  const sessionToken=await adminSessionToken();
  if(!sessionToken||!/^[a-f0-9]{64}$/.test(sessionToken))return reply({error:'请先登录管理员账号。'},401);
  const {id:rawId}=await params;
  const id=rawId.toLowerCase();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return reply({error:'订单号无效。'},400);
  try {
    const result=await invokeBackend('deleteOrder',{orderId:id,sessionToken});
    if(result.id!==id)throw new Error('Invalid deletion response');
    return reply({id});
  }catch(error){return reply({error:error instanceof BackendError?error.message:'删除暂未完成，请刷新订单列表核对后重试。'},error instanceof BackendError?error.status:503);}
}
