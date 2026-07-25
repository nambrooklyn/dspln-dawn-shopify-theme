import { createContext, useContext, type ReactNode } from 'react';

import type { UploadedLogoItem } from './use-uploaded-logos';

/**
 * The customer's uploaded-artwork library (derived once in the
 * configurator root by useUploadedLogos). Slot upload sections read it
 * to offer "pick from your uploads" alongside the device file picker;
 * an empty list means the chooser stays hidden and uploads behave as a
 * plain file input.
 */
const UploadedLogosContext = createContext<UploadedLogoItem[]>([]);

export function UploadedLogosProvider({
  value,
  children,
}: {
  value: UploadedLogoItem[];
  children: ReactNode;
}) {
  return (
    <UploadedLogosContext.Provider value={value}>
      {children}
    </UploadedLogosContext.Provider>
  );
}

export function useSavedUploads(): UploadedLogoItem[] {
  return useContext(UploadedLogosContext);
}
