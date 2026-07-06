# Dawn Fresh Build Manifest

This folder is the local fresh Dawn build for DSPLN.

## Current Scope

The approved configurator groups in this build are:

- Mens custom Gi: `configurator-app/src/components/configurators/gi`
- Long sleeve rashguard: `configurator-app/src/components/configurators/long-sleeve-rashguard`

The active product templates are:

- `templates/product.gi-configurator-product-page.json`
- `templates/product.long-sleeve-rashguard-configurator-product-page.json`

The local configurator app runs at:

- `http://127.0.0.1:3002/configurator/gi`
- `http://127.0.0.1:3002/configurator/long-sleeve-rashguard`

## Intentional Boundary

This build should contain only files that are intentionally approved for the
Dawn work. Do not bulk-copy old configurator repos into this folder.

## Intentionally Excluded

The following copied groups/assets are still intentionally excluded from this Dawn build:

- Kids Gi configurator
- Womens Gi configurator
- Limited rashguard configurator
- Short sleeve rashguard configurator
- Unused kids/womens/short-sleeve/limited-rashguard model files
- Old copied Shopify export snippets from the configurator app
- Generated `dist`
- Generated `node_modules`
- `.DS_Store`
- TypeScript build cache files

## Rule For Adding Future Groups

Future configurator groups can be added only after deciding exactly which files
are correct and successful for that group. Add them intentionally, not by copying
the whole old app again.
