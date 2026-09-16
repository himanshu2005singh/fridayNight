# Architectural Reasoning & Design Decisions

## 1. Money Math & Precision Strategy
- **Integer Paisa Modeling:** Floating-point arithmetic (`IEEE 754`) introduces rounding inaccuracies (e.g., `0.1 + 0.2 = 0.30000000000000004`). To achieve 100% exact paisa precision, all internal calculations, fees, discounts, and tax values are represented as integer paisa.
- **Half-Up Rounding:** Fractional values during percentage calculations (such as Member Discount caps and 18% GST) use explicit half-up rounding (`Math.floor(value + 0.5)` logic) to prevent fractional paisa leaks.

## 2. Order of Pricing Execution
The pricing engine strictly follows a deterministic multi-stage workflow:
1. **Gross Subtotal:** Sum of base prices for all requested seat tiers in integer paisa.
2. **Flat Festival Discount:** Applied directly on the subtotal.
3. **Capped Member Discount:** Applied on the post-festival subtotal and clamped at the pre-configured upper cap limit.
4. **Convenience Fee:** Calculated per-ticket and added post-discount.
5. **GST Calculation:** Standard percentage tax applied over `(Discounted Subtotal + Convenience Fee)`.
6. **Grand Total:** Final exact-paisa payable amount.

## 3. Inventory & Error Handling
- **Race Condition & Sold-Out Guard:** Requests with invalid quantities, unknown seat tiers, or capacity overflows (requested > remaining capacity) are rejected immediately with standard HTTP 400 bad request errors before modifying state.
- **Atomic Booking:** In-memory capacity updates occur only after a successful checkout validation pass.

## 4. Trade-offs & Assumptions
- **In-Memory State:** For the timed assessment requirements, state is stored in-memory per process lifecycle to keep performance fast and dependency-free without requiring external database configuration overhead.