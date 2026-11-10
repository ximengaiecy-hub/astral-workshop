import { BackendError, invokeBackend } from '../../backend';
import { sameSiteOrigin } from '../../request-origin';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(!sameSiteOrigin(request))return Response.json({error:'请从本站购物车提交订单。'},{status:403});
  if(Number(request.headers.get('content-length')??0)>131072)return Response.json({error:'订单内容过长。'},{status:413});
  let body:Record<string,unknown>;
  try {
    const reader=request.body?.getReader();if(!reader)throw new Error();
    const decoder=new TextDecoder();let text='',bytes=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>131072){await reader.cancel();return Response.json({error:'订单内容过长。'},{status:413});}text+=decoder.decode(chunk.value,{stream:true});}
    body=JSON.parse(text+decoder.decode());
    if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();
  }catch{return Response.json({error:'订单格式无效。'},{status:400});}
  try{return Response.json(await invokeBackend('submit',body),{status:201,headers:{'Cache-Control':'no-store'}});}
  catch(error){return Response.json({error:error instanceof BackendError?error.message:'订单暂未保存，请保留购物车并稍后重试。'},{status:error instanceof BackendError?error.status:503});}
}
