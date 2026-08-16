# The Block — Buyer Prototype

The buyer side of a used-vehicle auction platform, built for the OPENLANE coding challenge:
browse 200 listings, inspect a vehicle in detail, and place bids. React frontend backed by
a small read-only .NET API. The original challenge brief is preserved in git history.

## How to Run

Requires Node 20+ (built on Node 24) and the .NET 10 SDK.

```
npm install
npm run api        # terminal 1 — .NET API on http://localhost:5210
npm run dev        # terminal 2 — Vite dev server
```

Open http://localhost:5173. The dev server proxies `/api` to the .NET API, which serves
the inventory JSON and the vehicle photos (`/api/images/...`). All filtering is
server-side via LINQ over GET parameters — e.g.
`GET /api/vehicles?make=Ford&body_style=SUV&status=live&price_max=30000&q=bronco`
(`q`, `make`, `body_style`, `title_status`, `province`, `status`, `min_condition`,
`price_min`, `price_max`; unknown `status` values return 400). `GET /api/vehicles/{id}`
fetches one vehicle. If the API isn't running, the app shows a clear error state with a
retry.

Other scripts:

```
npm test           # unit tests (Vitest)
npm run build      # typecheck + production bundle to dist/
npm run preview    # serve the production build
```

To refresh the photo set from Wikimedia Commons, run `node scripts/fetch_photos.mjs`.

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
  listings would use real lot photography; credits in `api/wwwroot/images/CREDITS.md`.
- **The API is read-only.** It owns the dataset and photo mapping; bidding state stays
  client-side in localStorage. Server-side bidding endpoints are the natural next step.
  One consequence: price filters evaluate the *server's* bid figures, so a bid you just
  placed locally isn't reflected in price-range filtering until bidding moves
  server-side.
- Out of scope per the brief: auth, accounts, seller tooling, checkout, payments, backend,
  real-time multi-user bidding.

## Stack

- **Frontend:** React 19 + TypeScript (strict) on Vite; plain CSS via CSS Modules over a
  single design-token sheet (`src/styles/tokens.css`); Vitest for tests. No component,
  icon, or CSS libraries — icons are small inline SVGs. The visual language mirrors
  openlane.com: Onward navy `#0A1B5F`, OPENLANE blue `#0061FF`, silver neutrals, pill
  buttons, and Poppins (a Google Fonts stylesheet link — the one external asset — with a
  system-font fallback).
- **Backend:** .NET 10 minimal API in onion architecture (`api/`): `TheBlock.Domain`
  (entities, photo selection, auction schedule, filter rules — no dependencies),
  `TheBlock.Application` (the `InventoryService` use case behind source ports),
  `TheBlock.Infrastructure` (JSON file adapters), `TheBlock.Api` (host, endpoints,
  static images). Filtering is LINQ over GET parameters, including auction status —
  the window derivation is ported to C# with identical math so server filtering agrees
  with client rendering. `src/lib/data.ts` remains the frontend's single data seam.
- **Database:** none (the API reads the JSON file; localStorage holds the buyer's bids).

## What I Built

- **Inventory** — responsive card grid (3/2/1 across), token search over year, make,
  model, and trim, filters for make, body style, title status, province, auction status,
  minimum condition, and price range — all applied server-side (debounced GET requests),
  five client-side sorts (ending soonest with live first, price both ways, condition,
  most bids), and a clear empty state.
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
- **Photo mapping lives behind the API**: `api/Program.cs` swaps the dataset's
  placeholder URLs for vendored stock photos, preferring same-make photos from the
  body-style pool. `data/vehicles.json` itself stays untouched, and the frontend simply
  renders whatever image URLs the API returns — as it would in production.

## Testing

**Frontend (42 Vitest tests):** reserve states including the null-reserve and no-bids
cases, window stability/spread/status boundaries plus a guaranteed ended/live/upcoming
mix, all three increment tiers, bid validation (below minimum, ended, upcoming,
non-numeric), Buy Now precedence — including a test proven necessary by mutation
(reordering the buy-now check silently passed the old suite) and a guard against
`Infinity` instantly winning — plus sorting, facets, query-parameter mapping, and
countdown formatting. Run with `npm test`.

**API (36 xUnit tests, separate `TheBlock.Tests` project):** one suite per onion layer —
domain (photo gallery determinism and make preference, FNV-1a known vectors, auction
schedule bounds and boundaries, every filter rule), application (`InventoryService` with
in-memory fakes standing in for the file adapters), infrastructure (snake_case
deserialization plus the real dataset and manifest), and integration tests that boot the
real host in-memory (`WebApplicationFactory`) to verify endpoints, filtering parameters,
the 400 path, and static image serving. Run with `npm run test:api`.

## What I'd Do With More Time

- Move bidding server-side (`POST /api/vehicles/{id}/bids`) so validation and state live
  in one place instead of duplicated client-side
- Simulated competing bidders so the high-bidder state can be lost, with outbid alerts
- URL-driven state (real router) for shareable filtered views and vehicle links
- Watchlist and recently-viewed, persisted alongside bids
- Memoized cards or a virtualized grid — today the whole visible grid re-renders on the
  shared 1-second clock, fine at 200 vehicles but not at 20,000
- Component and E2E tests (Testing Library / Playwright) on top of the unit suite
- A real image pipeline (srcset, blur-up placeholders) once photography replaces
  placeholders
