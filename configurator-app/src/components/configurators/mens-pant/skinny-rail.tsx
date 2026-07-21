import { memo, type ReactNode } from 'react';

/**
 * Narrow vertical rail on the far left of the configurator.
 */
export const SkinnyRail = memo(({ children }: { children?: ReactNode }) => (
  <div className="bg-[#e8e8e6] hidden h-full w-[4.875rem] shrink-0 flex-col items-center border-r border-[#d8d8d6] lg:flex">
    {children}
  </div>
));

SkinnyRail.displayName = 'SkinnyRail';
