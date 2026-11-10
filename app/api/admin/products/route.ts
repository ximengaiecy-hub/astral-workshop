import { handleProductUpload } from './upload';

export const dynamic = 'force-dynamic';
export async function POST(request:Request) { return handleProductUpload(request); }
