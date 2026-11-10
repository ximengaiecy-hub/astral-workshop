import sharp from 'sharp';
import { getAdminUser, adminSessionToken } from '../../../admin-auth';
import { sameSiteOrigin } from '../../../request-origin';
import { backendUrl, anonKey } from '../../../cloud-endpoint';
import { invalidatePublicCatalog } from '../../../product-catalog';

const reply = (body:object,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const BODY_LIMIT = 7 * 1024 * 1024, FILE_LIMIT = 6 * 1024 * 1024, JPEG_LIMIT = 1.5 * 1024 * 1024;
class UploadError extends Error { constructor(message:string,public status=400) { super(message); } }

export async function handleProductUpload(request:Request,target?:{kind:string;id:string}) {
  if (!sameSiteOrigin(request)) return reply({error:'请从本站商品管理页面操作。'},403);
  const sessionToken = await adminSessionToken();
  if (!sessionToken || !/^[a-f0-9]{64}$/.test(sessionToken)) return reply({error:'请先登录管理员账号。'},401);
  try { if (!await getAdminUser()) return reply({error:'管理员登录已失效，请重新登录。'},401); }
  catch { return reply({error:'管理员服务暂时不可用，请稍后重试。'},503); }
  try {
    if (target && (!['model','card','bundle'].includes(target.kind) || !/^[a-z0-9][a-z0-9_-]{0,159}$/.test(target.id))) throw new UploadError('商品信息无效。');
    const contentType = request.headers.get('content-type') || '';
    if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) throw new UploadError('请选择商品图片并填写商品表单。');
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT) throw new UploadError('上传内容超过7MB，请缩小图片后重试。',413);
    const reader = request.body?.getReader();
    if (!reader) throw new UploadError('商品内容为空。');
    let size = 0; const chunks:Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > BODY_LIMIT) { await reader.cancel(); throw new UploadError('上传内容超过7MB，请缩小图片后重试。',413); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
    let form:FormData;
    try { form = await new Response(bytes,{headers:{'Content-Type':contentType}}).formData(); }
    catch { throw new UploadError('商品表单无法读取，请重新选择图片。'); }
    const required = target ? ['expectedVersion','requestId','product'] : ['kind','requestId','product','image'];
    if (required.some(field => form.getAll(field).length !== 1) || form.getAll('image').length > 1) throw new UploadError('商品表单信息不完整。');
    const kind = target?.kind ?? form.get('kind'), requestId = form.get('requestId'), text = form.get('product'), file = form.get('image');
    const expectedVersion = target ? form.get('expectedVersion') : undefined;
    if (target && (typeof expectedVersion !== 'string' || (expectedVersion !== 'base' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(expectedVersion)))) throw new UploadError('商品版本无效，请刷新目录后重新编辑。');
    if (typeof kind !== 'string' || !['model','card','bundle'].includes(kind)) throw new UploadError('商品类型无效。');
    if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)) throw new UploadError('商品请求无效，请重新打开表单。');
    let product:unknown;
    try { product = typeof text === 'string' ? JSON.parse(text) : null; }
    catch { throw new UploadError('商品信息无法读取。'); }
    if (!product || typeof product !== 'object' || Array.isArray(product)) throw new UploadError('商品信息无效。');
    let image:Buffer|undefined;
    if (!target || file !== null) {
      if (!(file instanceof File) || file.size === 0) throw new UploadError('请选择一张商品图片。');
      if (file.size > FILE_LIMIT) throw new UploadError('请选择不超过6MB的商品图片。',413);
      const input = Buffer.from(await file.arrayBuffer());
      try {
      const metadata = await sharp(input,{limitInputPixels:25_000_000,animated:true,failOn:'error'}).metadata();
      if (!['jpeg','png','webp'].includes(metadata.format || '') || !metadata.width || !metadata.height || metadata.width * metadata.height > 25_000_000 || (metadata.pages || 1) !== 1) throw new UploadError('仅支持单帧 JPG、PNG 或 WebP 图片，像素不超过2500万。');
      image = Buffer.alloc(0);
      for (const side of [1920,1600,1280]) {
        image = await sharp(input,{limitInputPixels:25_000_000,failOn:'error'}).rotate().flatten({background:'#111114'}).resize({width:side,height:side,fit:'inside',withoutEnlargement:true}).jpeg({quality:86}).toBuffer();
        if (image.length <= JPEG_LIMIT) break;
      }
      if (image.length > JPEG_LIMIT) throw new UploadError('图片仍过大，请先缩小后再上传。',413);
      } catch (error) { if (error instanceof UploadError) throw error; throw new UploadError('图片无法解码，请选择完整的 JPG、PNG 或 WebP 图片。'); }
    }
    const url = new URL(backendUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid backend endpoint');
    url.searchParams.set('product','upload');
    const response = await fetch(url,{method:'POST',headers:{apikey:anonKey,Authorization:'Bearer ' + anonKey,'Content-Type':'application/json'},body:JSON.stringify({action:target ? 'updateProduct' : 'createProduct',kind,requestId,product,...(image ? {image:image.toString('base64')} : {}),...(target ? {productId:target.id,expectedVersion} : {}),sessionToken}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)});
    const result = await response.json() as Record<string,unknown>;
    if (!response.ok) return reply({error:response.status < 500 && typeof result.error === 'string' ? result.error.slice(0,240) : '商品服务暂时不可用，请保留内容并稍后重试。'},response.status);
    if (result.ok !== true || result.kind !== kind || typeof result.productId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,159}$/.test(result.productId)) throw new Error('Invalid product creation response');
    if (target && (result.productId !== target.id || typeof result.version !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(result.version))) throw new Error('Invalid product update response');
    invalidatePublicCatalog();
    return reply({ok:true,kind,productId:result.productId,...(target ? {version:result.version} : {})});
  } catch (error) { return reply({error:error instanceof UploadError ? error.message : '商品操作暂未完成，请保留内容并重试。'},error instanceof UploadError ? error.status : 503); }
}
