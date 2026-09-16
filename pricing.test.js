const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBooking, DEFAULT_CONFIG } = require('./pricing');
const { importPriceList } = require('./price-importer');
const { createApiController } = require('./controller');

test('calculates the complete bill in paisa', () => {
  const result = calculateBooking({ quantities: { Silver: 2, Gold: 1, Recliner: 0 }, isMember: true });
  assert.equal(result.subtotalPaisa, 62000); assert.equal(result.festivalDiscountPaisa, 5000); assert.equal(result.memberDiscountPaisa, 5700); assert.equal(result.convenienceFeeTotalPaisa, 750); assert.equal(result.gstPaisa, 9369); assert.equal(result.totalPaisa, 61419);
});
test('caps member discount and applies festival discount first', () => {
  const result = calculateBooking({ quantities: { Silver: 2 }, isMember: true }, { ...DEFAULT_CONFIG, offers: { ...DEFAULT_CONFIG.offers, MEMBER: { type: 'percentage', ratePercent: 50, capPaisa: 1000 } } });
  assert.equal(result.memberDiscountPaisa, 1000); assert.equal(result.discountedTicketsPaisa, 30000);
});
test('rejects empty, fractional, unknown, and sold-out bookings', () => {
  assert.throws(() => calculateBooking({ quantities: { Silver: 0 } }), /at least one/); assert.throws(() => calculateBooking({ quantities: { Silver: 1.5 } }), /whole number/); assert.throws(() => calculateBooking({ quantities: { Balcony: 1 } }), /Unknown/);
  const soldOut = { ...DEFAULT_CONFIG, tiers: { ...DEFAULT_CONFIG.tiers, Gold: { ...DEFAULT_CONFIG.tiers.Gold, available: false } } }; assert.throws(() => calculateBooking({ quantities: { Gold: 1 } }, soldOut), /only 0/);
});
test('does not discount more than the ticket subtotal', () => {
  const result = calculateBooking({ quantities: { Silver: 1 } }, { ...DEFAULT_CONFIG, offers: { ...DEFAULT_CONFIG.offers, FESTIVAL: { type: 'flat', amountPaisa: 999999 } } }); assert.equal(result.festivalDiscountPaisa, result.subtotalPaisa); assert.equal(result.totalPaisa, 295);
});
test('rejects malformed or unsafe tier prices', () => {
  assert.throws(() => calculateBooking({ quantities: { Silver: 1 } }, { ...DEFAULT_CONFIG, tiers: { ...DEFAULT_CONFIG.tiers, Silver: { pricePaisa: 10.5, available: true } } }), /Silver price/);
  assert.throws(() => calculateBooking({ quantities: { Silver: 2 } }, { ...DEFAULT_CONFIG, tiers: { ...DEFAULT_CONFIG.tiers, Silver: { pricePaisa: Number.MAX_SAFE_INTEGER, available: true } } }), /Silver total/);
});
test('enforces capacity and exposes availability status', () => {
  const config = { ...DEFAULT_CONFIG, tiers: { Silver: { pricePaisa: 1000, totalSeats: 2, bookedSeats: 1 } } };
  assert.equal(calculateBooking({ quantities: { Silver: 1 } }, config).ticketCount, 1);
  assert.throws(() => calculateBooking({ quantities: { Silver: 2 } }, config), /only 1/);
  assert.deepEqual(require('./pricing').getAvailability(config), [{ tier: 'Silver', pricePaisa: 1000, totalSeats: 2, bookedSeats: 1, availableSeats: 1, soldOut: false }]);
});
test('supports active offer codes and half-up GST rounding', () => {
  const config = { tiers: { Silver: { pricePaisa: 25, totalSeats: 5, bookedSeats: 0 } }, offers: { FESTIVAL: { type: 'flat', amountPaisa: 0 }, MEMBER: { type: 'percentage', ratePercent: 0, capPaisa: 0 } }, convenienceFeePaisa: 0, gstRatePercent: 18 };
  assert.equal(calculateBooking({ quantities: { Silver: 1 }, isMember: false, activeOfferCodes: [] }, config).gstPaisa, 5);
  assert.equal(calculateBooking({ quantities: { Silver: 1 }, isMember: false, activeOfferCodes: ['FESTIVAL'] }, config).totalPaisa, 30);
});
test('only applies explicitly active offers and rejects malformed offer rules', () => {
  const noOffers = calculateBooking({ quantities: { Silver: 1 }, isMember: true, activeOfferCodes: [] });
  assert.equal(noOffers.festivalDiscountPaisa, 0);
  assert.equal(noOffers.memberDiscountPaisa, 0);
  assert.throws(() => calculateBooking({ quantities: { Silver: 1 } }, { ...DEFAULT_CONFIG, offers: { FESTIVAL: { type: 'unknown', amountPaisa: 1 } } }), /offer type/);
});
test('imports messy prices, normalizes names, and deduplicates case variants', () => {
  const report = importPriceList([
    { name: ' silver ', price: '₹ 180.50' },
    { seatClass: 'SILVER', price: '181' },
    ['Gold', '$ 260.75'],
    { tier: 'RECLINER', price: 420 }
  ]);
  assert.equal(report.importedCount, 4);
  assert.equal(report.deduplicatedCount, 1);
  assert.equal(report.rejectedCount, 0);
  assert.deepEqual(report.cleanedInventory, { Silver: 18100, Gold: 26075, Recliner: 42000 });
});
test('rejects blank, null, negative, and non-numeric prices with row details', () => {
  const report = importPriceList([
    { name: 'Silver', price: null },
    { name: 'Gold', price: ' -10 ' },
    { name: 'Recliner', price: 'ten rupees' },
    { name: 'Silver', price: '12.345' },
    { name: 'Unknown', price: '10' }
  ]);
  assert.equal(report.importedCount, 5);
  assert.equal(report.rejectedCount, 5);
  assert.equal(report.rejected.length, 5);
  assert.equal(report.rejections[0].index, 0);
  assert.match(report.rejections[0].reason, /required/);
  assert.deepEqual(report.cleanedInventory, {});
});
test('accepts explicit integer paisa values', () => {
  const report = importPriceList([{ name: 'Silver', pricePaisa: 18050 }]);
  assert.deepEqual(report.cleanedInventory, { Silver: 18050 });
  const invalid = importPriceList([{ name: 'Silver', pricePaisa: 10.5 }]);
  assert.equal(invalid.rejectedCount, 1);
  assert.match(invalid.rejections[0].reason, /pricePaisa/);
});
test('controller imports prices and updates availability API prices', async () => {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const controller = createApiController(config);
  const response = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = JSON.parse(body); } };
  const requestWithBody = (body) => ({ method: 'POST', url: '/api/prices/import', on(event, handler) { if (event === 'data') handler(JSON.stringify(body)); if (event === 'end') handler(); } });
  await controller(requestWithBody({}), response);
  assert.equal(response.status, 400);
  await controller(requestWithBody({ prices: [{ name: 'silver', price: '₹ 199.99' }] }), response);
  assert.equal(response.status, 200);
  assert.equal(response.body.cleanedInventory.Silver, 19999);
  assert.equal(config.tiers.Silver.pricePaisa, 19999);
});