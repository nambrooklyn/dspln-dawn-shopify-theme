// The Locker's standalone header IS the store's header — not a lookalike.
//
// Shopify's section rendering endpoint returns the header section exactly as
// dspln.com renders it, menus and all, so when the nav changes in the theme
// editor the Locker follows without a deploy. This function packages that
// HTML with the stylesheet links and the theme's font/variable block; the
// client renders it in a shadow root so Dawn's CSS cannot restyle the app.
//
// Scripts are stripped: Dawn's menus are <details>/<summary> and work without
// its JS, and the theme's scripts assume globals only theme.liquid defines.

const STORE_ORIGIN = 'https://dspln.com';
const CACHE_SECONDS = 600;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=86400`,
    },
  });

const absolutize = (html) =>
  html
    .replace(/(href|action)="\/(?!\/)/g, `$1="${STORE_ORIGIN}/`)
    .replace(/(src|href)="\/\/dspln\.com/g, '$1="https://dspln.com');

const stripScripts = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

export default async () => {
  try {
    const [sectionRes, homeRes] = await Promise.all([
      fetch(`${STORE_ORIGIN}/?sections=header`, { headers: { Accept: 'application/json' } }),
      fetch(`${STORE_ORIGIN}/`, { headers: { Accept: 'text/html' } }),
    ]);
    if (!sectionRes.ok) return json({ error: 'Store header unavailable' }, 502);

    const sections = await sectionRes.json();
    let headerHtml = sections?.header ?? '';
    if (!headerHtml) return json({ error: 'Store header unavailable' }, 502);

    const cssLinks = [
      ...new Set(
        [...headerHtml.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) =>
          m[1].startsWith('//') ? `https:${m[1]}` : m[1],
        ),
      ),
    ];

    // base.css and the font/@font-face + :root variable block only exist in
    // the full page head, not in the section payload.
    let inlineStyle = '';
    if (homeRes.ok) {
      const home = await homeRes.text();
      const base = home.match(/"(\/\/dspln\.com\/cdn\/[^"]*\/base\.css[^"]*)"/);
      if (base) cssLinks.unshift(`https:${base[1]}`);
      // Stylesheets the header depends on but does not link itself — the page
      // template loads them (the country selector's caret is unbounded
      // without localization-form.css).
      for (const name of ['component-localization-form', 'component-predictive-search']) {
        const extra = home.match(new RegExp(`"(//dspln\\.com/cdn/[^"]*/${name}\\.css[^"]*)"`));
        if (extra && !cssLinks.includes(`https:${extra[1]}`)) cssLinks.push(`https:${extra[1]}`);
      }
      const styleBlocks = home.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
      inlineStyle =
        styleBlocks
          .filter((s) => s.includes('@font-face') || s.includes(':root'))
          .map((s) => s.replace(/<\/?style[^>]*>/g, ''))
          .join('\n') ?? '';
    }

    // The header links its stylesheets itself; strip them from the HTML so the
    // client controls where they load (inside the shadow root, in order).
    headerHtml = stripScripts(headerHtml).replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');

    return json({
      data: {
        html: absolutize(headerHtml),
        cssLinks,
        inlineStyle,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (cause) {
    console.error('[store-header]', cause);
    return json({ error: 'Store header unavailable' }, 502);
  }
};

export const config = { path: '/api/store-header' };
