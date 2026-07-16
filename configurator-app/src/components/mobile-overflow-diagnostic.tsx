import { useEffect, useState } from 'react';

interface Snapshot {
  screenWidth: number;
  innerWidth: number;
  docScrollWidth: number;
  bodyScrollWidth: number;
  overflow: number;
  worst: string;
}

/**
 * Temporary on-device overflow probe. Only renders when the page URL carries
 * ?dspln_diag=1, so it never appears for real customers. It surfaces the numbers
 * we can't measure from the dev sandbox (iOS Safari renders iframes differently
 * than headless Chromium) — the live viewport width, the document/body scroll
 * width, and the single widest element that pushes past the viewport.
 */
export function MobileOverflowDiagnostic() {
  const [enabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('dspln_diag') === '1';
  });
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const measure = () => {
      const de = document.documentElement;
      const innerWidth = window.innerWidth;
      let worst = 'none';
      let worstRight = innerWidth;
      document.querySelectorAll('body *').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > worstRight + 1) {
          worstRight = rect.right;
          const cls =
            typeof el.className === 'string'
              ? el.className.slice(0, 40)
              : '';
          worst = `${el.tagName.toLowerCase()}.${cls} →${Math.round(rect.right)}`;
        }
      });
      setSnap({
        screenWidth: window.screen?.width ?? 0,
        innerWidth,
        docScrollWidth: de.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflow: de.scrollWidth - innerWidth,
        worst,
      });
    };

    measure();
    const id = window.setInterval(measure, 700);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure);
    };
  }, [enabled]);

  if (!enabled || !snap) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        background: snap.overflow > 0 ? '#b91c1c' : '#166534',
        color: '#fff',
        font: '600 12px/1.35 ui-monospace, Menlo, monospace',
        padding: '8px 10px',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
      }}
    >
      {`screenW ${snap.screenWidth} · iframeInnerW ${snap.innerWidth} · docSW ${snap.docScrollWidth} · overflow ${snap.overflow}
${snap.innerWidth > snap.screenWidth ? '⚠ IFRAME WIDER THAN SCREEN (parent-side)' : 'iframe fits screen'}
widest: ${snap.worst}`}
    </div>
  );
}
