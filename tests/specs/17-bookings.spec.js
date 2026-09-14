const route = async (page, direction = 'Export') => page.locator(`[data-ws-route="bookings-${direction.toLowerCase()}"]`).click();
const setTime = async (page, name, value) => page.locator(`#bp-dialog [name="${name}"]`).evaluate((input, text) => { input.value = text; input.dispatchEvent(new Event('change', { bubbles: true })); }, value);
const close = async page => page.locator('#bp-dialog [data-bp-close]').first().click();
const day = offset => new Date(Date.now() + 4 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const booking = (direction = 'Export', patch = {}) => ({ direction, awb: direction === 'Export' ? '78030909701' : '78030909702', customer: 'BOOKING TEST CUSTOMER', origin: direction === 'Export' ? 'DWC' : 'NBO', destination: direction === 'Export' ? 'NBO' : 'DWC', pieces: 12, weight: 250, cargoType: 'General', shc: 'GEN', staffRequired: 1, slotStart: `${day(1)}T09:00`, slotEnd: `${day(1)}T10:00`, ...patch });
async function createThroughForm(page, input) {
  await route(page, input.direction);
  await page.locator(`#p-bookings-${input.direction.toLowerCase()} .bp-top-actions [data-bp-new]`).click();
  for (const name of ['awb', 'customer', 'origin', 'destination', 'pieces', 'weight', 'staffRequired', 'cargoType', 'shc', 'flightNumber', 'vehicleType', 'vehicleRegistration', 'dock', 'reason']) {
    if (input[name] !== undefined && !(name === 'origin' && input.direction === 'Export') && !(name === 'destination' && input.direction === 'Import')) await page.locator(`#bp-booking-form [name="${name}"]`).fill(String(input[name]));
  }
  for (const name of ['slotStart', 'slotEnd', 'flightDeparture']) if (input[name]) await setTime(page, name, input[name]);
  if (input.coordination?.customs) await page.locator('#bp-booking-form [name="customs"]').check();
  if (input.coordination?.police) await page.locator('#bp-booking-form [name="police"]').check();
  if (input.coordination?.owner) await page.locator('#bp-booking-form [name="coordinationOwner"]').fill(input.coordination.owner);
  await page.locator('#bp-save-booking').click();
  const error = page.locator('#bp-form-error');
  if (await error.isVisible()) throw new Error(await error.textContent());
  await page.locator('#bp-dialog').waitFor({ state: 'hidden' });
}
async function seed(page, input) {
  return page.evaluate(value => {
    if (!SolitAir.bookingCommand('create', value)) throw new Error(SolitAir.bookingError);
    return SolitAir.bookingPlanner().bookings.at(-1);
  }, input);
}

module.exports = {
  name: 'Internal export and import booking planner',
  tests: {
    'empty planner, explicit example, full booking, safe search and reload persistence': async h => {
      const instance = await h.openApp();
      try {
        const { page } = instance;
        await route(page);
        h.eq(await page.evaluate(() => SolitAir.bookingPlanner().bookings.length), 0);
        h.contains(await page.locator('#p-bookings-export').textContent(), 'Capacity is not configured');
        await page.locator('[data-bp-sample="Export"]').click();
        h.contains(await page.locator('#bp-dialog').textContent(), 'Synthetic example');
        await close(page);
        h.eq(await page.evaluate(() => SolitAir.bookingPlanner().bookings.length), 0, 'prefill does not save a sample');
        const input = booking('Export', { customer: 'BOOKING TEST <em>CLIENT</em>', flightNumber: 'sp901', flightDeparture: `${day(1)}T14:00`, vehicleType: 'Reefer truck', vehicleRegistration: 'TEST-901', dock: 'DWC planning desk', coordination: { customs: true, owner: 'Test CS desk' } });
        await createThroughForm(page, input);
        const saved = await page.evaluate(() => SolitAir.bookingPlanner().bookings[0]);
        h.eq(saved.flightNumber, 'SP901');
        h.eq(saved.vehicleRegistration, 'TEST-901');
        h.eq(saved.source, 'manual');
        h.eq(saved.origin, 'DWC');
        h.eq(saved.coordination.customs, true);
        h.eq(saved.latePolicy.enabled, false);
        h.eq(await page.locator('.bp-booking-info h3 em').count(), 0, 'customer is rendered as text');
        await page.locator('#p-bookings-export [data-bp-search]').fill('does not exist');
        h.eq(await page.locator('#p-bookings-export .bp-booking').count(), 0);
        await page.locator('#p-bookings-export [data-bp-search]').fill('780-30909701');
        h.eq(await page.locator('#p-bookings-export .bp-booking').count(), 1);
        await page.reload();
        await page.waitForFunction(() => window.__solitairReady);
        h.eq(await page.evaluate(() => SolitAir.bookingPlanner().bookings[0].id), saved.id);
        await page.evaluate(id => SolitAir.openBooking(id), saved.id);
        h.contains(await page.locator('#bp-dialog').textContent(), 'TEST-901');
        h.eq(await page.locator('.page.on').getAttribute('id'), 'p-bookings-export');
        await page.keyboard.press('Escape');
        h.assert(!(await page.locator('#bp-dialog').evaluate(node => node.open)), 'Escape closes the booking drawer');
        await page.setViewportSize({ width: 390, height: 844 });
        h.assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile planner contains horizontal workload scrolling');
        await page.locator('#p-bookings-export .bp-top-actions [data-bp-new]').click();
        await page.locator('#bp-dialog').evaluate(node => { node.scrollTop = node.scrollHeight; });
        await page.keyboard.press('Escape');
        await page.locator('#p-bookings-export .bp-top-actions [data-bp-new]').click();
        h.eq(await page.locator('#bp-dialog').evaluate(node => node.scrollTop), 0, 'reopening a long mobile form starts at its heading');
        await page.keyboard.press('Escape');
        h.eq(await page.evaluate(() => DB.entries.length), 0, 'booking does not create an invoice');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
    'shared capacity exposes cross-direction conflict and rescheduling is recorded': async h => {
      const instance = await h.openApp();
      try {
        const { page } = instance;
        await route(page);
        await page.locator('#p-bookings-export .bp-top-actions [data-bp-settings]').click();
        await page.locator('[name="capacityStaff"]').fill('1');
        await page.locator('[name="maxConcurrent"]').fill('1');
        await page.locator('#bp-save-settings').click();
        const outbound = await seed(page, booking());
        await createThroughForm(page, booking('Import'));
        h.contains(await page.locator('#p-bookings-import .bp-notice-warning').textContent(), '2 staff / 2 bookings');
        h.eq(await page.locator('#p-bookings-import .bp-booking').count(), 1, 'direction agenda stays separate');
        await page.evaluate(id => SolitAir.openBooking(id), outbound.id);
        await page.locator('#bp-dialog [data-bp-edit]').click();
        await setTime(page, 'slotStart', `${day(1)}T10:00`);
        await setTime(page, 'slotEnd', `${day(1)}T11:00`);
        await page.locator('#bp-save-booking').click();
        h.assert(await page.locator('#bp-form-error').isVisible(), 'reschedule needs a reason');
        await page.locator('#bp-booking-form [name="reason"]').fill('Separate the two visits to fit the shared team');
        await page.locator('#bp-save-booking').click();
        h.eq(await page.locator('#p-bookings-export .bp-notice-warning').count(), 0, 'adjacent appointments no longer conflict');
        const updated = await page.evaluate(id => SolitAir.bookingPlanner().bookings.find(item => item.id === id), outbound.id);
        h.eq(updated.slotStart, `${day(1)}T10:00`);
        h.contains(updated.history.at(-1).reason, 'shared team');
        await page.evaluate(id => SolitAir.openBooking(id), outbound.id);
        await page.locator('#bp-dialog [data-bp-cancel]').click();
        await page.locator('#bp-transition-form [name="reason"]').fill('Customer cancelled the planned visit');
        await page.locator('#bp-confirm-transition').click();
        h.contains(await page.locator('#bp-dialog .bp-status-explanation').textContent(), 'cancelled');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
    'late arrival proposes review only, captured policy survives settings changes, and waiver is audited': async h => {
      const instance = await h.openApp();
      try {
        const { page } = instance;
        await route(page);
        await page.locator('#p-bookings-export .bp-top-actions [data-bp-settings]').click();
        await page.locator('[name="lateEnabled"]').check();
        await page.locator('[name="graceMinutes"]').fill('10');
        await page.locator('[name="lateAmount"]').fill('25');
        await page.locator('#bp-save-settings').click();
        const record = await seed(page, booking('Export', { slotStart: `${day(-1)}T09:00`, slotEnd: `${day(-1)}T10:00`, reason: 'Historical test visit entered for review' }));
        await page.evaluate(() => { if (!SolitAir.bookingCommand('settings', { latePolicy: { enabled: false, graceMinutes: 0, amount: 0, currency: 'AED' } })) throw new Error(SolitAir.bookingError); });
        await page.evaluate(id => SolitAir.openBooking(id), record.id);
        await page.locator('#bp-dialog [data-bp-arrive]').click();
        await setTime(page, 'actualArrival', `${day(-1)}T10:30`);
        await page.locator('#bp-transition-form [name="reason"]').fill('Recording the actual vehicle check-in');
        await page.locator('#bp-confirm-transition').click();
        h.contains(await page.locator('#bp-dialog .bp-late-review').textContent(), 'AED 25.00');
        h.contains(await page.locator('#bp-dialog .bp-late-review').textContent(), 'Proposal · needs review');
        h.eq(await page.locator('#bp-dialog [data-bp-cancel]').count(), 0, 'arrived visits cannot be cancelled');
        await page.locator('#bp-dialog [data-bp-waive]').click();
        await page.locator('#bp-transition-form [name="reason"]').fill('Supervisor reviewed the prototype proposal and waived it');
        await page.locator('#bp-confirm-transition').click();
        h.contains(await page.locator('#bp-dialog .bp-late-review').textContent(), 'Waived');
        await page.locator('#bp-dialog [data-bp-complete]').click();
        await page.locator('#bp-confirm-transition').click();
        const saved = await page.evaluate(id => SolitAir.bookingPlanner().bookings.find(item => item.id === id), record.id);
        h.eq(saved.status, 'completed');
        h.eq(saved.lateAssessment.status, 'waived');
        h.eq(saved.lateAssessment.chargeableMinutes, 20);
        h.eq(await page.evaluate(() => DB.entries.length), 0, 'proposal and waiver never post to the ledger');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
    'no-show is explicit and fee-free; failed persistence retains the input draft': async h => {
      const instance = await h.openApp();
      try {
        const { page } = instance;
        const missed = await seed(page, booking('Import', { slotStart: `${day(-1)}T09:00`, slotEnd: `${day(-1)}T10:00`, reason: 'Historical coordination review' }));
        await page.evaluate(id => SolitAir.openBooking(id), missed.id);
        await page.locator('#bp-dialog [data-bp-no-show]').click();
        await page.locator('#bp-transition-form [name="reason"]').fill('Customer confirmed they would not attend');
        await page.locator('#bp-confirm-transition').click();
        const noShow = await page.evaluate(id => SolitAir.bookingPlanner().bookings.find(item => item.id === id), missed.id);
        h.eq(noShow.status, 'no-show');
        h.eq(noShow.lateAssessment, null);
        await close(page);
        await page.locator('#p-bookings-import [data-bp-status]').selectOption('no-show');
        h.eq(await page.locator('#p-bookings-import .bp-booking').count(), 1);
        await page.locator('#p-bookings-import .bp-top-actions [data-bp-new]').click();
        for (const [name, value] of Object.entries({ awb: '78030909703', customer: 'UNSAVED BOOKING TEST', origin: 'NBO', pieces: '4', weight: '50' })) await page.locator(`#bp-booking-form [name="${name}"]`).fill(value);
        await setTime(page, 'slotStart', `${day(1)}T11:00`);
        await setTime(page, 'slotEnd', `${day(1)}T12:00`);
        await page.evaluate(() => { window.__bookingSavedSave = SolitAir.save; SolitAir.save = () => false; });
        await page.locator('#bp-save-booking').click();
        h.contains(await page.locator('#bp-form-error').textContent(), 'not saved');
        h.eq(await page.locator('#bp-booking-form [name="customer"]').inputValue(), 'UNSAVED BOOKING TEST');
        h.eq(await page.evaluate(() => SolitAir.bookingPlanner().bookings.length), 1, 'failed candidate was rolled back');
        await page.evaluate(() => { SolitAir.save = window.__bookingSavedSave; delete window.__bookingSavedSave; });
        await page.locator('#bp-save-booking').click();
        await page.locator('#bp-dialog').waitFor({ state: 'hidden' });
        h.eq(await page.evaluate(() => SolitAir.bookingPlanner().bookings.length), 2);
        h.eq(await page.evaluate(() => DB.entries.length), 0);
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
  },
};
