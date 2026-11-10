import type { Metadata } from 'next';
import { isAdmin } from '../../admin-auth';
import CupClient from '../CupClient';
import '../cup.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'参赛账号登录 · 星界工坊',robots:{index:false,follow:false}};
export default async function CupLoginPage(){return <CupClient isAdmin={await isAdmin()} authOnly/>;}
