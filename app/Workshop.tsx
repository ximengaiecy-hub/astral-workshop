"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { Model, Source, Bundle, CardPackage } from "./catalog";
import AdminLogin from "./AdminLogin";
import WorkshopLogo from "./WorkshopLogo";
import PopularContent from "./PopularContent";
import AccountMenu from "./AccountMenu";
import ShareProductButton from "./ShareProductButton";
import CatalogImage from "./CatalogImage";
import RaceFilter, { type FacetOption } from "./RaceFilter";
import { classifyModel, classOrder, OTHER_CLASS, partyNames, taxonomyLabel, type Party } from "./model-taxonomy";
import "./astral.css";
import allCardPackages from "../card-packages.json";
export type Catalog = { models: Model[]; sources: Source[]; bundles: Bundle[]; modelAliases: Record<string, string> };
type InitialProduct = {kind:'model'|'card'|'bundle';id:string};
type Tier = "supported" | "white" | "primer" | "painted";
type CartItem = { modelId: string; quantity: number; tier: Tier } | { cardId: string; quantity: number };
type Receipt = { id: string; totalMin: number; totalMax: number; pieceCount: number; items: CartItem[] };
const tierNames: Record<Tier, string> = { supported: "带支撑", white: "预处理白模", primer: "黑白补土", painted: "定制涂装" };
const tiers = Object.keys(tierNames) as Tier[];
const allCardMap = new Map(allCardPackages.map(card => [card.id, card]));
const workshopGallery = [
  { name: "六只小队", image: "/assets/demo-model.svg", fullImage: "/assets/demo-model.svg", caption: "小队阵容 · 涂装实拍" },
  { name: "奥喀斯", image: "/assets/demo-model.svg", fullImage: "/assets/demo-model.svg", caption: "大型模型 · 涂装实拍" },
  { name: "泰拉斯奎", image: "/assets/demo-model.svg", fullImage: "/assets/demo-model.svg", caption: "巨兽模型 · 涂装实拍" },
];

const marqueeWords = ["带支撑", "预处理白模", "黑白补土", "定制涂装", "DND 模组棋子", "通用遭遇套餐", "实体卡牌与卡册", "星界杯涂装大赛"];
const craftSteps = [
  { name: "带支撑", latin: "Supported", detail: "保留打印支撑，需要少许手工处理" },
  { name: "预处理白模", latin: "Cleaned", detail: "去支撑、打磨完成，适合自行涂装" },
  { name: "黑白补土", latin: "Primed", detail: "完成底层处理，为上色做好准备" },
  { name: "定制涂装", latin: "Painted", detail: "中型另加 ¥20–50，大型另加 ¥40–100" },
];
// 首页区块标题：编号 + 英文小标 + 中文主标题，可选右侧补充内容。
function SectionHead({ index, eyebrow, title, id, aside }: { index: string; eyebrow: string; title: ReactNode; id: string; aside?: ReactNode }) {
  return <div className="ax-section-head"><span className="ax-index" aria-hidden="true">{index}</span><div className="ax-section-title"><p className="ax-eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div>{aside && <div className="ax-section-aside">{aside}</div>}</div>;
}

export function checkedCart(items: CartItem[], aliases: Record<string, string> = {}, availableCards: ReadonlyMap<string, unknown> = allCardMap): CartItem[] {
  const merged: CartItem[] = [];
  let count = 0;
  for (const original of items) {
    const item = "modelId" in original ? { ...original, modelId: Object.hasOwn(aliases, original.modelId) ? aliases[original.modelId] : original.modelId } : original;
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new Error("商品数量请填写正整数。");
    if (!Number.isSafeInteger(item.quantity)) throw new Error("数量无法精确表示，请调整数值。");
    if ("cardId" in item) {
      if (!availableCards.has(item.cardId) || "modelId" in item || "tier" in item) throw new Error("请选择有效的卡牌或卡册。");
    } else if (!tiers.includes(item.tier)) throw new Error("请选择有效的制作档位。");
    if (!Number.isSafeInteger(count + item.quantity)) throw new Error("商品总数无法精确表示，请调整数值。");
    count += item.quantity;
    const found = merged.find(row => "cardId" in item ? "cardId" in row && row.cardId === item.cardId : "modelId" in row && row.modelId === item.modelId && row.tier === item.tier);
    if (found) {
      if (!Number.isSafeInteger(found.quantity + item.quantity)) throw new Error("合并后的数量无法精确表示，请调整数值。");
      found.quantity += item.quantity;
    } else merged.push({ ...item });
  }
  return merged;
}
const money = (amount: number) => `¥${Number(amount.toFixed(2)).toLocaleString("zh-CN")}`;
function estimate(model: Model, tier: Tier) { const base = tier === "painted" ? model.prices.primer : model.prices[tier]; return { min: base + (tier === "painted" ? model.printSize === "large" ? 40 : 20 : 0), max: base + (tier === "painted" ? model.printSize === "large" ? 100 : 50 : 0) }; }
function amountLabel(min: number, max: number) { return min === max ? money(min) : `${money(min)} – ${money(max)}`; }
function Icon({ name, className = "" }: { name: "star" | "cart" | "search" | "close" | "plus" | "minus" | "arrow" | "check" | "eye"; className?: string }) {
  const paths = { star: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z", cart: "M3 3h2l3 12h10l3-9H6M9 20h.01M18 20h.01", search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z", close: "M6 6l12 12M18 6 6 18", plus: "M12 5v14M5 12h14", minus: "M5 12h14", arrow: "M4 12h16M14 6l6 6-6 6", check: "M5 12l4 4L19 6", eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
function Modal({ children, onClose, title, wide = false, compact = false }: { children: ReactNode; onClose: () => void; title: string; wide?: boolean; compact?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`workshop-dialog ${wide ? "wide" : ""} ${compact ? "compact" : ""}`} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}><div className="dialog-inner"><button className="icon-button dialog-close" onClick={onClose} aria-label="关闭窗口"><Icon name="close" /></button>{children}</div></dialog>;
}
export default function Workshop({ catalog, isAdmin, cardPackages, catalogError, fallbackAt:initialFallbackAt, initialProduct, initialSearch='', modelCount=catalog.models.length, partyStats }: { catalog: Catalog; isAdmin: boolean; cardPackages: CardPackage[]; catalogError?:string; fallbackAt?:string|null; initialProduct?:InitialProduct; initialSearch?:string; modelCount?:number; partyStats?:Record<string,{count:number;races:[string,number][];classCount:number}> }) {
  const { sources, bundles, modelAliases } = catalog;
  const [models,setModels]=useState(catalog.models);
  const [fallbackAt,setFallbackAt]=useState(initialFallbackAt);
  const [catalogLoading,setCatalogLoading]=useState(false);
  const [catalogLoadError,setCatalogLoadError]=useState('');
  const [catalogRetry,setCatalogRetry]=useState(0);
  const initialId = initialProduct?.kind === 'model' && Object.hasOwn(modelAliases,initialProduct.id) ? modelAliases[initialProduct.id] : initialProduct?.id;
  const initialModel = initialProduct?.kind === 'model' ? models.find(model => model.id === initialId) : undefined;
  const initialCard = initialProduct?.kind === 'card' ? cardPackages.find(card => card.id === initialId) : undefined;
  const initialBundle = initialProduct?.kind === 'bundle' ? bundles.find(bundle => bundle.id === initialId) : undefined;
  const cardMap = useMemo(() => new Map(cardPackages.map(card => [card.id, card])), [cardPackages]);
  const [view, setView] = useState<"home" | "catalog" | "cards" | "bundles" | "cart">(() => initialModel || initialSearch ? "catalog" : initialCard ? "cards" : initialBundle ? "bundles" : "home");
  useEffect(()=>{
    if(view!=="catalog" || models.length>=modelCount)return;
    let cancelled=false;
    setCatalogLoading(true);setCatalogLoadError('');
    fetch('/api/catalog',{cache:'no-store'}).then(async response=>{
      const data=await response.json();if(!response.ok || !Array.isArray(data.models))throw new Error(data.error || '目录读取失败');
      if(!cancelled){
        if(data.fallbackAt)setFallbackAt(data.fallbackAt);
        setModels(data.models);
      }
    }).catch(()=>{if(!cancelled)setCatalogLoadError('完整目录暂未读取成功，请重试。');}).finally(()=>{if(!cancelled)setCatalogLoading(false);});
    return ()=>{cancelled=true;};
  },[view,modelCount,catalogRetry]);
  const [search, setSearch] = useState(initialSearch);
  const [cardSearch, setCardSearch] = useState("");
  const [cardCategory, setCardCategory] = useState("");
  const [cardPreview, setCardPreview] = useState<CardPackage | null>(() => initialCard || null);
  const filteredCards = cardPackages.filter(card => (!cardCategory || card.category === cardCategory) && `${card.name} ${card.game} ${card.description} ${card.contents.join(" ")}`.toLocaleLowerCase().includes(cardSearch.trim().toLocaleLowerCase()));
  const [sourceId, setSourceId] = useState("");
  const [modelKind, setModelKind] = useState("");
  const [catalogPage,setCatalogPage]=useState(1);
  const [pageFilter,setPageFilter]=useState("");
  const [bundleId, setBundleId] = useState("");
  const [party, setParty] = useState<"" | Party>("");
  const [race, setRace] = useState("");
  const [charClass, setCharClass] = useState("");
  const filterKey=[search,sourceId,modelKind,bundleId,party,race,charClass].join("|");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<Model | null>(() => initialModel || null);
  const [previewTier, setPreviewTier] = useState<Tier>("supported");
  const [bundlePreview, setBundlePreview] = useState<Bundle | null>(() => initialBundle || null);
  const [galleryPreview, setGalleryPreview] = useState<(typeof workshopGallery)[number] | null>(null);
  const [bundleTier, setBundleTier] = useState<Tier>("supported");
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const modelMap = useMemo(() => new Map(models.map(model => [model.id, model])), [models]);
  const sourceMap = useMemo(() => new Map(sources.map(source => [source.id, source])), [sources]);
  const taxonomyMap = useMemo(() => new Map(models.map(model => [model.id, classifyModel(model)])), [models]);
  const selectedBundle = bundles.find(bundle => bundle.id === bundleId);
  const selectedIds = selectedBundle ? new Set(selectedBundle.items.map(item => item.modelId)) : null;
  // 先按来源、模组和关键词过滤，再在这个范围内计算阵营 / 种族 / 职业的数量。
  const scoped = models.filter(model => (!sourceId || model.sourceId === sourceId) && (!modelKind || (model.modelKind || "棋子") === modelKind) && (!selectedIds || selectedIds.has(model.id)) && (!search.trim() || `${model.name} ${(model.searchAliases || []).join(" ")} ${model.officialName} ${model.creatureType || ""} ${model.series} ${model.issue} ${sourceMap.get(model.sourceId)?.name || ""} ${taxonomyMap.get(model.id)?.race || ""} ${taxonomyMap.get(model.id)?.charClass || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const inParty = scoped.filter(model => !party || taxonomyMap.get(model.id)?.party === party);
  const inRace = inParty.filter(model => !race || taxonomyMap.get(model.id)?.race === race);
  const filtered = inRace.filter(model => party !== "adventurer" || !charClass || taxonomyMap.get(model.id)?.charClass === charClass);
  const partyCounts = { "": scoped.length, monster: 0, adventurer: 0, other:0 } as Record<"" | Party, number>;
  for (const model of scoped) partyCounts[taxonomyMap.get(model.id)!.party] += 1;
  function facet(list: Model[], key: "race" | "charClass", order?: string[]): FacetOption[] {
    const counts = new Map<string, number>();
    // 种族选项来自整个阵营，保证切换来源或关键词时选项稳定，数量反映当前范围。
    for (const model of models) { const value = taxonomyMap.get(model.id)!; if (value.party === party && (key === "race" || !race || value.race === race)) counts.set(value[key], 0); }
    for (const model of list) { const value = taxonomyMap.get(model.id)![key]; counts.set(value, (counts.get(value) || 0) + 1); }
    return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => order ? order.indexOf(a.value) - order.indexOf(b.value) : b.count - a.count || a.value.localeCompare(b.value, "zh-CN"));
  }
  const raceOptions = party ? facet(inParty, "race") : [];
  const classOptions = party === "adventurer" ? facet(inRace, "charClass", classOrder) : [];
  const pageCount=Math.max(1,Math.ceil(filtered.length/36));
  const currentPage=Math.min(pageCount,pageFilter===filterKey?catalogPage:1);
  const pageModels=filtered.slice((currentPage-1)*36,currentPage*36);
  function turnPage(page:number){setCatalogPage(page);setPageFilter(filterKey);document.getElementById("model-catalog")?.scrollIntoView({block:"start"});}
  const hasFilters = !!(modelKind || search || sourceId || bundleId || party || race || charClass);
  function resetFilters() { setModelKind(""); setSearch(""); setSourceId(""); setBundleId(""); setParty(""); setRace(""); setCharClass(""); }
  function chooseParty(next: "" | Party) { setParty(next); setRace(""); setCharClass(""); }
  function chooseRace(next: string) { setRace(next); setCharClass(""); }
  function openCatalogWith(nextParty: Party, nextRace = "") { resetFilters(); setParty(nextParty); setRace(nextRace); navigate("catalog"); }
  // 首页「阵营入口」：各阵营的模型数、热门种族和一张代表作。
  const partyShowcase = useMemo(() => (["monster", "adventurer"] as const).map(entry => {
    const members = models.filter(model => taxonomyMap.get(model.id)?.party === entry);
    const races = new Map<string, number>();
    for (const model of members) { const value = taxonomyMap.get(model.id)!.race; races.set(value, (races.get(value) || 0) + 1); }
    const model = entry === "monster" ? members.find(item => item.category === "巨龙") || members.find(item => item.printSize === "large") || members[0] : members.find(item => item.category === "冒险者") || members[0];
    return { party: entry, count: members.length, model, races: [...races].sort((a, b) => b[1] - a[1]), classCount: new Set(members.map(item => taxonomyMap.get(item.id)!.charClass).filter(value => value && value !== OTHER_CLASS)).size, ...partyStats?.[entry] };
  }), [models, taxonomyMap, partyStats]);
  const cartRows = cart.map(item => {
    if ("cardId" in item) { const card = cardMap.get(item.cardId); return card ? { ...item, card, model: null, unit: { min: card.price, max: card.price } } : null; }
    const model = modelMap.get(item.modelId); return model ? { ...item, model, card: null, unit: estimate(model, item.tier) } : null;
  }).filter(item => item !== null);
  const hasModels = cartRows.some(item => !!item.model);
  const hasCards = cartRows.some(item => !!item.card);
  const pieceCount = cartRows.reduce((sum, item) => sum + item.quantity, 0);
  const totalMin = cartRows.reduce((sum, item) => sum + item.unit.min * item.quantity, 0);
  const totalMax = cartRows.reduce((sum, item) => sum + item.unit.max * item.quantity, 0);
  useEffect(() => {
    if (catalogError || fallbackAt) return;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem("astral-workshop-cart") || "[]");
      if (Array.isArray(stored)) {
        const valid = stored.filter((item): item is CartItem => !!item && typeof item === "object" && Number.isSafeInteger(item.quantity) && item.quantity > 0 && (typeof item.cardId === "string" ? cardMap.has(item.cardId) && !("modelId" in item) && !("tier" in item) : typeof item.modelId === "string" && modelMap.has(modelAliases[item.modelId] || item.modelId) && !modelMap.get(modelAliases[item.modelId] || item.modelId)?.quoteOnly && !("cardId" in item) && tiers.includes(item.tier)));
        // Initial hydration reads the saved cart only in the browser.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCart(checkedCart(valid, modelAliases, cardMap));
        if (valid.length < stored.length) { setToastError(true); setToast("部分商品已下架，已从购物车移除。"); }
      }
    } catch { /* An unreadable saved cart starts empty. */ }
    setLoaded(true);
  }, [modelMap, cardMap, modelAliases, catalogError, fallbackAt]);
  useEffect(() => { if (loaded && !fallbackAt) { try { localStorage.setItem("astral-workshop-cart", JSON.stringify(cart)); } catch { /* The cart still works if browser storage is unavailable. */ } } }, [cart, loaded, fallbackAt]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4200); return () => clearTimeout(timer); }, [toast]);
  function navigate(next: typeof view) { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); }
  const cartLocked = pending || !!fallbackAt;
  function addItems(items: CartItem[]) {
    if (cartLocked || !items.length) return;
    try {
      const next = checkedCart([...cart, ...items], modelAliases, cardMap);
      if(next.some(item=>"modelId" in item && (!modelMap.has(item.modelId)||modelMap.get(item.modelId)?.quoteOnly)))throw new Error("该模型待确认报价，请联系工坊。");
      setCart(next); setReceipt(null); setError(""); setToastError(false);
      setToast(`已加入购物车 · ${items.reduce((sum, item) => sum + item.quantity, 0)} 件`);
    } catch (problem) { setToastError(true); setToast(problem instanceof Error ? problem.message : "本次添加未完成，请检查数量。"); }
  }
  function addBundle(bundle: Bundle, optional: boolean | null) {
    const items = bundle.items.filter(item => optional === null || !!item.optional === optional).map(item => ({ modelId: item.modelId, quantity: item.quantity, tier: bundleTier }));
    addItems(items);
  }
  function updateCart(index: number, patch: { quantity?: number; tier?: Tier }) {
    if (cartLocked) return;
    try {
      const next = checkedCart(cart.map((item, i) => i === index ? "cardId" in item ? { ...item, quantity: patch.quantity ?? item.quantity } : { ...item, ...patch } : item), modelAliases, cardMap);
      setCart(next); setError("");
    } catch (problem) { setToastError(true); setToast(problem instanceof Error ? problem.message : "本次调整未完成，请检查数量。"); }
  }
  function removeItem(index: number) { if (!cartLocked) setCart(previous => previous.filter((_, i) => i !== index)); }
  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (cartLocked || !pieceCount) return;
    const details = { items: cart, customerName: customerName.trim(), contact: contact.trim(), note: note.trim() };
    if (!details.customerName || !details.contact) { setError("请填写称呼和联系方式。"); return; }
    const signature = JSON.stringify(details);
    if (!request.current || request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setPending(true); setError("");
    try {
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...details, requestId: request.current.id }) });
      const result = await response.json() as Record<string, unknown>;
      if (!result || typeof result !== "object") throw new Error("未收到订单确认，请重试确认订单状态。");
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "订单暂时未能提交，请稍后重试。");
      if (typeof result.id !== "string" || typeof result.totalMin !== "number" || !Number.isFinite(result.totalMin) || typeof result.totalMax !== "number" || !Number.isFinite(result.totalMax) || typeof result.pieceCount !== "number" || !Number.isSafeInteger(result.pieceCount)) throw new Error("未收到订单确认，请重试确认订单状态。");
      setReceipt({ id: result.id, totalMin: result.totalMin, totalMax: result.totalMax, pieceCount: result.pieceCount, items: cart.map(item => ({ ...item })) });
      setCart([]); request.current = null;
    } catch (problem) { setError(problem instanceof Error ? problem.message : "连接暂时中断，购物车已保留，请重试。"); }
    finally { setPending(false); }
  }
  function openPreview(model: Model) { setPreviewTier("supported"); setPreview(model); }
  function bundlePrice(bundle: Bundle) { return bundle.items.reduce((sum, item) => sum + (modelMap.get(item.modelId)?.prices.supported || 0) * item.quantity, 0); }
  function bundleRange(bundle: Bundle) { return bundle.items.reduce((sum, item) => { const model = modelMap.get(item.modelId); if (!model) return sum; const unit = estimate(model, bundleTier); return { min: sum.min + unit.min * item.quantity, max: sum.max + unit.max * item.quantity }; }, { min: 0, max: 0 }); }
  function bundleCount(bundle: Bundle) { return bundle.items.reduce((sum, item) => sum + item.quantity, 0); }
  const bundleSections = bundlePreview ? [...new Set(bundlePreview.items.map(item => item.section || "棋子清单"))] : [];
  const craftSection = <section className="ax-craft" aria-labelledby="craft-title"><div className="ax-craft-intro"><p className="ax-eyebrow">Made for your table</p><h2 id="craft-title">选你喜欢的模型，<br />用你喜欢的方式制作。</h2><p>四个制作档位，从拿到手自己打磨，到直接摆上桌开团。</p></div><ol className="ax-craft-steps">{craftSteps.map((step, index) => <li key={step.name}><span className="ax-craft-number">0{index + 1}</span><em>{step.latin}</em><h3>{step.name}</h3><p>{step.detail}</p></li>)}</ol></section>;
  return <div className={`astral astral-view-${view}`}>
    <a className="skip-link" href="#main-content">跳到内容</a>
    <header className={"site-header" + (view === "home" ? " home-header" : "")}><div className="header-inner">
      <button className="brand" onClick={() => navigate("home")} aria-label="星界工坊首页"><WorkshopLogo className="brand-mark" /><span>星界工坊<small>ASTRAL WORKSHOP</small></span></button>
      <nav aria-label="主要导航"><button className={view === "home" ? "active" : ""} aria-current={view === "home" ? "page" : undefined} onClick={() => navigate("home")}>首页</button><button className={view === "catalog" ? "active" : ""} aria-current={view === "catalog" ? "page" : undefined} onClick={() => navigate("catalog")}>模型目录</button><button className={view === "cards" ? "active" : ""} aria-current={view === "cards" ? "page" : undefined} onClick={() => navigate("cards")}>卡牌目录</button><button className={view === "bundles" ? "active" : ""} aria-current={view === "bundles" ? "page" : undefined} onClick={() => navigate("bundles")}>模组与套餐</button><a href="/cup">星界杯</a><button onClick={() => { setCopied(false); setContactOpen(true); }}>联系工坊</button></nav>
      <div className="header-actions"><AccountMenu isAdmin={isAdmin} /><button className={`cart-link ${view === "cart" ? "active" : ""}`} onClick={() => navigate("cart")} aria-label={`购物车，${pieceCount}件商品`}><Icon name="cart" /><span>购物车</span><b>{pieceCount}</b></button></div>
    </div></header>
    <main id="main-content" className="site-main">
      {catalogError && <p className="form-error" role="status">{catalogError}</p>}
      {fallbackAt && <p className="form-error" role="status">当前展示 {new Date(fallbackAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} 的商品目录，可继续浏览。购物车和订单提交暂不可用。 <button type="button" className="text-button" onClick={() => window.location.reload()}>刷新目录</button></p>}
      {view === "home" && <div className="ax-home">
        <section className="ax-hero" aria-labelledby="hero-title">
          <div className="ax-hero-media"><img src="/assets/demo-model.svg" alt="星界工坊3D打印与涂装模型合集实拍，大型怪物与前排小队" width={1920} height={1302} fetchPriority="high" /></div>
          <div className="ax-hero-inner">
            <div className="ax-hero-copy">
              <p className="ax-kicker"><span>Nº 01</span>Tabletop Miniature Atelier</p>
              <h1 id="hero-title"><span>让冒险，</span><span className="ax-gild">有形。</span></h1>
              <p className="ax-hero-lead">3D 打印、手工涂装、DND 模组棋子与实体卡牌。<br />把想象里的英雄与怪物，带到真实的桌面上。</p>
              <div className="ax-hero-actions"><button className="ax-btn ax-btn-gold" onClick={() => navigate("catalog")}>探索模型 <Icon name="arrow" /></button><button className="ax-btn ax-btn-ghost" onClick={() => navigate("bundles")}>挑选冒险套餐</button></div>
            </div>
            <aside className="ax-hero-panel" aria-label="工坊目录概况">
              <dl className="ax-stats"><div><dt>模型款式</dt><dd>{modelCount}</dd></div><div><dt>模组与套餐</dt><dd>{bundles.length}</dd></div><div><dt>模型来源</dt><dd>{sources.length}</dd></div></dl>
              <a className="ax-hero-cup" href="/cup"><span><em>Astral Cup · 01</em><strong>第一届星界杯 · 矮人涂装大赛</strong></span><Icon name="arrow" /></a>
            </aside>
          </div>
        </section>
        <div className="ax-marquee" aria-hidden="true"><div className="ax-marquee-track">{[...marqueeWords, ...marqueeWords].map((word, index) => <span key={index}>{word}<i>✦</i></span>)}</div></div>
        <PopularContent onCards={() => navigate("cards")} onBundles={() => navigate("bundles")} bundle={bundles[0]} card={cardPackages[0]} />
        <section className="ax-section ax-sides" aria-labelledby="party-entry-title">
          <SectionHead index="02" eyebrow="Choose your side" id="party-entry-title" title="站在哪一边？" aside={<p>怪物按种族挑选，冒险者按种族与职业挑选，一键直达模型目录。</p>} />
          <div className="ax-side-grid">{partyShowcase.map(entry => <article key={entry.party} className={`ax-side ax-side-${entry.party}`}>
            <button className="ax-side-main" onClick={() => openCatalogWith(entry.party)} aria-label={`查看全部${partyNames[entry.party]}模型`}>
              <span className="ax-side-art">{entry.model && <img src={entry.model.image} alt="" loading="lazy" />}</span>
              <span className="ax-side-copy"><em>{entry.party === "monster" ? "Monsters" : "Adventurers"}</em><strong>{partyNames[entry.party]}</strong><span>{entry.count} 款模型 · {entry.races.length} 个种族{entry.party === "adventurer" ? ` · ${entry.classCount} 种职业` : ""}</span></span>
              <span className="ax-side-go"><Icon name="arrow" /></span>
            </button>
            <div className="ax-side-races" aria-label={`${partyNames[entry.party]}热门种族`}>{entry.races.slice(0, 6).map(([name, count]) => <button key={name} className="race-chip" onClick={() => openCatalogWith(entry.party, name)}><span>{name}</span><small>{count}</small></button>)}</div>
          </article>)}</div>
        </section>
        <section className="ax-section ax-adventures" aria-labelledby="featured-bundles-title">
          <SectionHead index="03" eyebrow="Choose your adventure" id="featured-bundles-title" title="故事，从阵容开始。" aside={<button className="ax-link" onClick={() => navigate("bundles")}>全部模组与套餐 <Icon name="arrow" /></button>} />
          <div className="ax-adventure-grid">{bundles.filter(bundle => bundle.kind === "adventure").map((bundle, index) => <button className="ax-adventure" key={bundle.id} onClick={() => setBundlePreview(bundle)} aria-label={`查看${bundle.name}`}>
            <span className="ax-adventure-stage"><img src={bundle.image} alt={`${bundle.name}棋子总览`} loading="lazy" /></span>
            <span className="ax-adventure-info"><em>Adventure {String(index + 1).padStart(2, "0")}</em><strong>{bundle.name}</strong><span>{bundle.purchasable === false ? "按角色自由选款" : `${bundleCount(bundle)} 枚棋子 · ${money(bundlePrice(bundle))} 起`}</span></span>
            <span className="ax-adventure-go"><Icon name="arrow" /></span>
          </button>)}</div>
        </section>
        <section className="ax-section ax-gallery" aria-labelledby="workshop-gallery-title">
          <SectionHead index="04" eyebrow="From our workbench" id="workshop-gallery-title" title="不止想象，亲眼看见。" aside={<p>工坊实拍作品，点击查看完整大图。</p>} />
          <div className="ax-gallery-grid">{workshopGallery.map((work, index) => <figure className={`ax-gallery-item ${index === 0 ? "is-lead" : ""}`} key={work.name}>
            <button className="ax-gallery-photo" onClick={() => setGalleryPreview(work)} aria-label={"查看" + work.name + "实拍大图"}><img src={work.image} alt={work.name + "模型涂装实拍"} width={1600} height={1201} loading="lazy" /><span className="ax-gallery-zoom"><Icon name="eye" />查看大图</span></button>
            <figcaption><em>0{index + 1} / Workshop edition</em><h3>{work.name}</h3><p>{work.caption}</p>{index === 0 && <p className="ax-gallery-desc">从盔甲上的金属光泽，到脚下的岩石底座。把每个角色的细节，带到你的桌面。</p>}</figcaption>
          </figure>)}</div>
        </section>
        {craftSection}
        <section className="ax-cta" aria-labelledby="cta-title">
          <div><p className="ax-eyebrow">Let&apos;s make your adventure</p><h2 id="cta-title">下一场冒险，<br />想让谁登场？</h2><p>选款、配色、整套模组棋子，微信聊一聊，工坊帮你配齐。</p></div>
          <div className="ax-cta-actions"><button className="ax-btn ax-btn-gold" onClick={() => { setCopied(false); setContactOpen(true); }}>和工坊聊聊 <Icon name="arrow" /></button><button className="ax-btn ax-btn-ghost" onClick={() => navigate("catalog")}>先逛逛模型</button></div>
        </section>
      </div>}
      {view === "catalog" && <>
        <section id="model-catalog" className="catalog-section catalog-page"><div className="section-heading"><div><p className="eyebrow">THE MINIATURE COLLECTION</p><h1>模型目录</h1><p className="catalog-intro">找到喜欢的角色，组成你的冒险。</p></div><p>{modelCount} 款模型 · 按来源、模组、种族与职业探索</p></div>
          <div className="catalog-layout"><aside className="source-sidebar"><h3>模型来源 <span>{sources.length}</span></h3><button className={`source-choice ${!sourceId ? "selected" : ""}`} onClick={() => setSourceId("")}><span>全部来源</span><small>{models.length}</small></button>{sources.map(source => <button key={source.id} className={`source-choice ${sourceId === source.id ? "selected" : ""}`} onClick={() => setSourceId(source.id)}><span>{source.name}<em>{source.englishName}</em></span><small>{models.filter(model => model.sourceId === source.id).length}</small></button>)}<div className="sidebar-note"><Icon name="star" /><p>先选阵容，再选制作档位。<br />涂装可按你的配色定制。</p></div></aside>
          <div className="catalog-results"><div className="catalog-toolbar"><label className="search-field"><Icon name="search" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索模型、角色或系列" aria-label="搜索模型" /></label><label className="filter-select mobile-source-filter"><span className="sr-only">按模型来源筛选</span><select value={sourceId} onChange={event => setSourceId(event.target.value)}><option value="">全部来源</option>{sources.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label className="filter-select"><span className="sr-only">按模组或套餐筛选</span><select value={bundleId} onChange={event => setBundleId(event.target.value)}><option value="">所有模组与套餐</option>{bundles.map(bundle => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}</select></label></div>
          <div className="catalog-kind-filter"><label>模型类型 <select aria-label="按模型类型筛选" value={modelKind} onChange={event=>setModelKind(event.target.value)}><option value="">全部类型</option>{[...new Set(models.map(model=>model.modelKind || "棋子"))].map(value=><option key={value} value={value}>{value}</option>)}</select></label><span>中文名称展示 · 详情保留英文原名 · 未定价款请先咨询</span></div>
          {catalogLoading && <p role="status">正在读取8家完整模型目录…</p>}{catalogLoadError && <p role="alert">{catalogLoadError} <button onClick={()=>setCatalogRetry(value=>value+1)}>重新读取</button></p>}
          <RaceFilter party={party} race={race} charClass={charClass} partyCounts={partyCounts} raceOptions={raceOptions} classOptions={classOptions} onParty={chooseParty} onRace={chooseRace} onClass={setCharClass} />
          {selectedBundle && <div className="bundle-context"><div><small>{selectedBundle.kind === "adventure" ? "DND 模组" : "通用遭遇套餐"}</small><strong>{selectedBundle.name}</strong><p>{selectedBundle.description}</p></div><button className="text-button" onClick={() => setBundlePreview(selectedBundle)}>查看棋子清单 ↗</button></div>}
          <div className="result-summary"><span aria-live="polite">{filtered.length} 款模型{sourceId && ` · ${sourceMap.get(sourceId)?.name}`}{party && ` · ${partyNames[party]}`}{race && ` · ${race}`}{party === "adventurer" && charClass && ` · ${charClass}`}</span>{hasFilters && <button onClick={resetFilters}>清除筛选 ×</button>}</div>
          {filtered.length ? <div className="model-grid">{pageModels.map(model => <article key={model.id} className="model-card"><button className="model-image" onClick={() => openPreview(model)} aria-label={`预览${model.name}`}><span className={`type-tag tag-${taxonomyMap.get(model.id)?.party}`}>{taxonomyLabel(taxonomyMap.get(model.id)!)}{model.printSize === "large" && " · 大型"}</span><CatalogImage src={model.image} alt={model.name} /><span className="preview-hint"><Icon name="eye" />预览</span></button><div className="model-details"><p className="model-source">{sourceMap.get(model.sourceId)?.name}</p><button className="model-name" onClick={() => openPreview(model)}>{model.name}</button><div className="model-card-bottom"><div><strong className={model.quoteOnly ? "quote-pending" : ""}>{model.quoteOnly ? "待确认报价" : money(model.prices.supported)}</strong><span>{model.quoteOnly ? "尺寸与制作费用待确认" : "带支撑 / 枚"}</span></div><button className="add-button" onClick={() => model.quoteOnly ? openPreview(model) : addItems([{ modelId: model.id, quantity: 1, tier: "supported" }])} disabled={!model.quoteOnly && cartLocked} aria-label={model.quoteOnly ? `查看${model.name}详情` : `将${model.name}加入购物车`}><Icon name={model.quoteOnly ? "eye" : "plus"} /><span className="model-add-text">{model.quoteOnly ? "详情" : "加入"}</span></button></div></div></article>)}</div> : <div className="empty-state"><Icon name="search" /><h3>这次筛选暂无模型</h3><p>{sourceId && !models.some(model => model.sourceId === sourceId) ? "这个来源的目录正在等待补充。你可以先看看已收录的模型。" : "换个关键词，或清除筛选再试试。"}</p><button className="button secondary" onClick={resetFilters}>查看全部模型</button></div>}
          {pageCount>1 && <nav className="catalog-pagination" aria-label="模型目录分页"><button disabled={currentPage<=1} onClick={()=>turnPage(currentPage-1)}>上一页</button><span aria-live="polite">第 {currentPage} / {pageCount} 页 · 每页36款</span><button disabled={currentPage>=pageCount} onClick={()=>turnPage(currentPage+1)}>下一页</button></nav>}
          </div></div></section>
      </>}
      {view === "bundles" && <section className="bundle-page"><div className="page-heading"><p className="eyebrow">READY FOR THE TABLE</p><h1>一场冒险，一套阵容。</h1><p>按模组查看需要的角色与怪物，或用通用遭遇套餐快速开桌。</p></div>{(["adventure", "encounter"] as const).map(kind => <section key={kind} className="bundle-group"><div className="section-heading"><h2>{kind === "adventure" ? "DND 模组棋子" : "通用遭遇套餐"}</h2><span>{bundles.filter(bundle => bundle.kind === kind).length} 套内容</span></div><div className="bundle-grid">{bundles.filter(bundle => bundle.kind === kind).map(bundle => <article key={bundle.id} className="bundle-card"><button className="bundle-image" onClick={() => setBundlePreview(bundle)} aria-label={`查看${bundle.name}`}><img src={bundle.image} alt={`${bundle.name}棋子总览`} loading="lazy" /><span>{bundle.purchasable === false ? "选款目录" : `${bundleCount(bundle)} 枚棋子`}</span></button><div className="bundle-card-content"><p className="eyebrow">{bundle.version || (kind === "encounter" ? "通用遭遇" : "DND 模组")}{bundle.players ? ` · ${bundle.players} 名玩家` : ""}</p><h3>{bundle.name}</h3><p>{bundle.description}</p><div className="bundle-card-footer">{bundle.purchasable === false ? <span>按角色选择合适模型</span> : <span><strong>{money(bundlePrice(bundle))}</strong> 带支撑起</span>}<button className="text-button" onClick={() => setBundlePreview(bundle)}>查看清单 <Icon name="arrow" /></button></div></div></article>)}</div></section>)}</section>}
      {view === "cards" && <section className="card-catalog-page"><div className="page-heading"><p className="eyebrow">THE CARD COLLECTION</p><h1>卡牌目录</h1><p>从一张速查卡，到整套开团准备。挑选适合你的实体卡牌与定制卡册。</p></div><div className="catalog-toolbar card-catalog-toolbar"><label className="search-field"><Icon name="search" /><input type="search" value={cardSearch} onChange={event => setCardSearch(event.target.value)} placeholder="搜索法术、图鉴或套餐" aria-label="搜索卡牌套餐" /></label><label className="filter-select"><span className="sr-only">按卡牌类别筛选</span><select value={cardCategory} onChange={event => setCardCategory(event.target.value)}><option value="">全部卡牌与卡册</option>{[...new Set(cardPackages.map(card => card.category))].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div><div className="result-summary"><span>{filteredCards.length} 款卡牌与卡册</span>{(cardSearch || cardCategory) && <button onClick={() => { setCardSearch(""); setCardCategory(""); }}>清除筛选 ×</button>}</div>{filteredCards.length ? <div className="bundle-grid card-package-grid">{filteredCards.map(card => <article className="bundle-card" key={card.id}><button className="bundle-image card-package-image" onClick={() => setCardPreview(card)} aria-label={"查看" + card.name}><img src={card.image} alt={card.game + " " + card.name + "封面"} loading="lazy" /><span>{card.game}</span></button><div className="bundle-card-content"><p className="eyebrow">{card.category}</p><h3>{card.name}</h3><p>{card.description}</p><div className="bundle-card-footer"><span><strong>{money(card.price)}</strong> / {card.unit}</span><div className="card-package-actions"><button className="text-button" onClick={() => setCardPreview(card)}>详情</button><button className="add-button" disabled={cartLocked} onClick={() => addItems([{ cardId: card.id, quantity: 1 }])} aria-label={`将${card.name}加入购物车`}><Icon name="plus" />加入</button></div></div></div></article>)}</div> : <div className="empty-state"><Icon name="search" /><h2>这次筛选暂无套餐</h2><p>换个关键词，或清除筛选看看全部卡牌。</p><button className="button secondary" onClick={() => { setCardSearch(""); setCardCategory(""); }}>查看全部卡牌</button></div>}<p className="card-catalog-note">希梦魔法屋 · 闲鱼套餐标价。套装内容以详情为准，制作与定制需求可联系工坊确认。</p></section>}
      {view === "cart" && <section className="cart-page"><div className="page-heading"><p className="eyebrow">YOUR NEXT ADVENTURE</p><h1>你的冒险阵容</h1><p>模型可选择制作档位，卡牌与卡册按页面标价计费。提交后由工坊确认细节。</p></div>
        {receipt && <div className="order-success" role="status"><span className="success-mark"><Icon name="check" /></span><div><p className="eyebrow">ORDER RECEIVED</p><h2>预估订单已提交</h2><p>订单号 <strong>{receipt.id}</strong> · {receipt.pieceCount} 件商品</p><p className="success-price">{amountLabel(receipt.totalMin, receipt.totalMax)}</p><p>工坊已收到你的选款和联系方式。价格与制作细节将进一步确认。</p><button className="text-button success-contact" onClick={() => { setCopied(false); setContactOpen(true); }}>联系工坊确认细节 ↗</button><details><summary>查看已提交的商品明细</summary><ul className="receipt-list">{receipt.items.map((item, i) => <li key={i}><span>{"cardId" in item ? cardMap.get(item.cardId)?.name : modelMap.get(item.modelId)?.name + " · " + tierNames[item.tier]}</span><strong>× {item.quantity}{"cardId" in item ? cardMap.get(item.cardId)?.unit : "枚"}</strong></li>)}</ul></details></div></div>}
        {cartRows.length ? <div className="cart-layout"><div className="cart-items"><div className="cart-list-heading"><h2>已选商品 <span>{pieceCount} 件</span></h2><button className="text-button" onClick={() => navigate(hasCards ? "cards" : "catalog")}>继续选款 ↗</button></div>{cartRows.map((item, index) => {
          const product = item.card || item.model;
          return <article key={item.card ? "card-" + item.cardId : item.modelId + "-" + item.tier} className="cart-item"><button className="cart-item-image" onClick={() => item.card ? setCardPreview(item.card) : openPreview(item.model)} aria-label={"预览" + product.name}><img src={product.image} alt={product.name} /></button><div className="cart-item-content"><p className="model-source">{item.card ? "希梦魔法屋" : sourceMap.get(item.model.sourceId)?.name}</p><h3>{product.name}</h3><p className="cart-item-series">{item.card ? item.card.game + " · " + item.card.category : item.model.series + " · " + (item.model.issue || "期数待核实") + " · " + (item.model.printSize === "large" ? "大型计价" : "中型计价")}</p><div className="cart-controls">{item.card ? <span className="cart-card-format">实体卡牌 / 卡册 · 按{item.card.unit}计价</span> : <label><span className="sr-only">{product.name}的制作档位</span><select value={item.tier} onChange={event => updateCart(index, { tier: event.target.value as Tier })} disabled={cartLocked}>{tiers.map(tier => <option key={tier} value={tier}>{tierNames[tier]}</option>)}</select></label>}<div className="quantity-control"><button onClick={() => updateCart(index, { quantity: Math.max(1, item.quantity - 1) })} disabled={cartLocked || item.quantity <= 1} aria-label={"减少" + product.name + "数量"}><Icon name="minus" /></button><input type="number" min="1" step="1" value={item.quantity} disabled={cartLocked} onChange={event => { if (event.target.value !== "") updateCart(index, { quantity: Number(event.target.value) }); }} aria-label={product.name + "数量"} /><button onClick={() => updateCart(index, { quantity: item.quantity + 1 })} disabled={cartLocked} aria-label={"增加" + product.name + "数量"}><Icon name="plus" /></button></div></div><small className="cart-unit-price">单{item.card?.unit || "枚"} {amountLabel(item.unit.min, item.unit.max)}</small></div><div className="cart-item-total"><button className="remove-button" onClick={() => removeItem(index)} disabled={cartLocked} aria-label={"移除" + product.name}><Icon name="close" /></button><strong>{amountLabel(item.unit.min * item.quantity, item.unit.max * item.quantity)}</strong></div></article>;
        })}</div>
        <aside className="checkout-panel"><p className="eyebrow">ORDER ESTIMATE</p><h2>预估订单</h2><div className="checkout-total"><span>共 {pieceCount} 件商品</span><strong>{amountLabel(totalMin, totalMax)}</strong>{hasModels && <small>涂装在补土价上另加：中型 ¥20–50、大型 ¥40–100 / 枚，已计入所选涂装档位。</small>}{hasCards && <small>卡牌与卡册按所选套装、规格的标价计费。</small>}</div><form onSubmit={submitOrder}><label>怎么称呼你 <span>*</span><input name="customerName" autoComplete="name" value={customerName} onChange={event => setCustomerName(event.target.value)} maxLength={80} placeholder="姓名或称呼" required disabled={cartLocked} /></label><label>联系方式 <span>*</span><input name="contact" value={contact} onChange={event => setContact(event.target.value)} maxLength={120} placeholder="微信号、手机号或邮箱" required disabled={cartLocked} /></label><label>制作备注 <textarea name="note" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={3} placeholder="卡册内页、模型配色或其他制作要求（可选）" disabled={cartLocked} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary checkout-submit" type="submit" disabled={cartLocked}>{pending ? "正在提交订单…" : "提交预估订单"}{!pending && <Icon name="arrow" />}</button><p className="checkout-note">无需在线付款。提交后由工坊与你确认最终价格与制作安排。</p></form></aside></div> : !receipt && <div className="empty-state cart-empty"><Icon name="cart" /><h2>阵容还在等待第一位成员</h2><p>从喜欢的模型、卡牌或套餐开始。</p><div className="hero-actions"><button className="button primary" onClick={() => navigate("catalog")}>浏览模型 <Icon name="arrow" /></button><button className="button secondary" onClick={() => navigate("cards")}>浏览卡牌</button></div></div>}
        {receipt && !cartRows.length && <button className="button secondary receipt-continue" onClick={() => navigate(receipt.items.some(item => "cardId" in item) ? "cards" : "catalog")}>继续浏览商品 <Icon name="arrow" /></button>}
      </section>}
      {view !== "home" && view !== "cards" && (view !== "cart" || hasModels) && craftSection}
    </main>
    <footer className="ax-footer">
      <div className="ax-footer-grid">
        <div className="ax-footer-brand"><WorkshopLogo className="ax-footer-logo" /><div><strong>星界工坊</strong><p>让下一场冒险，来到你的桌面。<br />3D 打印 · 手工涂装 · 实体卡牌</p></div></div>
        <nav className="ax-footer-col" aria-label="逛逛工坊"><h3>逛逛工坊</h3><button onClick={() => navigate("catalog")}>模型目录</button><button onClick={() => navigate("cards")}>卡牌目录</button><button onClick={() => navigate("bundles")}>模组与套餐</button><a href="/cup">星界杯</a></nav>
        <nav className="ax-footer-col" aria-label="订单与服务"><h3>订单与服务</h3><button onClick={() => navigate("cart")}>预估订单</button><button onClick={() => { setCopied(false); setContactOpen(true); }}>联系工坊</button>{isAdmin ? <a href="/admin">订单管理</a> : <button aria-haspopup="dialog" onClick={() => setAdminLoginOpen(true)}>管理员登录</button>}</nav>
        <div className="ax-footer-col ax-footer-credits"><h3>模型创作者</h3><div>{sources.map(source => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">{source.englishName}</a>)}</div></div>
      </div>
      <p className="ax-footer-wordmark" aria-hidden="true">Astral Workshop</p>
      <div className="ax-footer-bottom"><span>© 星界工坊 · ASTRAL WORKSHOP</span><span>模型来源与系列详见各款介绍 · 页面价格为制作预估价</span></div>
    </footer>
    {cardPreview && <Modal title={cardPreview.name + "套餐详情"} onClose={() => setCardPreview(null)}><div className="model-preview card-package-preview"><div className="preview-image"><img src={cardPreview.image} alt={cardPreview.name + "完整封面"} /></div><div className="preview-content"><p className="eyebrow">{cardPreview.game} · {cardPreview.category}</p><h2>{cardPreview.name}</h2><p className="official-name">{cardPreview.sourceLabel || "希梦魔法屋"} · {cardPreview.issue || "期数未标注"}</p><p className="card-package-price">{money(cardPreview.price)} <small>/ {cardPreview.unit}</small></p><p className="card-package-description">{cardPreview.description}</p><h3 className="card-package-list-title">套餐内容</h3><ul className="card-package-contents">{cardPreview.contents.map(item => <li key={item}>{item}</li>)}</ul><button className="button primary preview-add" disabled={cartLocked} onClick={() => addItems([{ cardId: cardPreview.id, quantity: 1 }])}><Icon name="plus" /> 加入购物车</button><button className="text-button" onClick={() => { setCardPreview(null); setCopied(false); setContactOpen(true); }}>联系工坊咨询 ↗</button><ShareProductButton key={cardPreview.id} kind="card" id={cardPreview.id} /></div></div></Modal>}
    {galleryPreview && <Modal title={galleryPreview.name + "作品实拍"} onClose={() => setGalleryPreview(null)} wide><div className="workshop-gallery-preview"><p className="eyebrow">WORKSHOP GALLERY</p><h2>{galleryPreview.name}</h2><p>{galleryPreview.caption}</p><img src={galleryPreview.fullImage} alt={galleryPreview.name + "完整实拍照片"} width={4624} height={3472} /><a className="source-link" href={galleryPreview.fullImage} target="_blank" rel="noopener noreferrer">打开原始照片 ↗</a></div></Modal>}
    {preview && <Modal title={`${preview.name}模型预览`} onClose={() => setPreview(null)}><div className="model-preview"><div className="preview-image"><CatalogImage key={preview.image} src={preview.image} alt={preview.name} loading="eager" /></div><div className="preview-content"><p className="eyebrow">{sourceMap.get(preview.sourceId)?.englishName}</p><h2>{preview.name}</h2><p className="official-name">{preview.officialName}</p><dl className="model-provenance"><div><dt>模型来源</dt><dd>{sourceMap.get(preview.sourceId)?.name}</dd></div><div><dt>所属系列</dt><dd>{preview.series || "系列待核实"}</dd></div><div><dt>期数 / 发布期</dt><dd>{preview.issue || "期数待核实"}</dd></div><div><dt>模型类型</dt><dd>{preview.modelKind || "棋子"}</dd></div><div><dt>阵营 / 种族</dt><dd>{partyNames[classifyModel(preview).party]} · {taxonomyLabel(classifyModel(preview))}</dd></div><div><dt>计价规格</dt><dd>{preview.quoteOnly ? "尺寸待确认" : preview.printSize === "large" ? "大型棋子" : "中型棋子"}</dd></div></dl>{preview.sourceUrl && <a className="source-link" href={preview.sourceUrl} target="_blank" rel="noopener noreferrer">查看模型来源 ↗</a>}{preview.note && <p className="preview-note">{preview.note}</p>}{preview.quoteOnly ? <><p className="preview-quote-only">待确认报价</p><button className="button primary" onClick={()=>{setPreview(null);setContactOpen(true);}}>联系工坊确认报价 ↗</button></> : <><fieldset className="tier-picker"><legend>选择制作档位</legend>{tiers.map(tier => { const price = estimate(preview, tier); return <label key={tier} className={previewTier === tier ? "selected" : ""}><input type="radio" name="preview-tier" value={tier} checked={previewTier === tier} onChange={() => setPreviewTier(tier)} /><span>{tierNames[tier]}</span><strong>{amountLabel(price.min, price.max)}</strong></label>; })}</fieldset><button className="button primary preview-add" disabled={cartLocked} onClick={() => addItems([{ modelId: preview.id, quantity: 1, tier: previewTier }])}><Icon name="plus" /> 加入购物车</button><p className="preview-price-note">按枚计价 · 涂装费用已含在涂装档位区间内</p></>}<ShareProductButton key={preview.id} kind="model" id={preview.id} /></div></div></Modal>}
    {bundlePreview && <Modal title={`${bundlePreview.name}棋子清单`} onClose={() => setBundlePreview(null)} wide><div className="bundle-preview-heading"><p className="eyebrow">{bundlePreview.kind === "adventure" ? "DND ADVENTURE" : "ENCOUNTER COLLECTION"}</p><h2>{bundlePreview.name}</h2><p>{bundlePreview.description}</p><div className="bundle-meta"><span>来源：{bundlePreview.sourceLabel || [...new Set(bundlePreview.items.map(item => sourceMap.get(modelMap.get(item.modelId)?.sourceId || "")?.name).filter(Boolean))].join(" / ") || "星界工坊"}</span><span>期数：{bundlePreview.issue || "未标注"}</span>{bundlePreview.version && <span>{bundlePreview.version}</span>}{bundlePreview.players && <span>{bundlePreview.players} 名玩家</span>}<span>{bundlePreview.purchasable === false ? "按角色选款" : `${bundleCount(bundlePreview)} 枚整套棋子`}</span></div></div><img className="bundle-preview-overview" src={bundlePreview.image} alt={`${bundlePreview.name}棋子总览`} /><div className="bundle-actions">{bundlePreview.purchasable !== false && <label>整套制作档位 <select aria-label="整套制作档位" value={bundleTier} onChange={event => setBundleTier(event.target.value as Tier)}>{tiers.map(tier => <option key={tier} value={tier}>{tierNames[tier]}</option>)}</select></label>}{bundlePreview.purchasable !== false && <button className="button primary" disabled={cartLocked} onClick={() => addBundle(bundlePreview, null)}>整套加入购物车 · {amountLabel(bundleRange(bundlePreview).min, bundleRange(bundlePreview).max)}<Icon name="plus" /></button>}{bundlePreview.purchasable !== false && bundlePreview.items.some(item => item.optional) && <button className="button secondary" disabled={cartLocked} onClick={() => addBundle(bundlePreview, false)}>仅加入必选棋子</button>}<button className="text-button" onClick={() => { setBundleId(bundlePreview.id); setSourceId(""); chooseParty(""); setSearch(""); setBundlePreview(null); navigate("catalog"); }}>在目录筛选这些模型 ↗</button><ShareProductButton key={bundlePreview.id} kind="bundle" id={bundlePreview.id} /></div><p className="bundle-add-note">{bundlePreview.purchasable === false ? "这是角色对应选款目录，请按本次遭遇挑选所需模型。" : "整套包含清单中的可选棋子，按所选制作档位计价。你也可以仅加入必选棋子，并在购物车逐款调整。"}</p>{bundleSections.map(section => <section key={section} className="bundle-detail-section"><h3>{section}</h3><div className="bundle-model-list">{bundlePreview.items.filter(item => (item.section || "棋子清单") === section).map((item, index) => { const model = modelMap.get(item.modelId); if (!model) return null; return <article key={`${item.modelId}-${index}`}><button className="bundle-mini-image" onClick={() => { setBundlePreview(null); openPreview(model); }} aria-label={`预览${model.name}`}><CatalogImage src={model.image} alt={model.name} /></button><div><small>{item.role || model.category}{item.optional && " · 可选加购"}</small><h4>{model.name}</h4><p>{sourceMap.get(model.sourceId)?.name} · {model.series}</p></div><span className="bundle-quantity">× {item.quantity}</span><button className="icon-button" disabled={cartLocked} onClick={() => addItems([{ modelId: model.id, quantity: bundlePreview.purchasable === false ? 1 : item.quantity, tier: "supported" }])} aria-label={`将${model.name}加入购物车`}><Icon name="plus" /></button></article>; })}</div></section>)}</Modal>}
    {adminLoginOpen && <Modal title="管理员登录" onClose={() => setAdminLoginOpen(false)} compact><div className="contact-window admin-login-window"><span className="contact-star workshop-contact-logo"><WorkshopLogo /></span><AdminLogin /></div></Modal>}
    {contactOpen && <Modal title="联系星界工坊" onClose={() => setContactOpen(false)} compact><div className="contact-window"><span className="contact-star workshop-contact-logo"><WorkshopLogo /></span><p className="eyebrow">LET&apos;S MAKE YOUR ADVENTURE</p><h2>联系星界工坊</h2><p>选款、配色或制作要求，欢迎通过微信沟通。</p><div className="wechat-contact"><span>微信号</span><strong>示例联系渠道</strong></div><button className="button primary" onClick={async () => { try { await navigator.clipboard.writeText("示例联系渠道"); setCopied(true); } catch { setCopied(false); setToastError(false); setToast("可长按或选中微信号复制"); } }}>{copied ? "已复制微信号" : "复制微信号"}{copied && <Icon name="check" />}</button><small aria-live="polite">{copied ? "打开微信，搜索这个号码添加好友。" : "也可以长按或选中微信号复制。"}</small></div></Modal>}
    {toast && <div className={`toast ${toastError ? "toast-error" : ""}`} role="status"><Icon name={toastError ? "close" : "check"} /><span>{toast}</span><button onClick={() => { setPreview(null); setCardPreview(null); setBundlePreview(null); navigate("cart"); setToast(""); }}>查看购物车 →</button><button className="toast-close" onClick={() => setToast("")} aria-label="关闭提醒"><Icon name="close" /></button></div>}
  </div>;
}








