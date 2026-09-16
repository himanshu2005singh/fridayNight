(function () {
  const engine = window.PricingEngine; const config = engine.DEFAULT_CONFIG; const quantities = { Silver: 0, Gold: 0, Recliner: 0 }; const tierList = document.getElementById('tier-list'); const format = (paisa) => '₹' + (paisa / 100).toFixed(2);
  Object.keys(config.tiers).forEach((name) => {
    const tier = config.tiers[name]; const availableSeats = tier.totalSeats === undefined ? (tier.available !== false ? Number.MAX_SAFE_INTEGER : 0) : tier.totalSeats - tier.bookedSeats; const available = availableSeats > 0; const row = document.createElement('div'); row.dataset.tier = name; row.className = 'tier' + (available ? '' : ' sold-out');
    row.innerHTML = '<div><span class="tier-name">' + name + '</span><span class="tier-meta">' + (available ? format(tier.pricePaisa) + ' per ticket · ' + availableSeats + ' left' : 'Sold out') + '</span></div><div class="stepper"><button type="button" aria-label="Remove one ' + name + ' ticket" data-action="decrease" ' + (available ? '' : 'disabled') + '>−</button><span class="quantity" id="quantity-' + name + '" aria-live="polite">0</span><button type="button" aria-label="Add one ' + name + ' ticket" data-action="increase" ' + (available ? '' : 'disabled') + '>+</button></div>';
    row.addEventListener('click', (event) => { const action = event.target.dataset.action; if (!action || !available || (action === 'increase' && quantities[name] >= availableSeats)) return; quantities[name] = Math.max(0, quantities[name] + (action === 'increase' ? 1 : -1)); document.getElementById('quantity-' + name).textContent = quantities[name]; }); tierList.appendChild(row);
  });
  function renderReceipt(result) {
    const ticketRows = result.lineItems.map((item) => '<p class="line-detail">' + item.quantity + ' × ' + item.tier + '<span>' + format(item.amountPaisa) + '</span></p>').join('');
    document.getElementById('receipt').innerHTML = '<p class="receipt-row"><span>Tickets</span><strong>' + format(result.subtotalPaisa) + '</strong></p>' + ticketRows + '<div class="receipt-rule"></div><p class="receipt-row discount"><span>Festival discount</span><span>− ' + format(result.festivalDiscountPaisa) + '</span></p><p class="receipt-row discount"><span>Member discount</span><span>− ' + format(result.memberDiscountPaisa) + '</span></p><p class="receipt-row"><span>Convenience fee</span><span>' + format(result.convenienceFeeTotalPaisa) + '</span></p><p class="receipt-row"><span>GST</span><span>' + format(result.gstPaisa) + '</span></p><div class="receipt-rule"></div><div class="total"><span>Total payable</span><strong>' + format(result.totalPaisa) + '</strong></div><p class="receipt-note">Rounded to the exact paisa. Have a brilliant show.</p>';
  }
  document.getElementById('booking-form').addEventListener('submit', (event) => { event.preventDefault(); const error = document.getElementById('error'); error.hidden = true; try { renderReceipt(engine.calculateBooking({ quantities, isMember: document.getElementById('member').checked }, config)); } catch (err) { error.textContent = err.message; error.hidden = false; } });
  document.getElementById('import-prices-button').addEventListener('click', async () => {
    const error = document.getElementById('import-error'); const reportElement = document.getElementById('import-report'); error.hidden = true; reportElement.hidden = true;
    try {
      const payload = JSON.parse(document.getElementById('price-import-input').value);
      const response = await fetch('/api/import-prices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const report = await response.json();
      if (!response.ok) throw new Error(report.error || 'Price import failed');
      Object.entries(report.cleanedInventory).forEach(([name, pricePaisa]) => {
        if (config.tiers[name]) config.tiers[name].pricePaisa = pricePaisa;
        const row = document.querySelector('[data-tier="' + name + '"] .tier-meta');
        if (row) row.textContent = format(pricePaisa) + ' per ticket';
      });
      reportElement.textContent = JSON.stringify(report, null, 2); reportElement.hidden = false;
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  });
})();