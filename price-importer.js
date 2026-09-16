const { InvalidBookingError } = require('./errors');

const NAME_ALIASES = new Map([
  ['silver', 'Silver'],
  ['gold', 'Gold'],
  ['recliner', 'Recliner']
]);

function reject(message, index, raw) {
  return { entry: raw, reason: message, index };
}

function normalizeSeatClass(value) {
  if (typeof value !== 'string' || value.trim() === '') throw new InvalidBookingError('Seat class must be a non-blank string');
  const normalized = NAME_ALIASES.get(value.trim().toLowerCase());
  if (!normalized) throw new InvalidBookingError('Unknown seat class: ' + value);
  return normalized;
}

function parsePricePaisa(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw new InvalidBookingError('Price is required');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new InvalidBookingError('Price must be numeric');
  const text = String(value).trim().replace(/[₹$€£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new InvalidBookingError('Price must be a non-negative numeric amount with at most 2 decimals');
  const [rupees, paise = ''] = text.split('.');
  const paisa = Number(rupees) * 100 + Number(paise.padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(paisa)) throw new InvalidBookingError('Price exceeds safe paisa range');
  return paisa;
}

function parseExplicitPaisa(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new InvalidBookingError('pricePaisa must be a non-negative integer');
  return value;
}

function readRecord(record) {
  if (Array.isArray(record)) return { name: record[0], price: record[1] };
  if (!record || typeof record !== 'object') throw new InvalidBookingError('Entry must be an object or [seatClass, price] pair');
  const name = record.seatClass ?? record.seatTier ?? record.tier ?? record.name ?? record.class;
  if (record.pricePaisa !== undefined) return { name, pricePaisa: record.pricePaisa };
  return { name, price: record.price ?? record.amount ?? record.basePrice };
}

function importPriceList(rawEntries) {
  if (!Array.isArray(rawEntries)) throw new InvalidBookingError('Price list must be an array');
  const cleaned = new Map();
  const rejected = [];
  let deduplicatedCount = 0;

  rawEntries.forEach((raw, index) => {
    try {
      const { name, price, pricePaisa } = readRecord(raw);
      const tierName = normalizeSeatClass(name);
      const cleanedPricePaisa = pricePaisa === undefined ? parsePricePaisa(price) : parseExplicitPaisa(pricePaisa);
      if (cleaned.has(tierName)) deduplicatedCount += 1;
      cleaned.set(tierName, cleanedPricePaisa);
    } catch (error) {
      rejected.push(reject(error.message, index, raw));
    }
  });

  return {
    importedCount: rawEntries.length,
    deduplicatedCount,
    rejectedCount: rejected.length,
    rejections: rejected,
    cleanedInventory: Object.fromEntries(cleaned),
    rejected,
    finalCleanedPrices: Object.fromEntries(cleaned)
  };
}

module.exports = { importPriceList, normalizeSeatClass, parsePricePaisa };
