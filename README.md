# The Block — Buyer Prototype

The buyer side of a used-vehicle auction platform, built for the OPENLANE coding challenge:
browse 100,000 listings, inspect a vehicle in detail, and place bids. React frontend backed
by a .NET 10 API that owns the data, the search, and the auction rules. The original
challenge brief is preserved in git history.

## How to Run

Requires Node 20+ (built on Node 24) and the .NET 10 SDK.

```
npm install
npm start          # API + frontend in one command; opens the browser
```

(Or separately: `npm run api` and `npm run dev` in two terminals.)

Open http://localhost:5173. The dev server proxies `/api` to the .NET API, which serves
the inventory and the vehicle photos (`/api/images/...`). The inventory is **100,000
records**, deterministically synthesized at startup from the 200-record seed dataset
(`Inventory:TargetCount` in `api/TheBlock.Api/appsettings.json`) — no giant file in the
repo. All filtering, sorting, and paging are server-side via LINQ over GET parameters;
the landing page is the top 100 by auction time (live, ending soonest first):

```
GET /api/vehicles?make=Ford&status=live&sort=price-asc&limit=100
```

Parameters: `q` (matches every filterable field, including derived auction status),
`make`, `body_style`, `title_status`, `province`, `status` (+ `anchor_ms`),
`min_condition`, `price_min`, `price_max`, `sort` (ending-soonest, price-asc,
price-desc, condition, most-bids), `limit` (default 100, max 500), `offset`. Responses
are an envelope `{ total, vehicles }`, each vehicle carrying server-derived auction
facts (`auction_starts_at`, `auction_ends_at`, `auction_status`, `min_next_bid`);
invalid `status`/`sort`/`anchor_ms` return 400. `GET /api/vehicles/{id}` fetches one
vehicle; `GET /api/facets` feeds the filter dropdowns from the full dataset.

Bidding is server-side and validated by the domain rules:
`POST /api/vehicles/{id}/bids` `{ amount, anchor_ms }` → accepted/won or 400 with a
reason; `POST /api/vehicles/{id}/buy-now`; `GET /api/bids` (the single anonymous
buyer's standing); `DELETE /api/bids` (reset). Bid state lives in API memory and is
overlaid on vehicles BEFORE filtering, so price filters see what the UI shows. If the
API isn't running, the app shows a clear error state with a retry.

Other scripts:

```
npm test           # frontend unit tests (Vitest)
npm run test:api   # API unit + integration tests (xUnit)
npm run test:e2e   # end-to-end smokes (Playwright; starts both servers itself)
npm run build      # typecheck + production bundle to dist/
npm run preview    # serve the production build
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs all three suites on every push.

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
- **The API owns everything**: data, filtering, sorting, paging, photo mapping, auction
  scheduling, and bid validation. The browser formats, counts down, and relays actions.
  Bid state is in API memory for a single anonymous buyer (no auth by design — isolated
  demo); it survives browser reloads but not an API restart.
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
- **Database:** none (the API reads the JSON file; bid state lives in API memory).

## What I Built

- **Inventory** — responsive card grid (3/2/1 across), token search over year, make,
  model, and trim, filters for make, body style, title status, province, auction status,
  minimum condition, and price range — all applied server-side (debounced GET requests),
  five server-side sorts (ending soonest with live first, price both ways, condition,
  most bids), Load More paging, and a clear empty state.
- **Detail view** — image gallery with thumbnails and graceful fallback art, full specs,
  condition grade with report and damage notes, a warning banner for salvage or rebuilt
  titles, seller and location, and the auction panel.
- **Bidding** — live countdowns on a shared clock, tiered minimum increments, validation
  with buyer-facing reasons, a persistent "You're the high bidder" state, Buy Now with a
  distinct sold/purchase-price presentation, and bids that survive refresh.

## Strengths

- **GET-parameter-driven filtering and navigation.** Every filter, the text search,
  sorting, and paging are query parameters on `GET /api/vehicles`, applied server-side
  with LINQ — and the browser's address bar mirrors the same parameters, so any filtered
  view is shareable and bookmarkable. Opening a vehicle is GET navigation too
  (`?vehicle={id}` pushes a history entry): the browser's Back button closes the detail,
  Forward reopens it, and a cold load of a vehicle URL deep-links straight to it.
  *Where:* `src/lib/inventory.ts` (URL ↔ filter serialization), `src/App.tsx`
  (pushState/popstate), `api/TheBlock.Api/VehicleQueryParams.cs` (binding),
  `api/TheBlock.Domain/VehicleFilter.cs` (the LINQ predicate).
- **Debounced, cached requests.** Filter changes debounce 500 ms so typing doesn't
  hammer the API, and responses are cached per query string (5-minute TTL, bounded).
  Cache hits skip the debounce entirely — the delay only exists to protect the server,
  and a hit never touches it.
  *Where:* `src/lib/data.ts` (cache, `peekVehicles`), `src/App.tsx` (the debounced
  fetch effect), `api/TheBlock.Api/Program.cs` (`Cache-Control` on photos).
- **Server-side pagination at scale.** 100,000 records, but the wire only ever carries a
  page: an envelope of `{ total, vehicles }` with `limit`/`offset`, a landing page of
  the top 100 by auction time, and Load More to walk deeper.
  *Where:* `api/TheBlock.Application/InventoryService.cs` (`Search`),
  `api/TheBlock.Infrastructure/SyntheticVehicleSource.cs` (the 100k expansion),
  `src/App.tsx` (`loadMore`).
- **One authoritative home for every business rule.** Auction windows, status, minimum
  increments, bid validation, buy-now precedence — all live in `TheBlock.Domain` and
  nowhere else. The wire carries the derived facts (`auction_ends_at`, `min_next_bid`,
  …) so the browser only formats and counts down. This wasn't free: early versions
  mirrored the math in TypeScript, and cross-language drift bit twice (a timezone
  anchor, then DST) before the consolidation — the architecture exists because the bug
  class it eliminates actually happened.
  *Where:* `api/TheBlock.Domain/AuctionSchedule.cs`, `BidRules.cs`, and
  `AuctionClock.cs`; `api/TheBlock.Api/VehicleWire.cs` (derived facts onto the wire);
  `src/lib/auction.ts` (all that remains client-side).
- **Onion architecture that earns its layers.** Domain has zero dependencies;
  Application talks through ports (`IVehicleSource`, `IPhotoManifestSource`);
  Infrastructure adapts files; the host only binds and serializes. The proof it's not
  ceremony: the 100k scale-up is a decorator on a port (`SyntheticVehicleSource`) —
  nothing above it changed — and the test suite swaps in-memory fakes at the same seams.
  *Where:* `api/TheBlock.Domain/` → `api/TheBlock.Application/` (`Ports.cs`,
  `InventoryService.cs`, `BidService.cs`) → `api/TheBlock.Infrastructure/` →
  `api/TheBlock.Api/Program.cs` (composition root); fakes in
  `api/TheBlock.Tests/InventoryServiceTests.cs`.

## Notable Decisions

- **Domain rules live in pure functions**, fully separate from any framework — window
  derivation, increments, validation, and bid resolution in `api/TheBlock.Domain`
  (unit-tested without hosting anything), reserve display and status recomputation in
  `src/lib/auction.ts` (unit-tested without rendering anything). Components stay thin.
- **The reserve amount is never rendered** — only its state (No reserve / Reserve met /
  Reserve not met), matching how real auction platforms guard seller data.
- **Price filtering and sorting use the "competing price"** — the high bid, or the
  opening ask when there are no bids — so unbid vehicles don't sort as free.
- **Buy Now is a purchase, not a bid**: it doesn't inflate the bid count, and the vehicle
  presents as "Sold" with a purchase price everywhere.
- **One clock at the app root** (`useNow`) drives every countdown and status, so a card
  and its detail view can never disagree about liveness.
- **Query requests are debounced (500 ms) and cached (5 min, per query string,
  bounded)** in the data seam. The debounce only exists to avoid hammering the API, so
  cache hits skip it entirely — revisited filter combinations render instantly. Refresh
  paths (retry buttons, the periodic status-filter refresh) bypass the cache; photos
  carry `Cache-Control: public, max-age=86400` so the browser's HTTP cache keeps them.
- **Photo mapping lives behind the API**: `api/Program.cs` swaps the dataset's
  placeholder URLs for vendored stock photos, preferring same-make photos from the
  body-style pool. `data/vehicles.json` itself stays untouched, and the frontend simply
  renders whatever image URLs the API returns — as it would in production.

## Testing

**API (80 xUnit tests, separate `TheBlock.Tests` project):** one suite per onion layer —
domain (photo gallery determinism and make preference, FNV-1a known vectors, auction
schedule bounds and boundaries, every filter rule, bid rules including increment tiers
and buy-now precedence), application (`InventoryService`/`BidService` with in-memory
fakes standing in for the file adapters), infrastructure (snake_case deserialization,
the synthetic 100k expansion's invariants, the real dataset and manifest), and
integration tests that boot the real host in-memory (`WebApplicationFactory`) to verify
endpoints, filtering/sorting/paging parameters, the 400 paths, the full bid lifecycle,
and static image serving. Run with `npm run test:api`.

**Frontend (27 Vitest tests):** presentation logic only, since the API owns the rules —
status recomputation from server windows, reserve states, formatting and countdowns,
URL/filter round-tripping, query-parameter mapping, and the request cache (TTL, per-key,
forced bypass, no caching of failures). Run with `npm test`.

**End-to-end (4 Playwright smokes):** the real stack — landing page shows 100 of
100,000, filtering syncs the URL both directions, Load More appends a page, and a bid
round-trips through the API, survives a reload, and resets. Run with `npm run test:e2e`.
All three suites run in CI on every push.

## What I'd Do With More Time

In priority order:

1. **Consistent coding and commenting styles, documented** — `docs/STYLE.md` (naming,
   layering rules, comments that explain *why and how*, never *what*) and
   `docs/ARCHITECTURE.md` (the onion, the wire contract, the derive-don't-store
   principle), enforced with `.editorconfig` and formatters rather than convention alone.
2. **Error handling** — a global exception handler returning RFC 7807 ProblemDetails
   (unhandled exceptions currently surface as shapeless 500s), one unified 400 body
   (queries return `{ error }`, bids return `{ reason }` today), structured request
   logging, and a React error boundary so a render crash degrades instead of
   white-screening.
3. **Code review** — a full adversarial review pass against the written style guide; the
   codebase has roughly tripled since the last one.
4. **Hosting (AWS or Azure)** — likely Azure App Service as a single deployable, with
   the API serving the built SPA: the frontend already calls relative `/api` paths, so
   same-origin hosting needs no code changes, and a single instance matches the
   in-memory bid state honestly.

And beyond that:

- Real-time updates (Server-Sent Events): push bid changes and auction closes so
  countdowns rotate expired rows out and "you've been outbid" moments become possible
- Auth and per-user bid state, persisted — the single anonymous in-memory buyer is the
  demo shortcut
- Simulated competing bidders so the high-bidder state can be lost, with outbid alerts
- Search indexing: precompute each vehicle's lowercase haystack at startup instead of
  rebuilding it per request (the biggest lever on the ~300 ms full-scan query)
- A virtualized grid once Load More accumulates thousands of rows
- Focus management on view switches (the detail page should receive keyboard focus),
  plus a fuller accessibility audit
- A real image pipeline (srcset, blur-up placeholders) once photography replaces the
  representative stock photos
