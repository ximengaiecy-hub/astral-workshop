import { invokeBackend } from '../backend';
import { getAdminUser, adminSessionToken } from '../admin-auth';
import { redirect } from 'next/navigation';
import DeleteOrderButton from './DeleteOrderButton';
export const dynamic='force-dynamic';
type Order={id:string;customerName:string;contact:string;note:string;items:string;totalMin:number;totalMax:number;pieceCount:number;createdAt:string};
const money=(value:number)=>'¥'+(value/100).toLocaleString('zh-CN',{minimumFractionDigits:2});
const tiers:Record<string,string>={supported:'带支撑',white:'预处理白模',primer:'黑白补土',painted:'定制涂装',card:'实体卡牌 / 卡册',cup:'星界杯报名（含赠送棋子）'};
export default async function Admin({searchParams}:{searchParams:Promise<{page?:string}>}) {
  if(!await getAdminUser()) redirect('/admin/login');
  const params=await searchParams;
  const page=Math.min(10000,Math.max(1,Number.parseInt(params.page??'1',10)||1));
  const data=await invokeBackend('orders',{sessionToken:await adminSessionToken(),page});
  const rows=data.rows as Order[];
  const more=rows.length>25;
  return <main className="admin-page" style={{maxWidth:1120,margin:'40px auto',padding:'0 24px 80px'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16}}><a href="/" style={{color:'var(--accent)'}}>← 星界工坊</a><a href="/admin/products" style={{color:'var(--accent)'}}>商品管理</a><a href="/admin/cup" style={{color:'var(--accent)'}}>星界杯管理 →</a><form action="/api/admin/logout" method="post"><button className="text-button" type="submit">退出登录</button></form></div>
    <header style={{margin:'32px 0',display:'flex',alignItems:'end',justifyContent:'space-between',gap:16}}><div><p style={{color:'var(--muted)',letterSpacing:3,fontSize:12}}>ASTRAL WORKSHOP</p><h1 style={{fontSize:36,margin:'8px 0'}}>预估订单</h1><p style={{color:'var(--muted)'}}>提交即存档，以下为预估金额；尚未付款。</p></div><a href={'/admin?page='+page}>刷新订单</a></header>
    {rows.length===0&&<p style={{padding:40,background:'var(--panel)',borderRadius:16}}>暂时没有预估订单。顾客提交购物车后会显示在这里。</p>}
    {rows.slice(0,25).map(order=>{
      const items=JSON.parse(order.items) as {modelId?:string;cardId?:string;unit?:string;name:string;officialName:string;source:string;series:string;issue:string;sourceUrl:string;image:string;note:string;quantity:number;tier:string;unitMin:number;unitMax:number;lineMin:number;lineMax:number}[];
      return <details key={order.id} id={'order-'+order.id} style={{background:'var(--panel)',border:'1px solid var(--line)',borderRadius:16,marginBottom:16,padding:20}}>
        <summary style={{cursor:'pointer',display:'flex',flexWrap:'wrap',gap:'8px 24px',alignItems:'center'}}><strong>{order.customerName}</strong><span>{order.pieceCount}件</span><strong style={{color:'var(--accent)',marginLeft:'auto'}}>{money(order.totalMin)}{order.totalMin!==order.totalMax?' – '+money(order.totalMax):''}</strong><time style={{color:'var(--muted)',fontSize:13}}>{new Date(order.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</time></summary>
        <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--line)'}}><p style={{fontSize:12,overflowWrap:'anywhere'}}>订单号：{order.id}</p><p>联系方式：{order.contact}</p>{order.note&&<p style={{whiteSpace:'pre-wrap'}}>备注：{order.note}</p>}
        <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:620,textAlign:'left'}}><thead><tr>{['商品 / 来源与规格','规格 / 档位','数量','单价','小计'].map(label=><th key={label} style={{padding:'12px 8px',borderBottom:'1px solid var(--line)',fontSize:12,color:'var(--muted)'}}>{label}</th>)}</tr></thead><tbody>{items.map((item,i)=><tr key={i}><td style={{padding:12,borderBottom:'1px solid var(--line)'}}><div style={{display:'flex',gap:12,alignItems:'center'}}><img src={item.image} alt={item.name} width={64} height={64} style={{objectFit:'contain',borderRadius:6,background:'var(--model-stage)'}}/><div><strong>{item.name}</strong><p style={{margin:'4px 0',fontSize:12,color:'var(--muted)'}}>{item.source} · {item.series}<br/>{item.issue}</p>{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer" style={{fontSize:12}}>查看来源</a>}{item.note&&<p style={{fontSize:11,maxWidth:280,color:'var(--muted)'}}>{item.note}</p>}</div></div></td><td>{tiers[item.tier]}</td><td>{item.quantity}{item.unit||"枚"}</td><td>{money(Math.round(item.unitMin*100))}{item.unitMin!==item.unitMax?'–'+money(Math.round(item.unitMax*100)):''}</td><td>{money(Math.round(item.lineMin*100))}{item.lineMin!==item.lineMax?'–'+money(Math.round(item.lineMax*100)):''}</td></tr>)}</tbody></table></div></div>
        <DeleteOrderButton orderId={order.id} customerName={order.customerName}/>
      </details>;
    })}
    <nav style={{display:'flex',gap:24,marginTop:24}}>{page>1&&<a href={'/admin?page='+(page-1)}>上一页</a>}<span>第{page}页</span>{more&&<a href={'/admin?page='+(page+1)}>下一页</a>}</nav>
  </main>;
}

