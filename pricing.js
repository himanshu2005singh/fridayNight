(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./errors'));
  else root.PricingEngine = factory(root.PricingErrors);
})(typeof globalThis === 'object' ? globalThis : this, function (pricingErrors) {
  const DEFAULT_CONFIG = {
    tiers: {
      Silver: { pricePaisa: 18000, totalSeats: 80, bookedSeats: 0 },
      Gold: { pricePaisa: 26000, totalSeats: 60, bookedSeats: 0 },
      Recliner: { pricePaisa: 42000, totalSeats: 30, bookedSeats: 0 }
    },
    offers: {
      FESTIVAL: { type: 'flat', amountPaisa: 5000 },
      MEMBER: { type: 'percentage', ratePercent: 10, capPaisa: 12000 }
    },
    festivalDiscountPaisa: 5000, memberRatePercent: 10,
    memberDiscountCapPaisa: 12000, convenienceFeePaisa: 250, gstRatePercent: 18
  };

  const InvalidBookingError = pricingErrors.InvalidBookingError;
  const SoldOutTierError = pricingErrors.SoldOutTierError;

  function fail(message) { throw new InvalidBookingError(message); }

  function assertPaisa(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) fail(field + ' must be a non-negative whole number of paisa');
    return value;
  }

  function addPaisa(left, right, field) {
    return assertPaisa(left + right, field);
  }

  function multiplyPaisa(left, right, field) {
    return assertPaisa(left * right, field);
  }

  class SeatTier {
    constructor(name, pricePaisa, totalSeats, bookedSeats) {
      this.name = name; this.pricePaisa = pricePaisa; this.totalSeats = totalSeats; this.bookedSeats = bookedSeats || 0;
    }
  }

  class Offer {
    constructor(code, type, value, capPaisa) {
      this.code = code; this.type = type;
      if (type === 'flat') this.amountPaisa = value;
      if (type === 'percentage') { this.ratePercent = value; this.capPaisa = capPaisa; }
    }
  }

  class BookingRequest {
    constructor(quantities, isMember, activeOfferCodes) {
      this.quantities = quantities; this.isMember = isMember === true; this.activeOfferCodes = activeOfferCodes;
    }
  }

  class BillReceipt {
    constructor(values) { Object.assign(this, values); }
  }

  function getAvailableSeats(tier, tierName) {
    if (tier.available === false) return 0;
    if (tier.totalSeats === undefined && tier.bookedSeats === undefined) return Number.MAX_SAFE_INTEGER;
    if (!Number.isSafeInteger(tier.totalSeats) || tier.totalSeats < 0) fail(tierName + ' total seats must be a non-negative whole number');
    if (!Number.isSafeInteger(tier.bookedSeats) || tier.bookedSeats < 0 || tier.bookedSeats > tier.totalSeats) fail(tierName + ' booked seats must be within capacity');
    return tier.totalSeats - tier.bookedSeats;
  }

  function getAvailability(config) {
    return Object.keys(config.tiers || {}).map(function (name) {
      const tier = config.tiers[name]; const availableSeats = getAvailableSeats(tier, name);
      assertPaisa(tier.pricePaisa, name + ' price');
      return { tier: name, pricePaisa: tier.pricePaisa, totalSeats: tier.totalSeats, bookedSeats: tier.bookedSeats || 0, availableSeats, soldOut: availableSeats === 0 };
    });
  }

  function validateOffer(offer, code) {
    if (!offer || (offer.type !== 'flat' && offer.type !== 'percentage')) fail(code + ' offer type must be flat or percentage');
    if (offer.type === 'flat') assertPaisa(offer.amountPaisa || 0, code + ' discount');
    if (offer.type === 'percentage') {
      percentToBasisPoints(offer.ratePercent || 0, code + ' rate');
      assertPaisa(offer.capPaisa || 0, code + ' discount cap');
    }
    return offer;
  }

  function percentToBasisPoints(value, field) {
    const text = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) fail(field + ' must be a valid percentage');
    const parts = text.split('.');
    const basisPoints = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0') || 0);
    if (basisPoints > 10000) fail(field + ' cannot exceed 100%');
    return basisPoints;
  }

  function roundDivide(numerator, denominator) { return Math.floor((numerator + denominator / 2) / denominator); }

  function calculateBooking(booking, suppliedConfig) {
    const config = suppliedConfig || DEFAULT_CONFIG;
    if (!booking || !booking.quantities || typeof booking.quantities !== 'object') fail('Ticket quantities are required');
    const tiers = config.tiers || {};
    const lineItems = [];
    let ticketCount = 0; let subtotalPaisa = 0;
    Object.keys(booking.quantities).forEach(function (tierName) {
      const quantity = booking.quantities[tierName];
      if (!Object.prototype.hasOwnProperty.call(tiers, tierName)) fail('Unknown ticket tier: ' + tierName);
      if (!Number.isSafeInteger(quantity) || quantity < 0) fail(tierName + ' quantity must be a non-negative whole number');
      if (!tiers[tierName]) fail(tierName + ' tier configuration is required');
      assertPaisa(tiers[tierName].pricePaisa, tierName + ' price');
      const availableSeats = getAvailableSeats(tiers[tierName], tierName);
      if (quantity > availableSeats) throw new SoldOutTierError(tierName, availableSeats);
      const amountPaisa = multiplyPaisa(quantity, tiers[tierName].pricePaisa, tierName + ' total');
      if (quantity > 0) lineItems.push({ tier: tierName, quantity, unitPricePaisa: tiers[tierName].pricePaisa, amountPaisa });
      ticketCount = addPaisa(ticketCount, quantity, 'Ticket count');
      subtotalPaisa = addPaisa(subtotalPaisa, amountPaisa, 'Ticket subtotal');
    });
    if (ticketCount === 0) fail('Select at least one ticket');
    const activeCodes = booking.activeOfferCodes === undefined ? null : booking.activeOfferCodes;
    if (activeCodes !== null && (!Array.isArray(activeCodes) || activeCodes.some((code) => typeof code !== 'string'))) fail('Active offer codes must be an array of strings');
    const isOfferActive = (code) => activeCodes === null || activeCodes.includes(code);
    const festivalOffer = validateOffer((config.offers && config.offers.FESTIVAL) || { type: 'flat', amountPaisa: config.festivalDiscountPaisa || 0 }, 'FESTIVAL');
    const festivalRequested = isOfferActive('FESTIVAL') ? (festivalOffer.amountPaisa || 0) : 0;
    assertPaisa(festivalRequested, 'Festival discount');
    const festivalDiscountPaisa = Math.min(festivalRequested, subtotalPaisa);
    const afterFestivalPaisa = subtotalPaisa - festivalDiscountPaisa;
    const memberOffer = validateOffer((config.offers && config.offers.MEMBER) || { type: 'percentage', ratePercent: config.memberRatePercent || 0, capPaisa: config.memberDiscountCapPaisa || 0 }, 'MEMBER');
    const member = booking.isMember === true && isOfferActive('MEMBER');
    const memberRateBasisPoints = percentToBasisPoints(memberOffer.ratePercent || 0, 'Member rate');
    const memberCapPaisa = memberOffer.capPaisa || 0;
    assertPaisa(memberCapPaisa, 'Member discount cap');
    const calculatedMemberPaisa = member ? roundDivide(multiplyPaisa(afterFestivalPaisa, memberRateBasisPoints, 'Member discount calculation'), 10000) : 0;
    const memberDiscountPaisa = Math.min(calculatedMemberPaisa, memberCapPaisa);
    const discountedTicketsPaisa = afterFestivalPaisa - memberDiscountPaisa;
    const feePaisa = config.convenienceFeePaisa || 0;
    assertPaisa(feePaisa, 'Convenience fee');
    const convenienceFeeTotalPaisa = multiplyPaisa(ticketCount, feePaisa, 'Convenience fee total');
    const gstRateBasisPoints = percentToBasisPoints(config.gstRatePercent || 0, 'GST rate');
    const taxablePaisa = discountedTicketsPaisa + convenienceFeeTotalPaisa;
    const gstPaisa = roundDivide(multiplyPaisa(taxablePaisa, gstRateBasisPoints, 'GST calculation'), 10000);
    return new BillReceipt({ lineItems, ticketCount, subtotalPaisa, festivalDiscountPaisa, memberDiscountPaisa, discountedTicketsPaisa, convenienceFeeTotalPaisa, gstPaisa, totalPaisa: addPaisa(taxablePaisa, gstPaisa, 'Booking total') });
  }

  return { DEFAULT_CONFIG, SeatTier, Offer, BookingRequest, BillReceipt, calculateBooking, getAvailability };
});