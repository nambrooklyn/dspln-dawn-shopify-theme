# DSPLN Dawn Configurator App

This folder is the Dawn-local copy of the DSPLN configurator app.

It is intentionally kept inside `dspln-shopify-theme` so Dawn theme work can be
developed without changing the live Prestige/DTC configurator repo.

## Local Development

From this folder:

```sh
npm run dev
```

The app runs at:

```text
http://127.0.0.1:3002
```

The Dawn product template points to this local origin while we are developing:

```text
http://127.0.0.1:9292/products/customgi?view=gi-configurator-product-page
```

## Deployment Rule

Do not deploy this directly to Netlify. When this Dawn version is ready to go
live, create/use a GitHub repo, commit and push the code there, then let hosting
deploy from GitHub.
