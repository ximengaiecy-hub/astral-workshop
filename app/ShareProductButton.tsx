'use client';

import { useState } from 'react';
import './product-share.css';

export default function ShareProductButton({kind,id}:{kind:'model'|'card'|'bundle';id:string}) {
  const [copied,setCopied] = useState(false);
  const [manual,setManual] = useState('');
  const path = '/products/' + kind + '/' + encodeURIComponent(id);
  const url = (process.env.NEXT_PUBLIC_SITE_ORIGIN || '') + path;
  async function copy() {
    const absolute = new URL(url,window.location.origin).href;
    setCopied(false); setManual(absolute);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(absolute);
      setCopied(true); setManual('');
    } catch { setCopied(false); }
  }
  return <div className="product-share-action">
    <div className="product-share-links"><button className="text-button product-share-button" type="button" onClick={copy}>{copied ? '商品链接已复制 ✓' : '复制商品链接 ↗'}</button><a className="product-share-open" href={url}>打开商品分享页 ↗</a></div>
    {copied && <span className="product-share-status" role="status">对方无需登录即可查看。</span>}
    {manual && <div className="product-share-fallback"><label><span>公开商品链接，可长按或全选复制</span><input aria-label="公开商品链接" value={manual} readOnly onFocus={event => event.currentTarget.select()} /></label></div>}
  </div>;
}
