import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type RefObject,
} from 'react';

type Direction = 'horizontal' | 'vertical' | null;

const DIRECTION_THRESHOLD_PX = 8;
const MOBILE_QUERY = '(max-width: 1023px)';
const PINCH_EVENT = 'dspln:configurator-canvas:pinch';

const distanceBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);

const stopTouchEvent = (event: Event) => {
  event.preventDefault();
  event.stopPropagation();
  if ('stopImmediatePropagation' in event) {
    event.stopImmediatePropagation();
  }
};

export function useDirectionalCanvasTouch() {
  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const directionRef = useRef<Direction>(null);
  const lastYRef = useRef(0);
  const activeTouchesRef = useRef(new Map<number, { x: number; y: number }>());
  const lastPinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const isMobile = () => mediaQuery.matches;

    const stopForPageScroll = (event: Event) => {
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) {
        event.stopImmediatePropagation();
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (!isMobile()) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      stopForPageScroll(event);
    };

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!isMobile() || event.pointerType !== 'touch') return;
      activeTouchesRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (activeTouchesRef.current.size >= 2) {
        const [first, second] = Array.from(activeTouchesRef.current.values());
        lastPinchDistanceRef.current = distanceBetween(first, second);
        directionRef.current = null;
        stopTouchEvent(event);
        return;
      }

      startRef.current = { x: event.clientX, y: event.clientY };
      lastYRef.current = event.clientY;
      directionRef.current = null;
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!isMobile() || event.pointerType !== 'touch') return;
      if (!activeTouchesRef.current.has(event.pointerId)) return;

      activeTouchesRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (activeTouchesRef.current.size >= 2) {
        const [first, second] = Array.from(activeTouchesRef.current.values());
        const distance = distanceBetween(first, second);
        const previousDistance = lastPinchDistanceRef.current ?? distance;
        lastPinchDistanceRef.current = distance;

        if (previousDistance > 0 && distance > 0) {
          window.dispatchEvent(
            new CustomEvent(PINCH_EVENT, {
              detail: { factor: previousDistance / distance },
            }),
          );
        }

        stopTouchEvent(event);
        return;
      }

      const dx = event.clientX - startRef.current.x;
      const dy = event.clientY - startRef.current.y;

      if (!directionRef.current) {
        if (
          Math.abs(dx) < DIRECTION_THRESHOLD_PX &&
          Math.abs(dy) < DIRECTION_THRESHOLD_PX
        ) {
          return;
        }

        directionRef.current =
          Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
      }

      if (directionRef.current === 'vertical') {
        const scrollDelta = lastYRef.current - event.clientY;
        lastYRef.current = event.clientY;
        window.scrollBy(0, scrollDelta);
        stopForPageScroll(event);
      }
    };

    const handlePointerEnd = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'touch') {
        activeTouchesRef.current.delete(event.pointerId);
      }
      if (activeTouchesRef.current.size < 2) {
        lastPinchDistanceRef.current = null;
      }
      directionRef.current = null;
    };

    container.addEventListener('wheel', handleWheel, { capture: true });
    container.addEventListener('pointerdown', handlePointerDown, {
      capture: true,
    });
    container.addEventListener('pointermove', handlePointerMove, {
      capture: true,
    });
    container.addEventListener('pointerup', handlePointerEnd, {
      capture: true,
    });
    container.addEventListener('pointercancel', handlePointerEnd, {
      capture: true,
    });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      container.removeEventListener('pointerdown', handlePointerDown, {
        capture: true,
      });
      container.removeEventListener('pointermove', handlePointerMove, {
        capture: true,
      });
      container.removeEventListener('pointerup', handlePointerEnd, {
        capture: true,
      });
      container.removeEventListener('pointercancel', handlePointerEnd, {
        capture: true,
      });
    };
  }, []);

  const onPointerDown = useCallback((event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    startRef.current = { x: event.clientX, y: event.clientY };
    directionRef.current = null;
  }, []);

  const onPointerMoveCapture = useCallback((event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;

    const dx = event.clientX - startRef.current.x;
    const dy = event.clientY - startRef.current.y;

    if (!directionRef.current) {
      if (
        Math.abs(dx) < DIRECTION_THRESHOLD_PX &&
        Math.abs(dy) < DIRECTION_THRESHOLD_PX
      ) {
        return;
      }

      directionRef.current =
        Math.abs(dy) > Math.abs(dx) ? 'vertical' : 'horizontal';
    }

    if (directionRef.current === 'vertical') {
      event.stopPropagation();
    }
  }, []);

  const onPointerUp = useCallback((event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    directionRef.current = null;
  }, []);

  return {
    ref: containerRef as RefObject<HTMLDivElement>,
    onPointerDown,
    onPointerMoveCapture,
    onPointerCancel: onPointerUp,
    onPointerUp,
  };
}
