import { memo } from 'react';
import { ArrowLeft, Download, Loader2, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfiguratorTopbarProps {
  productName: string;
  onAddToCart: () => void;
  onExport: () => void;
  isAddingToCart?: boolean;
  isExporting?: boolean;
}

/**
 * Top bar for the 3D configurator. Visual + structural twin of the 2D
 * editor's EditorTopbar but takes a plain `productName` instead of a
 * full CatalogProduct (we don't always have one in v1).
 */
export const ConfiguratorTopbar = memo(
  ({
    productName,
    onAddToCart,
    onExport,
    isAddingToCart,
    isExporting,
  }: ConfiguratorTopbarProps) => {
    return (
      <div className="bg-background flex h-14 shrink-0 items-center justify-between border-b px-3 lg:px-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold">{productName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          <Button
            variant="outline"
            onClick={onExport}
            disabled={isExporting || isAddingToCart}
            className="h-9 gap-2 px-3 lg:h-10 lg:px-4"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Download PDF</span>
          </Button>
          <Button
            onClick={onAddToCart}
            disabled={isAddingToCart}
            className="hidden gap-2 lg:inline-flex"
          >
            {isAddingToCart ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            {isAddingToCart ? 'Adding...' : 'Add to Cart'}
          </Button>
        </div>
      </div>
    );
  },
);

ConfiguratorTopbar.displayName = 'ConfiguratorTopbar';
