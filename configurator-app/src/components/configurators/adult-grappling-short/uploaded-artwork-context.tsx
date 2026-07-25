import { createContext, useContext, type ReactNode } from 'react';

import type { UploadedArtworkItem } from './use-uploaded-artwork';

/**
 * The customer's uploaded-artwork library (derived once in the
 * configurator root by useUploadedArtwork). The inline upload tile reads
 * it to offer "pick from your uploads" alongside the device file picker;
 * an empty list means the chooser stays hidden and uploads behave as a
 * plain file input.
 */
const UploadedArtworkContext = createContext<UploadedArtworkItem[]>([]);

export function UploadedArtworkProvider({
  value,
  children,
}: {
  value: UploadedArtworkItem[];
  children: ReactNode;
}) {
  return (
    <UploadedArtworkContext.Provider value={value}>
      {children}
    </UploadedArtworkContext.Provider>
  );
}

export function useSavedUploads(): UploadedArtworkItem[] {
  return useContext(UploadedArtworkContext);
}
