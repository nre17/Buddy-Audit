const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let rules;
before(async () => { rules = await import('../src/domain/bookings.mjs'); });

const context = (now = '2026-09-14T04:00:00Z', id = 'BOOKING_1') => ({ now, actor: 'Counter 1', id });
const input = (patch = {}) => ({ direction: 'Export', awb: '780-30909801', customer: 'Synthetic booking customer',
  origin: 'DWC', destination: 'ISU', pieces: 10, weight: 200,
  slotStart: '2026-09-14T10:00', slotEnd: '2026-09-14T11:00', ...patch });
function freeze(value) { if (value && typeof value === 'object') {Object.freeze(value); Object.values(value).forEach(freeze);} return value; }
function one(patch = {}, planner = rules.createBookingPlanner(), ctx = context()) { return rules.createBooking(planner, input(patch), ctx); }
function arrive(planner, actualArrival = '2026-09-14T11:16', now = '2026-09-14T07:16:00Z') {
  return rules.transitionBooking(planner, planner.bookings[0].id, 'arrive', { actualArrival }, context(now));
}
function configured() {
  return rules.updateBookingSettings(rules.createBookingPlanner(), { latePolicy: { enabled: true, graceMinutes: 15, amount: 125 } }, context());
}

test('booking creation normalizes identifiers and remains independent of its inputs', () => {
  const planner = freeze(rules.createBookingPlanner()), supplied = freeze(input({ coordination: { customs: true, owner: '  Counter 2  ' }, flightNumber: ' zz 907 ', vehicleType: ' Van ' }));
  const saved = rules.createBooking(planner, supplied, context());
  assert.equal(planner.bookings.length, 0);
  assert.equal(saved.bookings[0].awb, '78030909801');
  assert.equal(saved.bookings[0].timezone, 'Asia/Dubai');
  assert.equal(saved.bookings[0].status, 'confirmed');
  assert.equal(saved.bookings[0].flightNumber, 'ZZ 907');
  assert.equal(saved.bookings[0].vehicleType, 'Van');
  assert.equal(saved.bookings[0].coordination.owner, 'Counter 2');
  assert.equal(saved.bookings[0].coordination.customsConfirmed, false);
  assert.equal(saved.bookings[0].reference, 'BKG-20260914-0001');
  assert.equal(saved.bookings[0].history[0].actor, 'Counter 1');
  assert.equal(saved.bookings[0].latePolicy.enabled, false);
  saved.bookings[0].coordination.note = 'Independent copy';
  assert.equal(supplied.coordination.note, undefined);
});

test('Dubai civil times and planning dates are independent of timestamp offset and host timezone', () => {
  const oldZone = process.env.TZ;
  try {
    for (const host of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = host;
      assert.equal(rules.dubaiLocalTime('2026-09-13T21:30:00Z'), '2026-09-14T01:30');
      assert.equal(rules.dubaiDate('2026-09-13T14:30:00-07:00'), '2026-09-14');
      const fromUtc = one({}, rules.createBookingPlanner(), context('2026-09-14T04:00:00Z'));
      const fromDubai = one({}, rules.createBookingPlanner(), context('2026-09-14T08:00:00+04:00'));
      assert.deepEqual(fromUtc, fromDubai);
      assert.equal(rules.bookingLateness(fromUtc.bookings[0], '2026-09-14T07:01:00Z').minutesLate, 1);
    }
  } finally { if (oldZone === undefined) delete process.env.TZ; else process.env.TZ = oldZone; }
});

test('invalid civil dates, ambiguous clocks, cargo values, routes and authority flags are rejected', () => {
  for (const bad of [
    { awb: '780-abc09801' }, { origin: 'DXB' }, { destination: 'DWC' }, { weight: Infinity }, { weight: 0 },
    { pieces: 1.5 }, { staffRequired: 0 }, { slotStart: '2026-02-30T10:00' },
    { slotEnd: '2026-09-14T09:00' }, { slotEnd: '2026-09-15T10:01' },
    { slotStart: '2026-09-14T10:00+04:00' }, { flightDeparture: '2026-09-14T25:00' },
    { coordination: { policeConfirmed: true } }, { coordination: { customs: 'yes' } },
  ]) assert.throws(() => one(bad), Error, JSON.stringify(bad));
  assert.throws(() => one({}, rules.createBookingPlanner(), context('2026-09-14T08:00')), /offset/);
  assert.throws(() => one({}, rules.createBookingPlanner(), { ...context(), actor: '' }), /Operator name/);
  assert.throws(() => rules.dubaiLocalTime('2026-09-14T12:00:99Z'), /invalid/);
  const imported = one({ direction: 'Import', origin: 'ISU', destination: 'DWC' });
  assert.equal(imported.bookings[0].direction, 'Import');
});

test('active AWB overlap is direction-specific and touching or separate visits remain valid', () => {
  const first = one();
  assert.throws(() => rules.createBooking(first, input({ slotStart: '2026-09-14T10:30', slotEnd: '2026-09-14T11:30' }), context(undefined, 'BOOKING_2')), /overlapping active export/);
  let next = rules.createBooking(first, input({ slotStart: '2026-09-14T11:00', slotEnd: '2026-09-14T12:00' }), context(undefined, 'BOOKING_2'));
  next = rules.createBooking(next, input({ direction: 'Import', origin: 'ISU', destination: 'DWC' }), context(undefined, 'BOOKING_3'));
  assert.equal(next.bookings.length, 3);
  assert.throws(() => rules.updateBooking(next, 'BOOKING_2', { slotStart: '2026-09-14T10:59', reason: 'Requested earlier slot' }, context()), /overlapping/);
  const cancelled = rules.transitionBooking(first, 'BOOKING_1', 'cancel', { reason: 'Customer withdrew request' }, context());
  assert.equal(rules.createBooking(cancelled, input(), context(undefined, 'BOOKING_2')).bookings.length, 2);
});

test('historical bookings and every reschedule require reasons and preserve the old slot in audit history', () => {
  assert.throws(() => one({}, rules.createBookingPlanner(), context('2026-09-15T04:00:00Z')), /Reason is required/);
  const historical = one({ reason: 'Entered from yesterday’s counter log' }, rules.createBookingPlanner(), context('2026-09-15T04:00:00Z'));
  assert.match(historical.bookings[0].history[0].reason, /counter log/);
  const original = freeze(one());
  assert.throws(() => rules.updateBooking(original, 'BOOKING_1', { slotEnd: '2026-09-14T11:30' }, context()), /Reason is required/);
  const revised = rules.updateBooking(original, 'BOOKING_1', { slotEnd: '2026-09-14T11:30', reason: 'Customer requested extra unloading time' }, context('2026-09-14T05:00:00Z'));
  assert.equal(original.bookings[0].slotEnd, '2026-09-14T11:00');
  assert.equal(revised.bookings[0].version, 2);
  assert.deepEqual(revised.bookings[0].history[1].changes.slotEnd, { before: '2026-09-14T11:00', after: '2026-09-14T11:30' });
  assert.equal(revised.bookings[0].history[1].type, 'rescheduled');
  assert.throws(() => rules.updateBooking(revised, 'BOOKING_1', { customer: 'Another customer' }, context()), /precede/);
  assert.throws(() => rules.updateBooking(original, 'BOOKING_1', { status: 'completed' }, context()), /cannot be edited/);
  assert.equal(rules.updateBooking(original, 'BOOKING_1', { customer: original.bookings[0].customer }, context()).bookings[0].version, 1);
});

test('arrival timestamps have a one-minute future tolerance and backdated calendar days need a reason', () => {
  const planner = one();
  assert.throws(() => arrive(planner, '2026-09-14T11:18'), /one minute in the future/);
  assert.equal(arrive(planner, '2026-09-14T11:17').bookings[0].actualArrival, '2026-09-14T11:17');
  const defaultArrival = rules.transitionBooking(planner, 'BOOKING_1', 'arrive', {}, context('2026-09-14T07:16:48Z'));
  assert.equal(defaultArrival.bookings[0].actualArrival, '2026-09-14T11:16');
  assert.throws(() => arrive(planner, '2026-09-13T11:16'), /Reason is required/);
  const historical = rules.transitionBooking(planner, 'BOOKING_1', 'arrive', { actualArrival: '2026-09-13T11:16', reason: 'Arrival entered from signed counter log' }, context('2026-09-14T07:16:00Z'));
  assert.equal(historical.bookings[0].status, 'arrived');
});

test('booking status transitions are explicit and arrived records allow coordination-only edits', () => {
  const original = one();
  assert.throws(() => rules.transitionBooking(original, 'BOOKING_1', 'complete', {}, context()), /actual arrival/);
  assert.throws(() => rules.transitionBooking(original, 'BOOKING_1', 'cancel', {}, context()), /Reason/);
  let arrived = arrive(original);
  assert.throws(() => rules.transitionBooking(arrived, 'BOOKING_1', 'arrive', {}, context('2026-09-14T07:17:00Z')), /confirmed/);
  assert.throws(() => rules.updateBooking(arrived, 'BOOKING_1', { slotStart: '2026-09-14T10:30', reason: 'Late arrival' }, context('2026-09-14T07:17:00Z')), /coordination updates only/);
  arrived = rules.updateBooking(arrived, 'BOOKING_1', { coordination: { customs: true, customsConfirmed: true, owner: 'Counter 3' } }, context('2026-09-14T07:17:00Z'));
  assert.equal(arrived.bookings[0].coordination.customsConfirmed, true);
  const completed = rules.transitionBooking(arrived, 'BOOKING_1', 'complete', {}, context('2026-09-14T07:20:00Z'));
  assert.equal(completed.bookings[0].status, 'completed');
  assert.equal(completed.bookings[0].completedAt, '2026-09-14T07:20:00.000Z');
  assert.throws(() => rules.transitionBooking(completed, 'BOOKING_1', 'cancel', { reason: 'Too late' }, context('2026-09-14T07:21:00Z')), /confirmed/);
});

test('lateness starts at slot end and grace applies exactly once to fixed-fee proposals', () => {
  const planner = one({}, configured());
  assert.equal(rules.bookingLateness(planner.bookings[0], '2026-09-14T06:30:00Z').minutesLate, 0);
  assert.equal(rules.bookingLateness(planner.bookings[0], '2026-09-14T07:16:00Z').minutesLate, 16);
  assert.equal(rules.evaluateLateCharge(planner.bookings[0]), null, 'a missing arrival cannot generate a fee');
  const withinGrace = arrive(planner, '2026-09-14T11:15').bookings[0].lateAssessment;
  assert.equal(withinGrace.status, 'not-applicable'); assert.equal(withinGrace.amount, 0);
  const outsideGrace = arrive(planner).bookings[0].lateAssessment;
  assert.equal(outsideGrace.status, 'proposed'); assert.equal(outsideGrace.minutesLate, 16);
  assert.equal(outsideGrace.chargeableMinutes, 1); assert.equal(outsideGrace.amount, 125);
  assert.equal(outsideGrace.currency, 'AED');
  assert.equal(arrive(one()).bookings[0].lateAssessment.status, 'not-configured');
});

test('policy changes do not retroactively price existing bookings and settings changes are audited', () => {
  const original = one({}, configured());
  const changed = rules.updateBookingSettings(freeze(original), { latePolicy: { amount: 900 }, capacity: { staff: 3 } }, context('2026-09-14T05:00:00Z'));
  assert.equal(changed.latePolicy.amount, 900); assert.equal(changed.bookings[0].latePolicy.amount, 125);
  assert.equal(arrive(changed).bookings[0].lateAssessment.amount, 125);
  const second = rules.createBooking(changed, input({ awb: '78030909802' }), context('2026-09-14T05:00:00Z', 'BOOKING_2'));
  assert.equal(second.bookings[1].latePolicy.amount, 900);
  assert.deepEqual(changed.history.at(-1).changes.capacity, { before: { staff: 0, maxConcurrent: 0 }, after: { staff: 3, maxConcurrent: 0 } });
  for (const latePolicy of [{ enabled: true, amount: 0 }, { amount: -1 }, { amount: 1.001 }, { graceMinutes: 1.5 }, { currency: 'USD' }]) {
    assert.throws(() => rules.updateBookingSettings(rules.createBookingPlanner(), { latePolicy }, context()));
  }
});

test('waiver preserves the original proposal and requires an explicit reason and operator', () => {
  const proposed = freeze(arrive(one({}, configured())));
  assert.throws(() => rules.transitionBooking(proposed, 'BOOKING_1', 'waiveLateCharge', {}, context('2026-09-14T07:20:00Z')), /Reason/);
  const waived = rules.transitionBooking(proposed, 'BOOKING_1', 'waiveLateCharge', { reason: 'Documented gate-system outage' }, { ...context('2026-09-14T07:20:00Z'), actor: 'Supervisor' });
  assert.equal(proposed.bookings[0].lateAssessment.status, 'proposed');
  assert.equal(waived.bookings[0].lateAssessment.status, 'waived');
  assert.equal(waived.bookings[0].lateAssessment.amount, 125, 'original proposed amount retained for review');
  assert.equal(waived.bookings[0].lateAssessment.waivedBy, 'Supervisor');
  assert.equal(waived.bookings[0].history.at(-1).changes.lateAssessment.before.status, 'proposed');
  assert.throws(() => rules.transitionBooking(waived, 'BOOKING_1', 'waiveLateCharge', { reason: 'Repeat' }, context('2026-09-14T07:21:00Z')), /existing late-charge proposal/);
  assert.equal(Object.hasOwn(waived.bookings[0].lateAssessment, 'invoiceId'), false);
  assert.equal(Object.hasOwn(waived.bookings[0].lateAssessment, 'collected'), false);
});

test('no-show requires an ended slot and reason, creates no fee, and releases overlap restriction', () => {
  const planner = one({}, configured());
  for (const now of ['2026-09-14T06:59:00Z', '2026-09-14T07:00:00Z']) {
    assert.throws(() => rules.transitionBooking(planner, 'BOOKING_1', 'no-show', { reason: 'Vehicle did not arrive' }, context(now)), /after the slot ends/);
  }
  assert.throws(() => rules.transitionBooking(planner, 'BOOKING_1', 'no-show', {}, context('2026-09-14T07:01:00Z')), /Reason/);
  const marked = rules.transitionBooking(planner, 'BOOKING_1', 'no-show', { reason: 'Vehicle did not arrive; CS contacted' }, context('2026-09-14T07:01:00Z'));
  assert.equal(marked.bookings[0].lateAssessment, null);
  assert.equal(marked.bookings[0].noShowAt, '2026-09-14T07:01:00.000Z');
  assert.equal(rules.evaluateLateCharge(marked.bookings[0]), null);
  assert.equal(rules.planDay(marked, '2026-09-14', '2026-09-14T08:00:00Z').counts.noShow, 1);
  assert.equal(rules.planDay(marked, '2026-09-14', '2026-09-14T08:00:00Z').workload.length, 0);
  assert.equal(rules.createBooking(marked, input({ reason: 'Historical rebooking record' }), context('2026-09-14T07:01:00Z', 'BOOKING_2')).bookings.length, 2);
  assert.throws(() => rules.transitionBooking(marked, 'BOOKING_1', 'arrive', {}, context('2026-09-14T08:00:00Z')), /confirmed/);
});

test('capacity is reported rather than enforced and shared-boundary slots never double count', () => {
  let planner = rules.updateBookingSettings(rules.createBookingPlanner(), { capacity: { staff: 3, maxConcurrent: 1 } }, context());
  planner = one({ staffRequired: 2 }, planner);
  planner = rules.createBooking(planner, input({ awb: '78030909802', staffRequired: 2, slotStart: '2026-09-14T10:30', slotEnd: '2026-09-14T11:30' }), context(undefined, 'BOOKING_2'));
  planner = rules.createBooking(planner, input({ awb: '78030909803', staffRequired: 1, slotStart: '2026-09-14T11:30', slotEnd: '2026-09-14T12:00' }), context(undefined, 'BOOKING_3'));
  const day = rules.planDay(freeze(planner), '2026-09-14', '2026-09-14T08:30:00Z');
  assert.deepEqual(day.peak, { staffRequired: 4, concurrentBookings: 2 });
  assert.deepEqual(day.capacityWarnings, [{ slotStart: '2026-09-14T10:30', slotEnd: '2026-09-14T11:00', staffRequired: 4, concurrentBookings: 2, staffExceeded: true, concurrentExceeded: true }]);
  assert.deepEqual(day.workload.map(segment => [segment.staffRequired, segment.concurrentBookings]), [[2, 1], [4, 2], [2, 1], [1, 1]]);
  const unset = rules.updateBookingSettings(planner, { capacity: { staff: 0, maxConcurrent: 0 } }, context());
  assert.equal(rules.planDay(unset, '2026-09-14', '2026-09-14T08:30:00Z').capacityWarnings.length, 0, 'zero means capacity not configured');
  day.bookings[0].customer = 'View edited independently';
  assert.equal(planner.bookings[0].customer, 'Synthetic booking customer');
});

test('daily workload clips overnight slots to Dubai midnight and reports coordination ownership', () => {
  let planner = one({ slotStart: '2026-09-14T23:30', slotEnd: '2026-09-15T00:30', staffRequired: 2,
    coordination: { customs: true, customsConfirmed: true, police: true, other: 'Temperature check' } });
  planner = rules.createBooking(planner, input({ awb: '78030909802', slotStart: '2026-09-15T00:00', slotEnd: '2026-09-15T01:00', coordination: { customs: true, owner: 'Counter 4' } }), context(undefined, 'BOOKING_2'));
  const day = rules.planDay(planner, '2026-09-15', '2026-09-14T20:15:00Z');
  assert.equal(day.workload[0].slotStart, '2026-09-15T00:00');
  assert.equal(day.workload[0].staffRequired, 3);
  assert.deepEqual(day.coordination, { customs: 2, police: 1, unassigned: 1, owners: ['Counter 4'] });
  assert.equal(day.counts.confirmed, 2); assert.equal(day.counts.overdue, 0);
  assert.equal(rules.planDay(planner, '2026-09-16', '2026-09-15T20:00:00Z').counts.total, 0);
});

test('restored state rejects duplicate identities, malformed lifecycle state and altered fee assessments', () => {
  const valid = arrive(one({}, configured()));
  for (const corrupt of [
    state => { state.bookings.push(structuredClone(state.bookings[0])); },
    state => { state.bookings[0].version++; },
    state => { state.bookings[0].awb = '780-30909801'; },
    state => { state.bookings[0].actualArrival = null; },
    state => { state.bookings[0].completedAt = '2026-09-14T08:00:00Z'; },
    state => { state.bookings[0].lateAssessment.amount = 999; },
    state => { state.bookings[0].lateAssessment.status = 'collected'; },
    state => { state.bookings[0].lateAssessment.policy.amount = 999; },
    state => { state.capacity.staff = '2'; },
  ]) { const bad = structuredClone(valid); corrupt(bad); assert.throws(() => rules.validateBookingPlanner(bad)); }
  const reordered = structuredClone(valid);
  reordered.bookings[0].coordination = Object.fromEntries(Object.entries(reordered.bookings[0].coordination).reverse());
  assert.equal(rules.validateBookingPlanner(reordered), reordered, 'JSON property ordering is not a schema requirement');
});

test('synthetic source stays explicit and editing operational details is audited without rescheduling', () => {
  const original = one({ source: 'synthetic-demo' });
  const next = rules.updateBooking(original, 'BOOKING_1', { flightNumber: 'zz 901', flightDeparture: '2026-09-14T15:00', vehicleType: 'Truck', vehicleRegistration: 'TEST 001', dock: 'Bay 3' }, context());
  assert.equal(next.bookings[0].source, 'synthetic-demo');
  assert.equal(next.bookings[0].history[1].type, 'updated');
  assert.deepEqual(next.bookings[0].history[1].changes.dock, { before: '', after: 'Bay 3' });
  assert.equal(next.bookings[0].slotStart, original.bookings[0].slotStart);
  assert.equal(next.bookings[0].lateAssessment, null);
});

test('booking direction is immutable while AWB corrections retain their previous identity in history', () => {
  const original = freeze(one());
  assert.throws(() => rules.updateBooking(original, 'BOOKING_1', {
    direction: 'Import', origin: 'ISU', destination: 'DWC', reason: 'Move to other direction',
  }, context()), /direction cannot be changed/);
  const corrected = rules.updateBooking(original, 'BOOKING_1', { direction: 'Export', awb: '780-30909809', reason: 'Corrected transcription from customer AWB' }, context());
  assert.equal(corrected.bookings[0].direction, 'Export');
  assert.equal(corrected.bookings[0].awb, '78030909809');
  assert.equal(corrected.bookings[0].reference, original.bookings[0].reference);
  assert.deepEqual(corrected.bookings[0].history[1].changes.awb, { before: '78030909801', after: '78030909809' });
});
