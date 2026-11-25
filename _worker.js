// Armedias — Cloudflare Pages gatekeeper. Only these public paths are served; everything else (source code, guide) is 404.
const MAP = {
  '/': '/domain-hosting/',
  '/app': '/domain-hosting/app/',
  '/app/': '/domain-hosting/app/',
  '/robots.txt': '/domain-hosting/robots.txt',
  '/favicon.ico': '/domain-hosting/logo.png',
  '/b': '/domain-hosting/b/',
  '/b/': '/domain-hosting/b/',
  '/admin': '/domain-hosting/admin/',
  '/admin/': '/domain-hosting/admin/',
  '/features': '/domain-hosting/features/',
  '/features/': '/domain-hosting/features/',
  '/pricing': '/domain-hosting/pricing/',
  '/pricing/': '/domain-hosting/pricing/',
  '/enterprise': '/domain-hosting/enterprise/',
  '/enterprise/': '/domain-hosting/enterprise/',
  '/crm-for-isp': '/domain-hosting/crm-for-isp/',
  '/crm-for-isp/': '/domain-hosting/crm-for-isp/',
  '/billing-software-for-shops': '/domain-hosting/billing-software-for-shops/',
  '/billing-software-for-shops/': '/domain-hosting/billing-software-for-shops/',
  '/crm-for-agencies': '/domain-hosting/crm-for-agencies/',
  '/crm-for-agencies/': '/domain-hosting/crm-for-agencies/',
  '/site.css': '/domain-hosting/site.css',
  '/sitemap.xml': '/domain-hosting/sitemap.xml',
  '/config.js': '/domain-hosting/config.js',
  '/logo.png': '/domain-hosting/logo.png'
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = MAP[url.pathname];
    if (!target) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    const res = await env.ASSETS.fetch(new Request(new URL(target, url.origin), { method: 'GET', headers: request.headers }));
    const h = new Headers(res.headers);
    h.set('X-Content-Type-Options', 'nosniff');
    h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/app') || url.pathname.startsWith('/b')) h.set('X-Robots-Tag', 'noindex, nofollow');
    if (url.pathname === '/config.js') h.set('Cache-Control', 'no-cache');
    return new Response(res.body, { status: res.status, headers: h });
  }
};
