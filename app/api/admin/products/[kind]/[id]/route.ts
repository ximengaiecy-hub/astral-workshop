import { adminSessionToken } from '../../../../../admin-auth';
import { BackendError, invokeBackend } from '../../../../../backend';
import { sameSiteOrigin } from '../../../../../request-origin';
import { handleProductUpload } from '../../upload';
import { invalidatePublicCatalog } from '../../../../../product-catalog';

export const dynamic = 'force-dynamic';
type Context = {params:Promise<{kind:string;id:string}>};
const reply = (body:object,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const kinds = ['model','card','bundle'];

async function change(request:Request,{params}:Context,deleted:boolean) {
  if (!sameSiteOrigin(request)) return reply({error:'请从本站商品管理页面操作。'},403);
  const sessionToken = await adminSessionToken();
  if (!sessionToken || !/^[a-f0-9]{64}$/.test(sessionToken)) return reply({error:'请先登录管理员账号。'},401);
  const {kind,id} = await params;
  if (!kinds.includes(kind) || !/^[a-z0-9][a-z0-9_-]{0,159}$/.test(id)) return reply({error:'商品信息无效。'},400);
  try {
    const result = await invokeBackend(deleted ? 'deleteProduct' : 'restoreProduct',{kind,productId:id,sessionToken});
    if (result.kind !== kind || result.productId !== id || result.deleted !== deleted || result.ok !== true) throw new Error('Invalid product update response');
    invalidatePublicCatalog();
    return reply({kind,productId:id,deleted});
  } catch (error) { return reply({error:error instanceof BackendError ? error.message : '操作暂未完成，请刷新商品列表核对后重试。'},error instanceof BackendError ? error.status : 503); }
}

export async function DELETE(request:Request,context:Context) { return change(request,context,true); }
export async function POST(request:Request,context:Context) { return change(request,context,false); }

export async function PATCH(request:Request,{params}:Context) { return handleProductUpload(request,await params); }
