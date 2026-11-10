type Prices = { supported:number; white:number; primer:number };
type QuoteModel = {id:string;name:string;officialName:string;sourceId:string;series:string;issue:string;sourceUrl:string;image:string;note:string;prices:Prices;quoteOnly?:boolean;printSize?:string};
type QuoteSource = {id:string;name:string};
type QuoteCard = {id:string;name:string;price:number;game:string;category:string;description:string;contents:string[];image:string;unit:string;sourceLabel?:string;issue?:string};
export function calculateQuote(input:unknown, models:QuoteModel[], sources:QuoteSource[], cards:QuoteCard[]=[], aliases:Record<string,string>={}) {
  if (!Array.isArray(input) || !input.length) throw new Error('请选择模型。');
  const byId=new Map(models.map(m=>[m.id,m]));
  const cardsById=new Map(cards.map(card=>[card.id,card]));
  const grouped=new Map<string,{model:QuoteModel;quantity:number;tier:string}|{card:QuoteCard;quantity:number}>();
  for(const row of input) {
    if(!row || typeof row !== 'object') throw new Error('模型信息无效。');
    if('cardId' in row) {
      if(typeof row.cardId !== 'string' || 'modelId' in row || 'tier' in row) throw new Error('卡牌信息无效，请重新选款。');
      const card=cardsById.get(row.cardId);
      if(!card) throw new Error('部分卡牌已不在当前目录中，请重新选款。');
      if(!Number.isSafeInteger(row.quantity) || row.quantity < 1) throw new Error('数量须为可精确表示的正整数。');
      const key='card:'+card.id;
      const quantity=(grouped.get(key)?.quantity ?? 0)+row.quantity;
      if(!Number.isSafeInteger(quantity)) throw new Error('数量无法精确计算，请调整数量。');
      grouped.set(key,{card,quantity});
      continue;
    }
    if(typeof row.modelId !== 'string') throw new Error('模型信息无效。');
    const model=byId.get(Object.hasOwn(aliases,row.modelId)?aliases[row.modelId]:row.modelId);
    if(!model) throw new Error('部分模型已不在当前目录中，请重新选款。');
    if(model.quoteOnly) throw new Error('该模型待确认报价，请联系工坊后再下单。');
    if(!['supported','white','primer','painted'].includes(row.tier)) throw new Error('制作档位无效。');
    if(!Number.isSafeInteger(row.quantity) || row.quantity < 1) throw new Error('数量须为可精确表示的正整数。');
    const key='model:'+model.id+':'+row.tier;
    const quantity=(grouped.get(key)?.quantity ?? 0)+row.quantity;
    if(!Number.isSafeInteger(quantity)) throw new Error('数量无法精确计算，请调整数量。');
    grouped.set(key,{model,quantity,tier:row.tier});
  }
  let min=0,max=0,pieceCount=0;
  const items=[...grouped.values()].map(item=>{
    if('card' in item) {
      const {card,quantity}=item;
      if(!Number.isFinite(card.price) || card.price<0) throw new Error('该卡牌价格待核实，暂不能提交。');
      if(!['套','本'].includes(card.unit)) throw new Error('该卡牌规格待核实，暂不能提交。');
      const unit=Math.round(card.price*100);
      min+=unit*quantity;max+=unit*quantity;pieceCount+=quantity;
      return {kind:'card' as const,cardId:card.id,name:card.name,officialName:card.name,game:card.game,source:card.sourceLabel||'希梦魔法屋',series:card.game+' · '+card.category,issue:card.issue||card.name,sourceUrl:'',image:card.image,note:card.description+'\n套餐内容：'+card.contents.join('；'),unit:card.unit,quantity,tier:'card',unitMin:unit/100,unitMax:unit/100,lineMin:unit*quantity/100,lineMax:unit*quantity/100};
    }
    const {model,quantity,tier}=item;
    const base=tier==='painted'?model.prices.primer:model.prices[tier as keyof Prices];
    if(!Number.isFinite(base) || base<0) throw new Error('该模型价格待核实，暂不能提交。');
    const unitMin=Math.round(base*100)+(tier==='painted'?(model.printSize==='large'?4000:2000):0);
    const unitMax=Math.round(base*100)+(tier==='painted'?(model.printSize==='large'?10000:5000):0);
    min+=unitMin*quantity;max+=unitMax*quantity;pieceCount+=quantity;
    return {modelId:model.id,name:model.name,officialName:model.officialName,source:sources.find(s=>s.id===model.sourceId)?.name ?? model.sourceId,series:model.series,issue:model.issue,sourceUrl:model.sourceUrl,image:model.image,note:model.note,quantity,tier,unitMin:unitMin/100,unitMax:unitMax/100,lineMin:unitMin*quantity/100,lineMax:unitMax*quantity/100};
  });
  if(![min,max,pieceCount].every(Number.isSafeInteger)) throw new Error('金额无法精确计算，请调整数量。');
  return {items,pieceCount,totalMin:min/100,totalMax:max/100};
}
