// The Locker's standalone header IS the store's header — not a lookalike.
//
// The header group is cut straight out of the rendered homepage — the
// section rendering API renders defaults, not the configured group — so when
// the nav or scheme changes in the theme editor the Locker follows without a
// deploy. This function packages that
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
    const homeRes = await fetch(`${STORE_ORIGIN}/`, { headers: { Accept: 'text/html' } });
    if (!homeRes.ok) return json({ error: 'Store header unavailable' }, 502);
    const home = await homeRes.text();

    // NOT the section rendering API: /?sections=header renders the bare
    // header section with DEFAULT settings — white scheme-1, no announcement
    // bar. The store's real header is a section GROUP instance with its own
    // configuration (color-scheme-4, announcement bar), and the only place it
    // renders truthfully is the page itself. Dawn mounts the header group
    // immediately before <main>, so that span of the homepage IS the header.
    const start = home.search(/<div id="shopify-section-[^"]*"[^>]*class="[^"]*shopify-section-group-header-group/);
    const end = home.search(/<main\b/);
    if (start === -1 || end === -1 || end <= start) {
      return json({ error: 'Store header unavailable' }, 502);
    }
    let headerHtml = home.slice(start, end);

    const cssLinks = [
      ...new Set(
        [...headerHtml.matchAll(/href="([^"]+\.css[^"]*)"/g)].map((m) =>
          m[1].startsWith('//') ? `https:${m[1]}` : m[1],
        ),
      ),
    ];
    const base = home.match(/"(\/\/dspln\.com\/cdn\/[^"]*\/base\.css[^"]*)"/);
    if (base) cssLinks.unshift(`https:${base[1]}`);
    // Dawn's behavior lives in custom elements (header-drawer, details-modal…)
    // defined in global.js. The registry is document-global, so loading it
    // once upgrades the elements inside the shadow root too.
    const globalJs = home.match(/"(\/\/dspln\.com\/cdn\/[^"]*\/global\.js[^"]*)"/);
    const globalJsUrl = globalJs ? `https:${globalJs[1]}` : null;
    // Stylesheets the header depends on but does not link itself.
    for (const name of ['component-localization-form', 'component-predictive-search']) {
      const extra = home.match(new RegExp(`"(//dspln\\.com/cdn/[^"]*/${name}\\.css[^"]*)"`));
      if (extra && !cssLinks.includes(`https:${extra[1]}`)) cssLinks.push(`https:${extra[1]}`);
    }

    // The theme's own stylesheet repaints the header (--dspln-black over the
    // scheme). Its :root variables cannot apply from a <link> inside a shadow
    // root, so it ships inline; the client rewrites :root to :host.
    let themeCss = '';
    const globalCss = home.match(/"(\/\/dspln\.com\/cdn\/[^"]*\/dspln-global\.css[^"]*)"/);
    if (globalCss) {
      const cssRes = await fetch(`https:${globalCss[1]}`);
      if (cssRes.ok) themeCss = await cssRes.text();
    }

    const styleBlocks = home.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? [];
    const inlineStyle = styleBlocks
      .filter((block) => block.includes('@font-face') || block.includes(':root'))
      .map((block) => block.replace(/<\/?style[^>]*>/g, ''))
      .join('\n');

    headerHtml = stripScripts(headerHtml).replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');

    return json({
      data: {
        html: absolutize(headerHtml),
        cssLinks,
        inlineStyle,
        themeCss,
        globalJsUrl,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (cause) {
    console.error('[store-header]', cause);
    return json({ error: 'Store header unavailable' }, 502);
  }
};

export const config = { path: '/api/store-header' };
