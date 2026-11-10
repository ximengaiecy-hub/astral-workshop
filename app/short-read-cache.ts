import 'server-only';

// ponytail: per process. Share a request during bursts and refresh after a short TTL.
export function cacheRead<T>(load:()=>Promise<T>,ttlMs:number) {
  let latest:{value:T;expiresAt:number}|undefined;
  let pending:Promise<T>|undefined;
  return {
    get() {
      if(latest && latest.expiresAt>Date.now())return Promise.resolve(latest.value);
      if(pending)return pending;
      const request=load().then(value=>{
        if(pending===request)latest={value,expiresAt:Date.now()+ttlMs};
        return value;
      }).finally(()=>{if(pending===request)pending=undefined;});
      pending=request;
      return request;
    },
    clear() { latest=undefined; pending=undefined; },
  };
}
