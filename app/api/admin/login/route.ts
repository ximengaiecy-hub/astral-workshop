import { authenticate } from '../../../admin-auth';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>authenticate(request);
