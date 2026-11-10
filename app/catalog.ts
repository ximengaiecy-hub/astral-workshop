import raw from '../catalog.json';
import rawCards from '../card-packages.json';
export type Model = { id:string; name:string; officialName:string; sourceId:string; series:string; issue:string; sourceUrl:string; image:string; category:string; prices:{supported:number;white:number;primer:number}; quoteOnly?:boolean; modelKind?:string; taxonomy?:{party:'monster'|'adventurer'|'other';race:string;charClass:string}; printSize?:'medium'|'large'; creatureType?:string; searchAliases?:string[]; multiplier:number; note:string; evidence:string[] };
export type Source = {id:string;name:string;englishName:string;url:string;aliases:string[]};
export type CardPackage = (typeof rawCards)[number] & {sourceLabel?:string;issue?:string};
export type Bundle = {id:string;name:string;kind:'adventure'|'encounter';description:string;image:string;items:{modelId:string;quantity:number;role:string;section:string;optional:boolean}[];version?:string;players?:number;purchasable?:boolean;sourceLabel?:string;issue?:string};
export const catalog = raw as {models:Model[];sources:Source[];bundles:Bundle[];modelAliases:Record<string,string>};
