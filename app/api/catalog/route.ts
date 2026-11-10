import { loadPublicCatalog } from '../../product-catalog';

export const dynamic='force-dynamic';
let encoded:{models:Awaited<ReturnType<typeof loadPublicCatalog>>['catalog']['models'];fallbackAt:string|null;body:string}|undefined;
export async function GET() {
  try {
    const {catalog,fallbackAt}=await loadPublicCatalog();
    const {models}=catalog;
    if(encoded?.models!==models || encoded.fallbackAt!==fallbackAt)encoded={models,fallbackAt,body:JSON.stringify({models,fallbackAt})};
    return new Response(encoded.body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  }
  catch { return Response.json({error:'完整模型目录暂时无法读取，请稍后重试。'},{status:503,headers:{'Cache-Control':'no-store'}}); }
}
