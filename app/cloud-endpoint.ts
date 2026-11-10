import 'server-only';

export const backendUrl = process.env.ASTRAL_BACKEND_URL || '';
export const anonKey = process.env.ASTRAL_ANON_KEY || '';
export const authBase = (process.env.ASTRAL_AUTH_URL || '').replace(/\/+$/, '');
