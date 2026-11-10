"use client";

import Image from 'next/image';
import { useState } from 'react';

export default function CatalogImage({src,alt,loading='lazy'}:{src:string;alt:string;loading?:'lazy'|'eager'}) {
  const [failed,setFailed]=useState(0);
  if(!src || failed===2)return <span className="catalog-image-unavailable">{src ? '图片暂时无法加载，可在详情查看原始来源' : '官方暂未提供预览图'}</span>;
  if(failed===0 && /^https:\/\/(assets\.myminifactory\.com|dl2?\.myminifactory\.com|(?:app|site)\.lootstudios\.com|assets\.loot-studios\.com|www\.dmstash\.com)\//.test(src))return <Image src={src} alt={alt} width={720} height={720} sizes="(max-width: 700px) 90vw, 40vw" loading={loading} onError={()=>setFailed(1)} />;
  return <img src={src} alt={alt} loading={loading} onError={()=>setFailed(2)} />;
}
