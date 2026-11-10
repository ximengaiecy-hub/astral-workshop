'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Bundle } from './catalog';

export default function PopularContent({ onCards, onBundles, bundle, card }: { onCards: () => void; onBundles: () => void; bundle?: Pick<Bundle, 'name' | 'image'>; card?: {name:string;image:string;game:string} }) {
  const [index, setIndex] = useState(0);
  const [moving, setMoving] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const slides = [
    { title: '第一届星界杯 · 矮人涂装大赛', tag: 'ASTRAL CUP / 01', description: '新手组15.9元，包邮1只已处理矮人；老手组19.9元，寄送2只未处理矮人。带上画笔，分享你的作品。', image: '/assets/demo-model.svg', alt: '提亚马特五首龙模型，老手组金奖展示', note: '老手组金奖展示 · 提亚马特', action: '进入赛事', href: '/cup', onClick: undefined, tone: 'peach' },
    ...(card ? [{ title: '卡牌目录', tag: 'THE CARD COLLECTION', description: '法术、角色、怪物与装备。把冒险需要的资料，放到触手可及的桌面。', image: card.image, alt: card.name + '真实商品封面', note: card.game + ' · ' + card.name, action: '挑选卡牌', href: undefined, onClick: onCards, tone: 'lilac' }] : []),
    ...(bundle ? [{ title: '模组与套餐', tag: 'YOUR NEXT ADVENTURE', description: '冒险的舞台准备好了。选择一套阵容，让角色和怪物走进你的故事。', image: bundle.image, alt: bundle.name + '现有套餐封面', note: bundle.name + ' · 棋子选款目录', action: '探索套餐', href: undefined, onClick: onBundles, tone: 'mint' }] : []),
  ];
  const count = slides.length;
  const active = (index + count) % count;
  const playing = !paused && !hovered && !focused && !dragging && !reduced && visible;
  function go(next: number) {
    if (moving || next === index) return;
    setAnimate(!reduced);
    setMoving(!reduced);
    setIndex(reduced ? (next + count) % count : next);
  }
  function settle() {
    setMoving(false);
    if (index < 0 || index >= count) { setAnimate(false); setIndex(active); }
  }
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { setReduced(media.matches); setVisible(!document.hidden); };
    sync();
    media.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { media.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, []);
  useEffect(() => {
    if (reduced) { setMoving(false); setAnimate(false); setIndex(value => (value + count) % count); }
  }, [reduced, count]);
  useEffect(() => {
    if (!playing || moving) return;
    const timer = window.setTimeout(() => go(index + 1), 6000);
    return () => window.clearTimeout(timer);
  }, [index, playing, moving, reduced, count]);

  return <section className="popular-content ax-section" aria-labelledby="popular-content-title" aria-roledescription="轮播" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="popular-heading ax-section-head"><span className="ax-index" aria-hidden="true">01</span><div className="ax-section-title"><p className="ax-eyebrow">Discover what&apos;s next</p><h2 id="popular-content-title">此刻，值得一看。</h2></div><div className="popular-heading-controls ax-section-aside"><span className="popular-counter">0{active + 1}<span> / 0{count}</span></span><button className="popular-play" type="button" disabled={reduced} aria-pressed={!paused && !reduced} onClick={() => setPaused(value => !value)} aria-label={paused ? '播放轮播' : '暂停轮播'}>{reduced ? '手动浏览' : paused ? '播放' : '暂停'}<span aria-hidden="true">{paused || reduced ? ' ▷' : ' Ⅱ'}</span></button></div></div>
    <div className="popular-viewport" onPointerDown={event => { if (event.pointerType !== 'mouse') { touch.current = { x: event.clientX, y: event.clientY }; setDragging(true); } }} onPointerUp={event => { const start = touch.current; touch.current = null; setDragging(false); if (start && Math.abs(event.clientX - start.x) > 45 && Math.abs(event.clientX - start.x) > Math.abs(event.clientY - start.y) * 1.2) go(index + (event.clientX < start.x ? 1 : -1)); }} onPointerCancel={() => { touch.current = null; setDragging(false); }}>
      <div className={'popular-track' + (animate ? ' is-moving' : '')} style={{ '--popular-position': index + count } as CSSProperties} onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'transform') settle(); }}>
        {[...slides, ...slides, ...slides].map((slide, position) => {
          const shown = position >= index + count && position < index + count + 2;
          return <article className={'popular-card popular-' + slide.tone} key={position} role="group" aria-roledescription="幻灯片" aria-label={(position % count + 1) + ' / ' + count + ' · ' + slide.title} aria-hidden={!shown} inert={!shown}>
            <figure className="popular-image"><img src={slide.image} alt={slide.alt} loading="lazy" /><figcaption>{slide.note}</figcaption></figure>
            <div className="popular-copy"><p className="popular-kicker">{slide.tag}</p><h3>{slide.title}</h3><p>{slide.description}</p>{slide.href ? <a className="popular-action" href={slide.href}>{slide.action}<span aria-hidden="true">↗</span></a> : <button className="popular-action" type="button" onClick={slide.onClick}>{slide.action}<span aria-hidden="true">↗</span></button>}</div>
          </article>;
        })}
      </div>
    </div>
    <div className="popular-controls"><p>{reduced ? '可使用箭头或横滑浏览。' : '自动横滑 · 停留时暂停 · 支持手动浏览'}</p><div className="popular-pages" aria-label="热门内容翻页"><button className="icon-button" type="button" aria-label="上一条热门内容" disabled={moving} onClick={() => go(index - 1)}>←</button>{slides.map((slide, page) => <button className={'popular-page ' + (active === page ? 'active' : '')} key={slide.tag} type="button" aria-label={'第' + (page + 1) + '页：' + slide.title} aria-current={active === page ? 'true' : undefined} disabled={moving} onClick={() => go(page)}><span /></button>)}<button className="icon-button" type="button" aria-label="下一条热门内容" disabled={moving} onClick={() => go(index + 1)}>→</button></div><span className="sr-only" role="status" aria-live={playing ? 'off' : 'polite'}>第{active + 1}页，共{count}页：{slides[active].title}</span></div>
  </section>;
}
