(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PricingErrors = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  class PricingError extends Error {
    constructor(message, code) {
      super(message);
      this.name = this.constructor.name;
      this.code = code;
    }
  }

  class InvalidBookingError extends PricingError {
    constructor(message) { super(message, 'INVALID_BOOKING'); }
  }

  class SoldOutTierError extends PricingError {
    constructor(tier, availableSeats) {
      super(tier + ' has only ' + availableSeats + ' seat(s) available', 'SOLD_OUT_TIER');
      this.tier = tier;
      this.availableSeats = availableSeats;
    }
  }

  return { PricingError, InvalidBookingError, SoldOutTierError };
});
