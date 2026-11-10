import { redirect } from 'next/navigation';
import { getAdminUser } from '../../admin-auth';
import CupAdmin from './CupAdmin';
import './admin-cup.css';

export const dynamic = 'force-dynamic';

export default async function CupAdminPage() {
  if (!await getAdminUser()) redirect('/admin/login?next=/admin/cup');
  return <CupAdmin />;
}
