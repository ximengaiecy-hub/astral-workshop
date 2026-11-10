import { databaseBase } from './config.ts';
declare const Deno: { env:{ get(name:string):string|undefined } };

type Account = { username:string; password_salt:string; password_hash:string };
type SessionValue = { token_hash:string; username:string; expires_at:number };
type OrderValue = {
  id:string; request_id:string; payload_hash:string; user_id:string|null;
  customer_name:string; contact:string; note:string; items:string;
  total_min:number; total_max:number; piece_count:number; created_at:string;
};
export type Order = {
  id:string; customerName:string; contact:string; note:string; items:string;
  totalMin:number; totalMax:number; pieceCount:number; createdAt:string;
};
type SavedOrder = { id:string; payloadHash:string; totalMin:number; totalMax:number; pieceCount:number };
type Row = Record<string,unknown>;

export async function request(path:string, query:Record<string,string> = {}, method = 'GET', body?:object, prefer?:string):Promise<unknown> {
  try {
    const base = databaseBase;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!base || !key) throw new Error();
    const endpoint = new URL(base);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
    const url = new URL(`${base.replace(/\/+$/, '')}/rest/v1/${path}`);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, {
      method,
      headers: { apikey:key, Authorization:`Bearer ${key}`, Accept:'application/json', 'Cache-Control':'no-store', Pragma:'no-cache', ...(body ? { 'Content-Type':'application/json' } : {}), ...(prefer ? { Prefer:prefer } : {}) },
      ...(body ? { body:JSON.stringify(body) } : {}),
      cache:'no-store', redirect:'error', signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error();
    return response.status === 204 || prefer === 'return=minimal' ? undefined : await response.json();
  } catch {
    throw new Error('Cloud database request failed.');
  }
}
function rows(value:unknown):Row[] {
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid cloud database response.');
  return value as Row[];
}
function first(value:unknown):Row|undefined {
  const result = rows(value);
  if (result.length > 1) throw new Error('Invalid cloud database response.');
  return result[0];
}
function text(value:unknown):string {
  if (typeof value !== 'string') throw new Error('Invalid cloud database response.');
  return value;
}
function integer(value:unknown, minimum = 0):number {
  const result = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < minimum) throw new Error('Invalid cloud database number.');
  return result;
}
function amounts(row:Row) {
  const totalMin = integer(row.total_min), totalMax = integer(row.total_max), pieceCount = integer(row.piece_count, 1);
  if (totalMax < totalMin) throw new Error('Invalid cloud database response.');
  return { totalMin, totalMax, pieceCount };
}

export async function recordAdminAttempt(key:string, now:number, cutoff:number):Promise<number> {
  return integer(await request('rpc/astral_workshop_record_admin_attempt', {}, 'POST', { p_key:key, p_now:now, p_cutoff:cutoff }), 1);
}
export async function getAccount(username:string):Promise<Account|undefined> {
  const row = first(await request('astral_workshop_admin_accounts', { select:'username,password_salt,password_hash', username:`eq.${username}`, limit:'1' }));
  if (!row) return undefined;
  if (row.username !== username || typeof row.password_salt !== 'string' || !/^[a-f0-9]{32}$/.test(row.password_salt) || typeof row.password_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.password_hash)) throw new Error('Invalid cloud database response.');
  return { username, password_salt:row.password_salt, password_hash:row.password_hash };
}
export async function createAccount(value:Account & { created_at:number }):Promise<boolean> {
  const row = first(await request('astral_workshop_admin_accounts', { on_conflict:'username', select:'username' }, 'POST', value, 'resolution=ignore-duplicates,return=representation'));
  if (row && row.username !== value.username) throw new Error('Invalid cloud database response.');
  return !!row;
}
export async function getSession(tokenHash:string, now:number):Promise<{username:string}|undefined> {
  const row = first(await request('astral_workshop_admin_sessions', { select:'username', token_hash:`eq.${tokenHash}`, expires_at:`gt.${now}`, limit:'1' }));
  return row ? { username:text(row.username) } : undefined;
}
export async function createSession(value:SessionValue):Promise<void> {
  await request('astral_workshop_admin_sessions', {}, 'POST', value, 'return=minimal');
}
export async function deleteSession(tokenHash:string):Promise<void> {
  await request('astral_workshop_admin_sessions', { token_hash:`eq.${tokenHash}` }, 'DELETE', undefined, 'return=minimal');
}
export async function cleanupAuth(cutoffSession:number, cutoffAttempt:number):Promise<void> {
  integer(cutoffSession); integer(cutoffAttempt);
  await request('astral_workshop_admin_sessions', { expires_at:`lt.${cutoffSession}` }, 'DELETE', undefined, 'return=minimal');
  await request('astral_workshop_admin_attempts', { window_start:`lt.${cutoffAttempt}` }, 'DELETE', undefined, 'return=minimal');
}
export async function saveOrder(value:OrderValue):Promise<SavedOrder|undefined> {
  const select = 'id,payload_hash,total_min,total_max,piece_count';
  const inserted = first(await request('astral_workshop_orders', { on_conflict:'request_id', select }, 'POST', value, 'resolution=ignore-duplicates,return=representation'));
  const row = inserted ?? first(await request('astral_workshop_orders', { select, request_id:`eq.${value.request_id}`, limit:'1' }));
  return row ? { id:text(row.id), payloadHash:text(row.payload_hash), ...amounts(row) } : undefined;
}
export async function listOrders(offset:number, limit:number):Promise<Order[]> {
  integer(offset); integer(limit, 1);
  return rows(await request('astral_workshop_orders', { select:'id,customer_name,contact,note,items,total_min,total_max,piece_count,created_at', order:'created_at.desc', offset:String(offset), limit:String(limit) })).map(row => ({
    id:text(row.id), customerName:text(row.customer_name), contact:text(row.contact), note:text(row.note), items:text(row.items), createdAt:text(row.created_at), ...amounts(row),
  }));
}
export async function deleteOrder(id:string):Promise<string|undefined> {
  const row = first(await request('astral_workshop_orders', { id:`eq.${id}`, select:'id' }, 'DELETE', undefined, 'return=representation'));
  if (row && row.id !== id) throw new Error('Invalid cloud database response.');
  return row ? id : undefined;
}

export type ProductKind = 'model'|'card'|'bundle';
export async function deleteProduct(kind:ProductKind, productId:string, username:string):Promise<void> {
  await request('astral_workshop_product_deletions', { on_conflict:'kind,product_id' }, 'POST', { kind, product_id:productId, deleted_at:new Date().toISOString(), deleted_by:username }, 'resolution=ignore-duplicates,return=representation');
}
export async function restoreProduct(kind:ProductKind, productId:string):Promise<void> {
  await request('astral_workshop_product_deletions', { kind:`eq.${kind}`, product_id:`eq.${productId}` }, 'DELETE', undefined, 'return=minimal');
}
