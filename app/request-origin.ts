export function sameSiteOrigin(request:Request):boolean {
  const url=new URL(request.url);
  const protocol=request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()||url.protocol.slice(0,-1);
  if(protocol!=='http'&&protocol!=='https')return false;
  const expected=process.env.SITE_PUBLIC_ORIGIN||protocol+'://'+(request.headers.get('host')||url.host);
  return request.headers.get('origin')===expected;
}
