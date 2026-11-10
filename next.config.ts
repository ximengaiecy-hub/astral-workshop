import type { NextConfig } from 'next';

const nextConfig: NextConfig = { output: 'standalone', allowedDevOrigins: ['127.0.0.1', 'localhost'], images:{remotePatterns:[new URL('https://assets.myminifactory.com/object-images/**'),new URL('https://dl2.myminifactory.com/object-assets/**'),new URL('https://dl.myminifactory.com/object-assets/**'),new URL('https://app.lootstudios.com/wp-content/uploads/**'),new URL('https://site.lootstudios.com/wp-content/uploads/**'),new URL('https://assets.loot-studios.com/bundles/**'),new URL('https://assets.loot-studios.com/app/**'),new URL('https://www.dmstash.com/wp-content/uploads/**')],maximumRedirects:0} };
export default nextConfig;
