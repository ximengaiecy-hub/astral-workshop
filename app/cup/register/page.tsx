import type { Metadata } from 'next';
import RegistrationClient from './RegistrationClient';
import '../cup.css';
import './registration.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'星界杯报名 · 选择你的矮人',description:'选择本届指定矮人、参赛赛道并填写寄送资料。新手组15.9元，老手组19.9元。'};
export default function RegistrationPage(){return <RegistrationClient/>;}
