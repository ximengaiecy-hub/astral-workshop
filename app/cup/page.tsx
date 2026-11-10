import type { Metadata } from 'next';
import { isAdmin } from '../admin-auth';
import CupClient from './CupClient';
import './cup.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'星界杯第一届——矮人涂装大赛！ · 星界工坊',description:'新手组15.9元，包邮1只已处理矮人；老手组19.9元，寄送2只未处理矮人。赛事规则、奖品、作品展示与分组投票。'};
export default async function CupPage(){return <CupClient isAdmin={await isAdmin().catch(()=>false)}/>;}
