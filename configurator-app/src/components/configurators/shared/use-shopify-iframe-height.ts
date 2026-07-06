import { useEffect } from 'react';

export function useShopifyIframeHeight() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopifyTest') !== '1') return;

    let frame = 0;
    const sendHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = document.querySelector('.dspln-configurator-root');
        const rootHeight = root?.getBoundingClientRect().height ?? 0;
        const height = Math.ceil(
          rootHeight ||
            Math.max(
              document.body.scrollHeight,
              document.documentElement.scrollHeight,
            ),
        );
        window.parent.postMessage(
          { type: 'dspln:configurator:height', height },
          '*',
        );
      });
    };

    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    observer.observe(document.documentElement);
    window.addEventListener('resize', sendHeight);
    sendHeight();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', sendHeight);
    };
  }, []);
}
