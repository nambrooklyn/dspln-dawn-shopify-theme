# DSPLN Tech Pack Generator

Self-contained module that builds the 4-page factory tech-pack PDF for a gi order:

1. **Page 1** — front + back 3D renders, DSPLN header + `ORDER# ####`
2. **Page 2** — left + right renders
3. **Page 3** — QC spec sheet (kimono / belt / pant: sizes, colors, logos, checkboxes)
4. **Page 4** — measurement table for the ordered kimono & pant sizes

It lives at the repo root (outside `src/`) so it is **fully isolated**: the production
build (`vite build` → bundles only `index.html`) and typecheck (`tsc -b` → only `src/`) are
unaffected, and no existing file is modified.

## Run the preview (dev only)

```bash
npm run dev
# then open:
http://127.0.0.1:3002/tech-pack/preview.html
```

Click **Generate Tech Pack** to render with sample data, then edit `fixtures.ts` or
`generate-tech-pack.ts` and click again (hot-reload). Everything (placeholder renders,
logos) is generated in code — no binary assets required.

## Files

| File | Purpose |
|------|---------|
| `generate-tech-pack.ts` | Core: `generateTechPack(data) -> jsPDF`. Pure, no app/DOM deps — runs in Node too. |
| `tech-pack-data.ts` | `TechPackData` view model + `fromDesignRecord()` adapter (maps the real saved-design record). |
| `size-specs.ts` | Adult measurements for A00S..A6L, from the sizing PDF. |
| `fixtures.ts` | Sample design record run through `fromDesignRecord()` + in-code placeholder images. |
| `preview.html` / `preview.ts` | Dev-only harness. |

## How it gets its data (production)

There is **no button**. The tech pack is generated automatically when an order is placed
and the customer never sees it — the link surfaces in the Shopify admin order page.

```
Order placed
  -> Shopify orders/create webhook            (NEW netlify function — not built yet)
       -> read `_dspln_design_id` from the line item properties
       -> GET /api/customer-designs?id={id}    (EXISTING: customer-designs.mjs)
            returns { configData: { spec, images }, thumbnailUrl, artwork }
       -> fromDesignRecord(record, orderNumber, renders)   ->  TechPackData
       -> generateTechPack(data)               (server-side jsPDF)
       -> store PDF in Netlify Blobs
       -> write PDF link to a Shopify ORDER METAFIELD  (shows in admin)
```

`generateTechPack()` is DOM-free, so it runs unchanged inside a Netlify function with
`jspdf`. Logo art arrives as base64 data URLs in `configData.images`; the render(s) arrive
as snapshot URLs.

## Open item — render views (pages 1-2)

The configurator currently captures a **single** preview snapshot (`thumbnailUrl`), and only
front/back camera positions exist. The sample tech pack shows front+back (page 1) and
left+right (page 2) = 4 views. To fill all four we must capture them at cart/save time
(touches the configurator + needs left/right camera positions in `gi-config.ts`). Until then
the adapter fills `front` from `thumbnailUrl` and leaves the rest empty (drawn as a labelled
box). Decision pending.

## Run the preview (dev only)

`npm run dev`, then open `http://127.0.0.1:3002/tech-pack/preview.html` (the dev launch
config here uses port 3010).

Replace the text DSPLN wordmark in `drawHeader()` with the real logo by embedding a PNG data
URL if a pixel-accurate mark is required.
