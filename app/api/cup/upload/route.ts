import sharp from 'sharp';
import { anonKey,backendUrl } from '../../../cloud-endpoint';
import { BackendError } from '../../../backend';
import { sameSiteOrigin } from '../../../request-origin';
import { cupFailure,cupReply,cupToken,readCupBody } from '../../../cup/auth';
export const dynamic='force-dynamic';
export async function POST(request:Request){
  if(!sameSiteOrigin(request))return cupReply({error:'请从本站投稿页面操作。'},403);
  try{
    const token=await cupToken();if(!token)throw new BackendError(401,'请先验证邮箱并登录。');
    const buffer=await readCupBody(request,6*1024*1024);
    let form:FormData;try{form=await new Response(new Uint8Array(buffer),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}catch{throw new BackendError(400,'投稿格式无效。');}
    const title=String(form.get('title')||'').trim(),description=String(form.get('description')||'').trim(),division=form.get('division');
    const front=form.getAll('frontImage');
    if(front.length!==1||!(front[0] instanceof File)||!front[0].size)throw new BackendError(400,'请上传一张作品正面图。');
    const files=[front[0],...form.getAll('images')];
    if(!title||title.length>80||description.length>1000||!['beginner','experienced'].includes(String(division))||files.length<1||files.length>4||files.some(file=>!(file instanceof File)))throw new BackendError(400,'请填写作品名称、组别，并选择1至4张照片。');
    const images:string[]=[];
    for(const file of files as File[]){
      if(!file.size||file.size>6*1024*1024)throw new BackendError(400,'照片大小无效。');
      try{
        const photo=sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:25000000,animated:false});
        const metadata=await photo.metadata();
        if(!['jpeg','png','webp'].includes(metadata.format||'')||(metadata.pages||1)>1)throw new Error();
        const jpg=await photo.rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).jpeg({quality:86}).toBuffer();
        if(jpg.length>1500000)throw new Error();images.push(jpg.toString('base64'));
      }catch{throw new BackendError(400,'有照片无法读取或过大，请更换 JPG、PNG 或 WebP 照片。');}
    }
    const endpoint=new URL(backendUrl);endpoint.searchParams.set('cup','upload');
    const result=await fetch(endpoint,{method:'POST',headers:{apikey:anonKey,Authorization:'Bearer '+anonKey,'Content-Type':'application/json'},body:JSON.stringify({action:'cup',op:'submitEntry',title,description,division,images,userToken:token}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000)});
    const data=await result.json();if(!result.ok)throw new BackendError(result.status,typeof data.error==='string'?data.error:'照片提交未完成，请重试。');
    return cupReply(data,result.status);
  }catch(error){return cupFailure(error);}
}
