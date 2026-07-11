import { useState } from 'react';
import { Monitor, X } from 'lucide-react';

const STORAGE_KEY = 'dspln:mobile-desktop-notice:dismissed';

function readDismissed() {
  if (typeof window === 'undefined') return true;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Small dismissible banner shown only on phone-sized screens, suggesting the
 * 3D customizer is easier to use on a computer. Dismissal lasts for the
 * browser session.
 */
export function MobileDeviceNotice() {
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Session storage unavailable — the banner just reappears next load.
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-[#1c1b1b] px-3 py-2 lg:hidden">
      <Monitor className="h-3.5 w-3.5 shrink-0 text-white/80" />
      <p className="text-[11px] font-medium leading-snug text-white">
        Tip: the 3D customizer works best on a computer.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="ml-1 shrink-0 rounded p-1 text-white/70 hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
