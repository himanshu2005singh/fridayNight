# Friday night at the multiplex

A dependency-free cinema pricing engine and booking-counter UI. All monetary calculations are performed in integer paisa to eliminate floating-point precision errors.

## Run

```bash
npm test
npm start
Then open http://localhost:4173 in a browser.

API Endpoints
GET /api/availability
Returns each tier's price, capacity, booked seats, remaining seats, and sold-out status.

POST /api/checkout
Accepts a JSON BookingRequest:

JSON
{
  "quantities": { "Silver": 2, "Gold": 1, "Recliner": 0 },
  "isMember": true,
  "activeOfferCodes": ["FESTIVAL", "MEMBER"]
}
Returns a line-by-line BillReceipt in exact integer paisa. Invalid JSON, unknown tiers, sold-out/capacity-overflow requests, and invalid money/configuration values return HTTP 400 with an error message.

POST /api/prices/import
Accepts a JSON payload of messy seat prices:

JSON
{
  "prices": [
    { "name": "silver", "price": "₹ 180.50" },
    { "name": "SILVER", "price": "180.50" },
    { "name": "Gold", "price": "-200" }
  ]
}
Normalizes casing, parses dirty formats, rejects invalid/blank/negative values, and returns importedCount, deduplicatedCount, rejectedCount, row-level rejected details, and finalCleanedPrices.

Business & Pricing Rules
Integer Paisa Math: All monetary values are represented as safe integer paisa (1 INR = 100 paisa). Percentage calculations (GST, discounts) use explicit half-up rounding.

Order of Calculations: Tickets are subtotaled first -> Flat festival discount & capped member discount applied -> Per-ticket convenience fee added -> 18% GST calculated on taxable base (discounted tickets + fees).

Validation Guards: The engine rejects zero-ticket bookings, unavailable/sold-out tiers, capacity overflows, blank values, and negative prices.

Messy Data Import (The Twist): Sanitizes case-insensitive duplicate tiers, strips currency symbols (₹, INR), trims whitespace, and generates execution reports.