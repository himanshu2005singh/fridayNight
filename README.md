# Friday night at the multiplex

A dependency-free cinema pricing engine and booking-counter UI. All monetary calculations are performed in integer paisa.

## Run

```bash
npm test
npm start
```

Then open `http://localhost:4173` in a browser.

## API

- `GET /api/availability` returns each tier's price, capacity, booked seats, remaining seats, and sold-out status.
- `POST /api/checkout` accepts `{ "quantities": { "Silver": 2 }, "isMember": true, "activeOfferCodes": ["FESTIVAL", "MEMBER"] }` and returns the exact-paisa receipt. A successful checkout updates in-memory booked seats for the running process.
- `POST /api/prices/import` accepts `{ "prices": [{ "name": "silver", "price": "₹ 180.50" }] }` and returns `importedCount`, `deduplicatedCount`, `rejectedCount`, row-level `rejected` details, and `finalCleanedPrices`. Accepted prices update the running tier configuration.

## API

`GET /api/availability` returns every tier's price, capacity, booked seats,
remaining seats, and sold-out status.

`POST /api/checkout` accepts a JSON `BookingRequest`:

```json
{
	"quantities": { "Silver": 2, "Gold": 1, "Recliner": 0 },
	"isMember": true,
	"activeOfferCodes": ["FESTIVAL", "MEMBER"]
}
```

The response is a line-by-line `BillReceipt` in paisa. Invalid JSON, unknown
tiers, sold-out/capacity-overflow requests, and invalid money/configuration
values return HTTP 400 with an `error` message.

## Pricing rules

Tickets are subtotalled first, then the flat festival discount and capped member discount are applied. A convenience fee is charged per ticket, and GST is calculated on the discounted tickets plus fees. The engine rejects invalid quantities, unavailable tiers, capacity overflow, and bookings with no tickets. All money is represented as safe integer paisa and percentage calculations use explicit half-up rounding.