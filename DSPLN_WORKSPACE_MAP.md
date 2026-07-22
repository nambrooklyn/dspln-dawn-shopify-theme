# DSPLN Workspace Map (DTC theme + configurator)

The single source of truth for **where everything lives and how it flows**.
If a location isn't listed here, don't guess — add it here first.

Scope: the DTC Shopify theme + configurator. The B2B app and factory
portal are separate projects (their own folders/repos), listed at the
bottom for orientation only.

---

## The mental model (read this first)

- **GitHub is the truth.** Local folders are just snapshots from your last
  `git pull`. Netlify and Shopify are outputs of GitHub, never inputs.
- **Two working folders is intentional** — one for `dev`, one for `main`.
  Each folder is pinned to ONE branch. Never switch a folder's branch.
- **Multiple actors push to `dev`** (you locally, cloud agents, other
  agents). So: **`git pull` before you work, `git push` after.** A folder
  you haven't pulled is stale — that is the #1 cause of "it's different
  everywhere," not the folder structure.

---

## Local folders (your Mac)

| Folder | Pinned branch | Purpose | You edit here? |
|---|---|---|---|
| `dspln-dev-store/` | `dev` | **Work + test happens here.** | ✅ yes |
| `dspln-dawn-shopify-theme/` | `main` | Production working copy; receives approved work via promotion. | ⚠️ rarely — mostly read/promote |
| `dspln-b2b-app/` | (its own repo) | B2B print-on-demand app — separate project. | separate |
| `dspln-factory-portal/` | (its own repo, Supabase) | Internal order-tracking portal (you→factory→ship). | separate |

Golden rule: **the folder name tells you the branch.** `dspln-dev-store`
is always `dev`. `dspln-dawn-shopify-theme` is always `main`. Don't
`git checkout` a different branch inside either.

---

## GitHub: `nambrooklyn/dspln-dawn-shopify-theme`

| Branch | Who writes it | Touch it? |
|---|---|---|
| `dev` | You + agents, from `dspln-dev-store/`. | ✅ edit via the dev folder |
| `main` | Promotion from `dev` (merge). | ⚠️ only to promote |
| `dev-store-theme` | **Machine** — `mirror-dev-theme.yml` force-pushes a filtered slice. | ❌ never open/edit |
| `main-store-theme` | **Machine** — `mirror-live-theme.yml` + Shopify theme-editor write-backs. | ❌ never edit locally |
| `claude/…`, feature branches | Agents' in-progress work before merging to `dev`. | context only |

The two `*-store-theme` branches are **exhaust, not source**. They're a
slim, filtered copy so Shopify has something small to sync from. They will
never look identical to your folders — that's by design (they drop the
configurator app; `main-store-theme` carries code files only).

---

## Netlify (hosting — outputs of GitHub, auto-built)

| Trigger branch | URL | What it is |
|---|---|---|
| `dev` | `dev--dspln-dawn-shopify-theme.netlify.app` | Dev configurator + **The Locker** (`/locker`). |
| `main` | production Netlify site of same repo | Production configurator build. |

Branch deploys are enabled for `main` and `dev` only. Never deploy via
Netlify CLI or dashboard — only GitHub pushes deploy (per AGENTS.md).

> Note: the configurator embedded on **live dspln.com** is a *separate*
> repo/deploy (`dspln/dtc-configurator` → `dspln-dtc-configurator2`). This
> Dawn-local `configurator-app/` is the theme-repo copy used for dev.

---

## Shopify stores

| Store | Domain | Syncs its theme from |
|---|---|---|
| **DEV** | `dspln-dev-2.myshopify.com` | `dev-store-theme` branch |
| **LIVE** | `dspln.com` (`f39242.myshopify.com`) | `main-store-theme` branch |

- DEV store runs Shopify's **new (hosted) customer accounts** — no legacy
  option. `/account` redirects to shopify.com. Theme `templates/customers/*`
  do NOT render there. (Why The Locker exists.)
- LIVE store still runs legacy accounts today.
- Never edit theme files in a store's Shopify theme editor — the mirror
  force-pushes and overwrites them.

---

## The flow (one push, end to end)

```
EDIT in dspln-dev-store/ (branch dev)
   │  git push origin dev
   ▼
GitHub: dev ──► mirror-dev-theme.yml ──► dev-store-theme ──► DEV Shopify store
   │                                     (review here)
   └──────────► Netlify dev build ──► dev--…netlify.app/locker
   │
   ▼  (only after you approve on the DEV store, and say "promote to live")
PROMOTE: merge dev ──► main
   │
GitHub: main ──► mirror-live-theme.yml ──► main-store-theme ──► LIVE store (dspln.com)
   └───────────► Netlify prod build
```

Lag is normal at each arrow (push → action → Shopify sync each take a
moment). If something looks "not updated," check which arrow you're
waiting on before assuming it's broken.

---

## Golden rules (the whole thing in six lines)

1. **GitHub is the truth**; local folders are snapshots.
2. **`git pull` before work, `git push` after** — always (agents push too).
3. **Folder name = branch.** Never switch a folder's branch.
4. **Never touch** `dev-store-theme` / `main-store-theme` (machine-owned).
5. **Never edit** in a Shopify theme editor (mirror overwrites it).
6. **Promotion to live** = merge `dev`→`main`, and only on the explicit
   words "promote to live" after a dev-store review.
