declare const Deno: { env: { get(name: string): string | undefined } };

const endpoint = new URL(Deno.env.get('ASTRAL_DB_URL') || Deno.env.get('SUPABASE_URL') || '');
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
  throw new Error('Configure an HTTPS Supabase endpoint for this project.');
}
export const databaseBase = endpoint.href.replace(/\/+$/, '');
