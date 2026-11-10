import { NextResponse } from 'next/server';
export function proxy() {
  const response=NextResponse.next();
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
}
export const config={matcher:['/admin/:path*']};

