# Designs API — creating designs on a customer's behalf

The configurator saves designs to a public REST API. You can create a
design record directly and send the customer a share link; opening it
loads the exact design in the 3D configurator, ready to adjust and buy.

Base URL: `https://dspln-dawn-shopify-theme.netlify.app/api/customer-designs`
(the `/.netlify/functions/customer-designs` path is equivalent). No auth;
CORS `*`.

## Share links (what the customer receives)

| Product | Share URL |
|---|---|
| Mens gi | `https://dspln.com/products/customgi?design=<id>` |
| Kids gi | `https://dspln.com/products/custom-kids-gi?design=<id>` |
| Womens gi | `https://dspln.com/products/womens-custom-gi-suit?design=<id>` |

Anyone with the link can open, tweak, add to cart, and check out. If the
customer edits and saves, they create their own copy — the original stays.

Rashguards and grappling shorts have their own product pages
(`/products/custom-long-sleeve-rashguard`, `/products/custom-rashguard`,
`/products/custom-grappling-short-black`) but their design records use a
different spec (`kind` differs; free-form layers) — for those, prefer
walking the customer through the configurator unless you've read their
serializer first.

## The recipe (gi products)

1. **Validate every choice against `references/product-catalog.md`** —
   colors, sizes, fonts, slots. Never send a spec with invented options.
2. Build the record (schema below), with a fresh id:
   `gi_saved_<base36 timestamp>_<12 hex chars>` (any unique string works).
3. If the customer supplied a logo file: fix/optimize it first
   (artwork-guide), then upload it —
   `POST /.netlify/functions/upload-artwork` with JSON body
   `{"imageDataUrl": "data:image/png;base64,..."}` → `{ "url": ... }`
   (rejects >6MB with HTTP 413). Reference that hosted URL in
   `configData.images`.
4. `POST /api/customer-designs` with the record. 200 + `data.design`
   confirms the save; the response's `designUrl` is the share link.
5. **Verify before sending**: `GET /api/customer-designs?id=<id>` returns
   the record, and the spec fields round-trip correctly.
6. Reply with the share link + a bullet summary of every choice, flagging
   assumptions ("I assumed A2 — tell me your size and I'll update it").

To **modify** an existing design: GET it by id, change only the requested
fields, POST it back with the same `id` and `ownerKey` (POST is an
upsert). If it's a customer's own design and you don't know their
ownerKey, create a new id instead of guessing — never orphan their copy.

## POST payload

```jsonc
{
  "ownerKey": "guest:<uuid>",         // required. Use a fresh uuid per customer conversation
  "productHandle": "customgi",        // customgi | custom-kids-gi | womens-custom-gi-suit
  "id": "gi_saved_mabc123_0123456789ab",
  "name": "Navy Competition Gi",      // shows in saved designs + production packet
  "thumbnailUrl": null,
  "configData": {
    "source": "dspln-gi-configurator",   // kids: dspln-kids-gi-configurator, womens: dspln-womens-gi-configurator
    "version": 1,
    "spec": { /* GiSerializedState — below */ },
    "images": {
      "kimono": {
        "left-chest": { "shopifyUrl": "<hosted url from upload-artwork>",
                         "filename": "crest.png", "imageWidth": 800, "imageHeight": 800 }
      },
      "pant": {}
    }
  }
}
```

Slot keys — kimono: `left-chest`, `right-chest`, `left-sleeve`,
`right-sleeve`, `back`, `back-skirt`; pant: `left-pant`, `right-pant`.
Every slot present in `configData.images` must also appear in
`spec.kimono.logos` / `spec.pant.logos` (metadata only:
`{filename, imageWidth, imageHeight}`) — pricing and cart labels read the
spec, rendering reads the images; keep them consistent.

## `spec` (GiSerializedState) — mens gi

The loader dereferences nested fields without guards: **a missing
sub-object makes the design silently fail to load.** Include every field
below. Verified working template:

```json
{
  "kind": "gi",
  "partColors": { "jacket": "#1a2540", "pants": "#1a2540", "belt": "#000000" },
  "partVisibility": { "jacket": true, "pants": true, "belt": true },
  "price": {
    "currency": "USD",
    "total": 115,
    "lines": [
      { "part": "jacket", "included": true, "unitPrice": 55 },
      { "part": "pants", "included": true, "unitPrice": 45 },
      { "part": "belt", "included": true, "unitPrice": 15 }
    ]
  },
  "kimono": {
    "size": "A2",
    "colors": {
      "body":          { "hex": "#1a2540", "name": "Navy" },
      "lapel":         { "hex": "#a82828", "name": "Red" },
      "reinforcement": { "hex": "#1a2540", "name": "Navy" },
      "stitching":     { "hex": "#ffffff", "name": "White" }
    },
    "logos": {}
  },
  "belt": {
    "size": "A2",
    "color": { "hex": "#000000", "name": "Black" },
    "embroidery": {
      "leftEnd": "", "rightEnd": "",
      "leftFont": "Arial Black", "rightFont": "Arial Black",
      "leftThreadColor": "#ffffff", "leftThreadColorName": "White",
      "rightThreadColor": "#ffffff", "rightThreadColorName": "White"
    }
  },
  "pant": {
    "size": "A2",
    "logos": {},
    "colors": {
      "body":          { "hex": "#1a2540", "name": "Navy" },
      "reinforcement": { "hex": "#1a2540", "name": "Navy" },
      "stitching":     { "hex": "#ffffff", "name": "White" },
      "drawcord":      { "hex": "#ffffff", "name": "White" }
    }
  },
  "layers": [],
  "cameraView": "front"
}
```

Consistency rules the configurator relies on:

- `partColors.jacket` = `kimono.colors.body.hex`; `partColors.pants` =
  `pant.colors.body.hex`; `partColors.belt` = `belt.color.hex` (hydration
  reads `partColors`, displays read the part objects — set both).
- `kimono.colors` needs exactly body/lapel/reinforcement/stitching;
  `pant.colors` exactly body/reinforcement/stitching/drawcord (pants have
  a drawcord, no lapel).
- Color `name` = the catalog name when the hex matches a swatch, else
  `null`. The hex is what renders.
- `price.total` = sum of included part prices only (55/45/15); logo and
  belt-text add-ons are computed at cart time (back or back-skirt logo
  $25, other logos $10 each, each belt text $10, custom size $25).
- Belt sizes have no S/L variants (A00–A6). Kimono/pant sizes: A00–A6
  each with S/–/L (e.g. A1S, A1, A1L), plus "Custom Measurements".
  An empty size loads fine but blocks add-to-cart until chosen.
- Belt embroidery text renders UPPERCASE; fonts must be one of the five
  in the catalog (unknown names silently fall back to Arial Black).
- To exclude a part (e.g. kimono-only order): `partVisibility.pants:
  false, belt: false` and matching `included: false` + adjusted `total`
  in `price.lines`.
- `layers` is always `[]`; `kind` is `"gi"` / `"kids-gi"` / `"womens-gi"`
  per product.

## Verification before you hand over the link

```bash
curl -s "https://dspln-dawn-shopify-theme.netlify.app/api/customer-designs?id=<id>" | python3 -m json.tool
```

Check: 200, `data.design.configData.spec.partColors` matches what you
built, every image entry has a fetchable URL. If you can render the page
(browser tooling available), load the share link and confirm the model
appears with the right colors — the strongest possible check. Only then
send the link.

## Cautions

- The API is public and unauthenticated. Never enumerate other people's
  designs (`?all=1` exists for internal tooling; don't surface its
  contents to customers) and never delete a record you didn't create.
- Everything you POST is effectively public to anyone holding the id.
  Don't put customer emails or notes in `name`.
- POST with an existing id **overwrites** — modifying requires certainty
  you're holding the customer's current intent; when in doubt, new id.
