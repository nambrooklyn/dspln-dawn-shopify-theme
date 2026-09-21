# Academy billing — Stripe setup

Academy plans are Stripe subscriptions owned by the academy's organization,
handled by Better Auth's Stripe plugin (`netlify/lib/auth.mjs`,
`academyBilling()`). One Stripe customer per academy: the plan bills it
monthly, and each production order (Phase 3) bills the same card off-session.

## Environment variables (Netlify → Site configuration → Environment variables)

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | Secret key. Test key on the `dev` branch context, live key on production |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the webhook endpoint below (one per Stripe mode) |
| `STRIPE_PRICE_ACADEMY_STARTER` | Price id of Starter "Logo It", $49 / month |
| `STRIPE_PRICE_ACADEMY_CUSTOM` | Price id of Custom "Customize It", $89 / month |
| `STRIPE_PRICE_ACADEMY_PRIVATE_LABEL` | Price id of Private Label "Brand It", $199 / month |

Billing switches itself off (the Billing tab says so) when the keys or all
three price ids are missing, so a deploy without them still works.

## Webhook endpoint

`https://<locker host>/api/auth/stripe/webhook`, for example
`https://locker.dspln.com/api/auth/stripe/webhook` (live) and
`https://dev--dspln-dawn-shopify-theme.netlify.app/api/auth/stripe/webhook`
(test). Events: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

## Database

`platform.subscription` and `stripe_customer_id` on `user` come from
`b2b-platform` migration 0001 (already applied). Migration 0003
(`platform/migrations/0003_stripe_subscriptions.sql`) adds
`organization.stripe_customer_id` and the remaining subscription columns.
Run it before turning billing on.

## How the card on file works

Checkout collects a card (`payment_method_collection: always`). When the
subscription completes, `onSubscriptionComplete` copies the subscription's
payment method to the customer's `invoice_settings.default_payment_method`,
so an off-session `PaymentIntent` with `customer` + `off_session: true` finds
it. The academy changes the card in Stripe's billing portal ("Manage card and
invoices" in the Billing tab).
