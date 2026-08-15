# The Block — Buyer Prototype

The buyer side of a used-vehicle auction platform, built for the OPENLANE coding challenge:
browse 200 listings, inspect a vehicle in detail, and place bids. Frontend-only prototype.
The original challenge brief is preserved in git history.

## How to Run

Requires Node 20+ (built on Node 24).

```
npm install
npm run dev
```

Open http://localhost:5173. Other scripts:

```
npm test           # unit tests (Vitest)
npm run build      # typecheck + production bundle to dist/
npm run preview    # serve the production build
```

The dataset ships in the repo (`data/vehicles.json`) and is bundled at build time — no
backend needed. Vehicle photos are vendored in `public/vehicles/` (network only improves
the Poppins font, which falls back to system fonts offline). To refresh the photo set
from Wikimedia Commons, run `node scripts/fetch_photos.mjs`.

## Time Spent

About 4 hours, built domain-first: types, auction rules, and tests before any UI, then the
inventory grid, filters, detail view, bid flow, and a final polish pass against real
screenshots at desktop/tablet/mobile widths.

## Assumptions and Scope

- **`current_bid` is null for 112 of 200 vehicles** (the ones with `bid_count: 0`). The
  brief's example shows a number, but the data is authoritative: the type is
  `number | null`. Before any bids exist, the minimum acceptable bid is the opening ask
  (no increment), a reserve cannot be met, and the UI labels the price "Starting bid".
- **Auction windows are derived, not read.** `auction_start` is synthetic, so each
  vehicle's id hashes to an end time spread across two days before to five days after
  "now" (anchored to local midnight), with a 2–4 day duration. Windows are stable across
  reloads within a day and re-seed at midnight, so the inventory always shows a live mix
  of ended, live, and upcoming auctions.
- **A bid at or above the Buy Now price wins immediately at the Buy Now price**, even if
  it would fail the minimum-increment check — the instant-win rule takes precedence.
- **Single anonymous buyer.** Your bids persist in localStorage and mark you high bidder;
  there are no competing bidders advancing prices. "Reset bids" (header) clears the slate.
- **Currency is CAD** (`en-CA`) since every listing is Canadian — one constant in
  `src/lib/format.ts` switches it.
- **Photos are representative, not the actual lot.** 50 free-license photos (10 per body
  style, modern generations) are fetched from Wikimedia Commons and mapped
  deterministically per vehicle id, preferring photos of the vehicle's own make. Real
  listings would use real lot photography; credits in `public/vehicles/CREDITS.md`.
- Out of scope per the brief: auth, accounts, seller tooling, checkout, payments, backend,
  real-time multi-user bidding.

## Stack

- **Frontend:** React 19 + TypeScript (strict) on Vite; plain CSS via CSS Modules over a
  single design-token sheet (`src/styles/tokens.css`); Vitest for tests. No component,
  icon, or CSS libraries — icons are small inline SVGs. The visual language mirrors
  openlane.com: Onward navy `#0A1B5F`, OPENLANE blue `#0061FF`, silver neutrals, pill
  buttons, and Poppins (a Google Fonts stylesheet link — the one external asset — with a
  system-font fallback).
- **Backend:** none. `src/lib/data.ts` is the single seam that imports the JSON and
  returns typed `Vehicle[]` — a real API would plug in there.
- **Database:** none (localStorage for the buyer's bids).

## What I Built

- **Inventory** — responsive card grid (3/2/1 across), token search over year, make,
  model, and trim, filters for make, body style, title status, province, auction status,
  minimum condition, and price range, five sorts (ending soonest with live first, price
  both ways, condition, most bids), and a clear empty state.
- **Detail view** — image gallery with thumbnails and graceful fallback art, full specs,
  condition grade with report and damage notes, a warning banner for salvage or rebuilt
  titles, seller and location, and the auction panel.
- **Bidding** — live countdowns on a shared clock, tiered minimum increments, validation
  with buyer-facing reasons, a persistent "You're the high bidder" state, Buy Now with a
  distinct sold/purchase-price presentation, and bids that survive refresh.

## Notable Decisions

- **Domain rules live in pure functions** (`src/lib/auction.ts`), fully separate from
  React — reserve state, window derivation, increments, validation, and bid resolution
  are all unit-tested without rendering anything. Components stay thin.
- **The reserve amount is never rendered** — only its state (No reserve / Reserve met /
  Reserve not met), matching how real auction platforms guard seller data.
- **Price filtering and sorting use the "competing price"** — the high bid, or the
  opening ask when there are no bids — so unbid vehicles don't sort as free.
- **Buy Now is a purchase, not a bid**: it doesn't inflate the bid count, and the vehicle
  presents as "Sold" with a purchase price everywhere.
- **One clock at the app root** (`useNow`) drives every countdown and status, so a card
  and its detail view can never disagree about liveness.
- **Photo mapping lives behind the data seam**: `src/lib/data.ts` swaps the dataset's
  placeholder URLs for vendored stock photos via `src/lib/images.ts`, which prefers
  same-make photos from the body-style pool. The JSON itself stays untouched, and a real
  API's photo URLs would drop in at the same seam.

## Testing

43 Vitest unit tests across the domain layer: reserve states including the null-reserve
and no-bids cases, window stability/spread/status boundaries plus a guaranteed
ended/live/upcoming mix, all three increment tiers, bid validation (below minimum, ended,
upcoming, non-numeric), Buy Now precedence — including a test proven necessary by
mutation (reordering the buy-now check silently passed the old suite) and a guard against
`Infinity` instantly winning — plus search, filter, sort, and countdown formatting.

## What I'd Do With More Time

- Simulated competing bidders so the high-bidder state can be lost, with outbid alerts
- URL-driven state (real router) for shareable filtered views and vehicle links
- Watchlist and recently-viewed, persisted alongside bids
- Memoized cards or a virtualized grid — today the whole visible grid re-renders on the
  shared 1-second clock, fine at 200 vehicles but not at 20,000
- Component and E2E tests (Testing Library / Playwright) on top of the unit suite
- A real image pipeline (srcset, blur-up placeholders) once photography replaces
  placeholders
