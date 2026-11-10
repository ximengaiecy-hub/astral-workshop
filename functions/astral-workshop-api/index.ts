import { recordAdminAttempt, getAccount, createAccount, getSession, createSession, deleteSession, cleanupAuth, saveOrder, listOrders, deleteOrder, deleteProduct, restoreProduct } from './store.ts';
import { calculateQuote } from './quote.ts';
import { handleCup } from './cup.ts';
import { getProductState, createCustomProduct, updateExistingProduct, ProductError } from './custom-products.ts';
import catalog from './catalog.json' with { type:'json' };

declare const Deno: { env:{ get(name:string):string|undefined }; serve(handler:(request:Request)=>Promise<Response>):unknown };
type Invite = { username:string; tokenHash:string; expiresAt:number };
class InputError extends Error { constructor(public status:number, message:string) { super(message); } }
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const encoder = new TextEncoder();
const hex = (bytes:ArrayBuffer|Uint8Array) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = (value:string) => Uint8Array.from(value.match(/../g) ?? [], pair => parseInt(pair, 16));
const random = (size = 32) => hex(crypto.getRandomValues(new Uint8Array(size)));
const digest = async (value:string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const reply = (body:object, status = 200) => Response.json(body, { status, headers:{ 'Cache-Control':'no-store' } });
function invites():Invite[] {
  const list = JSON.parse(Deno.env.get('ASTRAL_ADMIN_INVITES') ?? '[]') as Invite[];
  if (!Array.isArray(list) || !list.length || list.some(item => !item || typeof item.username !== 'string' || !/^[a-f0-9]{64}$/.test(item.tokenHash) || !Number.isSafeInteger(item.expiresAt))) throw new Error('Administrator configuration missing');
  return list;
}
async function pepperKey() {
  const secret = Deno.env.get('ASTRAL_ADMIN_AUTH_SECRET');
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('Administrator secret missing');
  return crypto.subtle.importKey('raw', unhex(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign', 'verify']);
}
async function derivePassword(password:string, salt:string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  // Preserve the original password derivation for the two existing administrators.
  return crypto.subtle.deriveBits({ name:'PBKDF2', salt:unhex(salt), iterations:100000, hash:'SHA-256' }, key, 256);
}
async function readInput(request:Request) {
  const params = new URL(request.url).searchParams;
  const limit = params.get('cup') === 'upload' || params.get('product') === 'upload' ? 8 * 1024 * 1024 : 131072;
  if (Number(request.headers.get('content-length') ?? 0) > limit) throw new InputError(413, '请求内容过长。');
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400, '请求内容无效。');
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > limit) { await reader.cancel(); throw new InputError(413, '请求内容过长。'); }
    text += decoder.decode(chunk.value, { stream:true });
  }
  let body:unknown;
  try { body = JSON.parse(text + decoder.decode()); }
  catch { throw new InputError(400, '请求格式无效。'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError(400, '请求内容无效。');
  const input = body as Record<string,unknown>;
  if (bytes > 131072 && !(params.get('cup') === 'upload' && input.action === 'cup' && input.op === 'submitEntry') && !(params.get('product') === 'upload' && (input.action === 'createProduct' || input.action === 'updateProduct'))) throw new InputError(413, '请求内容过长。');
  if ((input.action === 'login' || input.action === 'activate') && bytes > 8192) throw new InputError(413, '登录内容过长。');
  return input;
}
async function adminUser(sessionToken:unknown):Promise<{username:string}|null> {
  if (typeof sessionToken !== 'string' || !/^[a-f0-9]{64}$/.test(sessionToken)) return null;
  const session = await getSession(await digest(sessionToken), Date.now());
  return session && invites().some(invite => invite.username.toLowerCase() === session.username) ? { username:session.username } : null;
}
function gatewayIp(request:Request):string|undefined {
  const ip = request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
  if (!ip) return undefined;
  try {
    if (ip.includes(':')) return new URL(`http://[${ip}]/`).hostname.startsWith('[') ? ip : undefined;
    return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && new URL(`http://${ip}/`).hostname === ip ? ip : undefined;
  } catch { return undefined; }
}
async function authenticate(body:Record<string,unknown>, activate:boolean, request:Request) {
  if (typeof body.username !== 'string' || !body.username.trim() || body.username.trim().length > 160 || typeof body.password !== 'string' || !body.password || body.password.length > 128) throw new InputError(400, '账号或密码内容无效。');
  const username = body.username.trim().toLowerCase(), password = body.password;
  const now = Date.now();
  const ip = gatewayIp(request);
  // The account limit is mandatory; gateway headers only add an IP throttle.
  for (const value of ['account:' + username, ...(ip ? ['ip:' + ip] : [])]) {
    const count = await recordAdminAttempt(await digest(value), now, now - WINDOW_MS);
    if (count > 10) throw new InputError(429, '尝试次数较多，请15分钟后再试。');
  }
  const invite = invites().find(item => item.username.toLowerCase() === username), key = await pepperKey();
  if (activate) {
    if (password.length < 10 || password.length > 20) throw new InputError(400, '请设置10–20个字符的密码。');
    if (!invite || invite.expiresAt <= Date.now() || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token) || await digest(body.token) !== invite.tokenHash) throw new InputError(403, '开通链接无效或已过期。');
    const salt = random(16), hash = hex(await crypto.subtle.sign('HMAC', key, await derivePassword(password, salt)));
    if (!await createAccount({ username, password_salt:salt, password_hash:hash, created_at:Date.now() })) throw new InputError(409, '此账号已经开通，请直接使用账号密码登录。');
  } else {
    const account = await getAccount(username);
    const derived = await derivePassword(password, account?.password_salt ?? '00'.repeat(16));
    const valid = await crypto.subtle.verify('HMAC', key, unhex(account?.password_hash ?? '00'.repeat(32)), derived);
    if (!invite || !account || !valid) throw new InputError(401, '账号或密码错误。');
  }
  const token = random(), created = Date.now();
  await cleanupAuth(created, created - 24 * 60 * 60 * 1000);
  await createSession({ token_hash:await digest(token), username, expires_at:created + SESSION_MS });
  return reply({ ok:true, token });
}
const modelAliases = (catalog as typeof catalog & { modelAliases?:Record<string,string> }).modelAliases ?? {};
async function manageProduct(body:Record<string,unknown>, restore:boolean) {
  const admin = await adminUser(body.sessionToken);
  if (!admin) throw new InputError(401, '请先登录管理员账号。');
  if ((body.kind !== 'model' && body.kind !== 'card' && body.kind !== 'bundle') || typeof body.productId !== 'string' || body.productId.length > 160 || !/^[a-z0-9][a-z0-9_-]{0,159}$/.test(body.productId)) throw new InputError(400, '商品信息无效。');
  const kind = body.kind;
  const productId = kind === 'model' ? modelAliases[body.productId] ?? body.productId : body.productId;
  const state = await getProductState();
  const products = kind === 'model' ? state.models : kind === 'card' ? state.cards : state.bundles;
  if (!products.some(product => product.id === productId)) throw new InputError(404, '商品不存在。');
  if (restore) await restoreProduct(kind, productId);
  else await deleteProduct(kind, productId, admin.username);
  return reply({ ok:true, kind, productId, deleted:!restore });
}
async function submit(body:Record<string,unknown>) {
  if (typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) throw new InputError(400, '提交标识无效，请重试。');
  for (const [key, label, max] of [['customerName', '姓名', 80], ['contact', '联系方式', 160], ['note', '备注', 1000]] as const) {
    if (typeof body[key] !== 'string' || body[key].trim().length > max || (key !== 'note' && !body[key].trim())) throw new InputError(400, label + '内容无效。');
    body[key] = body[key].trim();
  }
  const state = await getProductState();
  const deleted = new Set(state.deleted.map(product => product.kind + ':' + product.productId));
  let quote;
  try { quote = calculateQuote(body.items, state.models.filter(model => !deleted.has('model:' + model.id)), catalog.sources, state.cards.filter(card => !deleted.has('card:' + card.id)), modelAliases); }
  catch (problem) { throw new InputError(400, problem instanceof Error ? problem.message : '模型内容无效。'); }
  const payloadHash = await digest(JSON.stringify({ items:quote.items, customerName:body.customerName, contact:body.contact, note:body.note, userId:null }));
  const saved = await saveOrder({
    id:crypto.randomUUID(), request_id:body.requestId, payload_hash:payloadHash, user_id:null,
    customer_name:body.customerName as string, contact:body.contact as string, note:body.note as string,
    items:JSON.stringify(quote.items), total_min:Math.round(quote.totalMin * 100), total_max:Math.round(quote.totalMax * 100), piece_count:quote.pieceCount, created_at:new Date().toISOString(),
  });
  if (!saved || saved.payloadHash !== payloadHash) throw new InputError(409, '订单内容已变更，请重新提交。');
  return reply({ id:saved.id, totalMin:saved.totalMin / 100, totalMax:saved.totalMax / 100, pieceCount:saved.pieceCount }, 201);
}
async function handleRequest(request:Request):Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status:405, headers:{ Allow:'POST', 'Cache-Control':'no-store' } });
  try {
    const body = await readInput(request);
    switch (body.action) {
      case 'catalogState': {
        if (body.includeDeleted !== undefined && typeof body.includeDeleted !== 'boolean') throw new InputError(400, '商品查询参数无效。');
        if (body.includeDeleted === true && !await adminUser(body.sessionToken)) throw new InputError(401, '请先登录管理员账号。');
        const state = await getProductState();
        const deleted = new Set(state.deleted.map(product => product.kind + ':' + product.productId));
        return reply({ deleted:state.deleted, customProducts:state.customProducts.filter(product => body.includeDeleted === true || !deleted.has(product.kind + ':' + product.product.id)), overrides:state.overrides.filter(product => body.includeDeleted === true || !deleted.has(product.kind + ':' + product.product.id)) });
      }
      case 'createProduct': {
        const admin = await adminUser(body.sessionToken);
        if (!admin) throw new InputError(401, '请先登录管理员账号。');
        return reply(await createCustomProduct(body, admin.username), 201);
      }
      case 'updateProduct': {
        const admin = await adminUser(body.sessionToken);
        if (!admin) throw new InputError(401, '请先登录管理员账号。');
        return reply(await updateExistingProduct(body, admin.username));
      }
      case 'deleteProduct': return await manageProduct(body, false);
      case 'restoreProduct': return await manageProduct(body, true);
      case 'cup': return await handleCup(body, request, adminUser);
      case 'login': return await authenticate(body, false, request);
      case 'activate': return await authenticate(body, true, request);
      case 'session': return reply({ user:await adminUser(body.sessionToken) });
      case 'logout':
        if (typeof body.sessionToken === 'string' && /^[a-f0-9]{64}$/.test(body.sessionToken)) await deleteSession(await digest(body.sessionToken));
        return reply({ ok:true });
      case 'orders': {
        if (!await adminUser(body.sessionToken)) throw new InputError(401, '请先登录管理员账号。');
        const page = Math.min(10000, Math.max(1, Number.parseInt(String(body.page ?? 1), 10) || 1));
        return reply({ rows:await listOrders((page - 1) * 25, 26) });
      }
      case 'deleteOrder': {
        if (!await adminUser(body.sessionToken)) throw new InputError(401, '请先登录管理员账号。');
        if (typeof body.orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.orderId)) throw new InputError(400, '订单号无效。');
        const id = await deleteOrder(body.orderId.toLowerCase());
        if (!id) throw new InputError(404, '订单不存在或已删除。');
        return reply({ id });
      }
      case 'submit': return await submit(body);
      default: throw new InputError(400, '请求操作无效。');
    }
  } catch (problem) {
    return problem instanceof InputError || problem instanceof ProductError ? reply({ error:problem.message }, problem.status) : reply({ error:'服务暂不可用，请稍后重试。' }, 503);
  }
}
Deno.serve(handleRequest);
