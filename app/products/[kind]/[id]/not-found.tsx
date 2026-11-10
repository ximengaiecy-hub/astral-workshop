import '../../../product-share.css';
import '../../../astral.css';

export default function ProductNotFound() {
  return <main className="product-page astral"><section className="product-page-unavailable"><p className="product-page-kicker">ASTRAL WORKSHOP</p><h1>商品不存在或已下架</h1><p>这款商品目前无法公开查看。你可以返回工坊，继续挑选其他模型、卡牌与套餐。</p><a className="button primary product-page-cta" href="/">返回星界工坊 ↗</a></section></main>;
}
