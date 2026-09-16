const { calculateBooking, getAvailability } = require('./pricing');
const { PricingError } = require('./errors');
const { importPriceList } = require('./price-importer');

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100000) reject(new Error('Request body is too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (error) { reject(new Error('Request body must be valid JSON')); }
    });
    request.on('error', reject);
  });
}

function createApiController(runtimeConfig) {
  return async function handleApiRequest(request, response) {
    if (request.method === 'GET' && request.url === '/api/availability') {
      sendJson(response, 200, { tiers: getAvailability(runtimeConfig) });
      return true;
    }
    if (request.method === 'POST' && (request.url === '/api/import-prices' || request.url === '/api/prices/import')) {
      try {
        const payload = await readJson(request);
        const entries = Array.isArray(payload) ? payload : payload.prices;
        const report = importPriceList(entries);
        Object.keys(report.cleanedInventory).forEach((tierName) => {
          if (runtimeConfig.tiers[tierName]) runtimeConfig.tiers[tierName].pricePaisa = report.cleanedInventory[tierName];
        });
        sendJson(response, 200, report);
      } catch (error) {
        sendJson(response, 400, { error: error.message, code: error.code || 'INVALID_PRICE_IMPORT' });
      }
      return true;
    }
    if (request.method === 'POST' && request.url === '/api/checkout') {
      try {
        const booking = await readJson(request);
        const receipt = calculateBooking(booking, runtimeConfig);
        Object.keys(booking.quantities || {}).forEach((tierName) => {
          runtimeConfig.tiers[tierName].bookedSeats += booking.quantities[tierName];
        });
        sendJson(response, 200, receipt);
      } catch (error) {
        const status = error instanceof PricingError ? 400 : 400;
        sendJson(response, status, { error: error.message, code: error.code || 'INVALID_REQUEST' });
      }
      return true;
    }
    if (request.url.startsWith('/api/')) {
      sendJson(response, 404, { error: 'API endpoint not found', code: 'NOT_FOUND' });
      return true;
    }
    return false;
  };
}

module.exports = { createApiController };
