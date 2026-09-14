/** Pure booking rules. Civil slot/arrival times always mean Asia/Dubai (UTC+04).
 * Capacity warnings and late charges are planning proposals, never invoices. */
const ZONE = 'Asia/Dubai';
const OFFSET = 4 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const ACTIVE = new Set(['confirmed', 'arrived']);
const STATUSES = new Set(['confirmed', 'arrived', 'completed', 'cancelled', 'no-show']);
const FIELDS = ['direction', 'awb', 'customer', 'origin', 'destination', 'pieces', 'weight', 'cargoType', 'shc', 'slotStart', 'slotEnd', 'staffRequired', 'coordination', 'source', 'flightNumber', 'flightDeparture', 'vehicleType', 'vehicleRegistration', 'dock'];
const clone = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
}
function text(value, label, maximum = 200, required = false) {
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const result = value.trim();
  if (required && !result) fail(`${label} is required.`);
  if (result.length > maximum) fail(`${label} is too long (maximum ${maximum} characters).`);
  return result;
}
function integer(value, label, minimum = 0, maximum = 1000000) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(`${label} must be a whole number between ${minimum} and ${maximum}.`);
  return value;
}
function number(value, label, minimum = 0, maximum = 1000000000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${label} must be a number between ${minimum} and ${maximum}.`);
  return value;
}
function bool(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be true or false.`);
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,120}$/.test(value)) fail('Booking identifier is invalid.');
  return value;
}
function localTime(value, label = 'Time') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) fail(`${label} must use YYYY-MM-DDTHH:mm in Dubai time.`);
  const result = Date.parse(value + ':00+04:00');
  if (!Number.isFinite(result) || new Date(result + OFFSET).toISOString().slice(0, 16) !== value) fail(`${label} is not a valid Dubai date and time.`);
  return result;
}
function timestamp(value, label = 'Current time') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${label} must be an ISO timestamp with an explicit UTC offset.`);
  localTime(value.slice(0, 16), label);
  const seconds = /T\d{2}:\d{2}:(\d{2})/.exec(value);
  const offset = /[+-](\d{2}):(\d{2})$/.exec(value);
  if (seconds && Number(seconds[1]) > 59 || offset && (Number(offset[1]) > 23 || Number(offset[2]) > 59)) fail(`${label} is invalid.`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(`${label} is invalid.`);
  return parsed;
}
function localFromMs(milliseconds) { return new Date(milliseconds + OFFSET).toISOString().slice(0, 16); }
export function dubaiLocalTime(now) { return localFromMs(timestamp(now)); }
export function dubaiDate(now) { return dubaiLocalTime(now).slice(0, 10); }

function commandContext(context) {
  object(context, 'Action context');
  return { now: timestamp(context.now), at: new Date(timestamp(context.now)).toISOString(), actor: text(context.actor, 'Operator name', 120, true) };
}
function reasonOf(input, required = false) { return text(input.reason ?? '', 'Reason', 2000, required); }
function policy(value) {
  object(value, 'Late-charge policy');
  const enabled = bool(value.enabled, 'Late-charge policy enabled');
  const graceMinutes = integer(value.graceMinutes, 'Grace period', 0, 10080);
  const amount = number(value.amount, 'Proposed late charge', 0, 10000000);
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) fail('Proposed late charge must have at most two decimal places.');
  if (enabled && amount <= 0) fail('An enabled late-charge policy needs a positive proposed amount.');
  if (value.currency !== 'AED') fail('The booking planner supports AED late-charge proposals only.');
  return { enabled, graceMinutes, amount, currency: 'AED' };
}
function capacity(value) {
  object(value, 'Capacity');
  return { staff: integer(value.staff, 'Available staff', 0, 100000), maxConcurrent: integer(value.maxConcurrent, 'Concurrent booking capacity', 0, 100000) };
}
function coordination(value = {}) {
  object(value, 'Coordination');
  const customs = bool(value.customs ?? false, 'Customs required');
  const police = bool(value.police ?? false, 'Police required');
  const customsConfirmed = bool(value.customsConfirmed ?? false, 'Customs arrangement recorded');
  const policeConfirmed = bool(value.policeConfirmed ?? false, 'Police arrangement recorded');
  if (customsConfirmed && !customs || policeConfirmed && !police) fail('An authority arrangement can only be recorded when that coordination is required.');
  return { customs, police, customsConfirmed, policeConfirmed, other: text(value.other ?? '', 'Other coordination', 500), owner: text(value.owner ?? '', 'Coordination owner', 200), note: text(value.note ?? '', 'Coordination note', 2000) };
}
function bookingFields(input) {
  object(input, 'Booking');
  const direction = input.direction;
  if (!['Export', 'Import'].includes(direction)) fail('Choose Export or Import.');
  const awb = text(input.awb, 'AWB', 30, true).replace(/[\s-]/g, '');
  if (!/^\d{11}$/.test(awb)) fail('AWB must contain exactly 11 digits.');
  const origin = text(input.origin, 'Origin', 3, true).toUpperCase();
  const destination = text(input.destination, 'Destination', 3, true).toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) fail('Origin and destination must be three-letter airport codes.');
  if (direction === 'Export' && origin !== 'DWC' || direction === 'Import' && destination !== 'DWC') fail('Export bookings depart DWC; import bookings arrive at DWC.');
  if (origin === destination) fail('Origin and destination must be different.');
  const start = localTime(input.slotStart, 'Slot start'), end = localTime(input.slotEnd, 'Slot end');
  if (end <= start) fail('Slot end must be after slot start.');
  if (end - start > DAY) fail('A booking slot cannot exceed 24 hours.');
  const weight = number(input.weight, 'Weight', 0, 1000000000);
  if (weight <= 0) fail('Weight must be greater than zero.');
  const source = input.source ?? 'manual';
  if (!['manual', 'synthetic-demo'].includes(source)) fail('Booking source is invalid.');
  const flightDeparture = text(input.flightDeparture ?? '', 'Flight departure', 16);
  if (flightDeparture) localTime(flightDeparture, 'Flight departure');
  return { direction, awb, customer: text(input.customer, 'Customer', 200, true), origin, destination,
    pieces: integer(input.pieces, 'Pieces', 1), weight, cargoType: text(input.cargoType ?? 'General', 'Cargo type', 100, true),
    shc: text(input.shc ?? 'GEN', 'SHC', 120, true), slotStart: input.slotStart, slotEnd: input.slotEnd,
    staffRequired: integer(input.staffRequired ?? 1, 'Required staff', 1, 100000), coordination: coordination(input.coordination), source,
    flightNumber: text(input.flightNumber ?? '', 'Flight number', 50).toUpperCase(), flightDeparture,
    vehicleType: text(input.vehicleType ?? '', 'Vehicle type', 80), vehicleRegistration: text(input.vehicleRegistration ?? '', 'Vehicle registration', 80), dock: text(input.dock ?? '', 'Dock', 100) };
}
function event(type, context, reason, changes = {}) { return { type, at: context.at, actor: context.actor, reason, changes }; }
function changesBetween(before, after, keys) {
  const changes = {};
  for (const key of keys) if (canonical(before[key]) !== canonical(after[key])) changes[key] = { before: clone(before[key]), after: clone(after[key]) };
  return changes;
}
function validateHistory(history, label) {
  if (!Array.isArray(history)) fail(`${label} must contain an audit history.`);
  for (const item of history) {
    object(item, 'Audit event'); text(item.type, 'Audit action', 80, true); text(item.actor, 'Audit operator', 120, true);
    timestamp(item.at, 'Audit time'); text(item.reason, 'Audit reason', 2000); object(item.changes, 'Audit changes');
  }
}
function validateAssessment(assessment) {
  if (assessment === null) return;
  object(assessment, 'Late-charge assessment');
  if (!['proposed', 'waived', 'not-configured', 'not-applicable'].includes(assessment.status)) fail('Late-charge assessment status is invalid.');
  integer(assessment.minutesLate, 'Minutes late', 0, 1000000000); integer(assessment.chargeableMinutes, 'Chargeable late minutes', 0, 1000000000);
  number(assessment.amount, 'Assessed late charge', 0, 10000000); policy(assessment.policy); localTime(assessment.assessedArrival, 'Assessed arrival');
  if (assessment.currency !== 'AED') fail('Late-charge assessment currency must be AED.');
  if (assessment.status === 'waived') {text(assessment.waiverReason, 'Waiver reason', 2000, true); text(assessment.waivedBy, 'Waiver operator', 120, true); timestamp(assessment.waivedAt, 'Waiver time');}
}
function overlaps(left, right) { return localTime(left.slotStart) < localTime(right.slotEnd) && localTime(right.slotStart) < localTime(left.slotEnd); }
function rejectOverlaps(bookings) {
  const groups = new Map();
  for (const booking of bookings) if (ACTIVE.has(booking.status)) {
    const key = booking.direction + ':' + booking.awb;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.slotStart.localeCompare(b.slotStart));
    for (let index = 1; index < group.length; index++) if (overlaps(group[index - 1], group[index])) fail(`This AWB already has an overlapping active ${group[index].direction.toLowerCase()} booking.`);
  }
}

export function createBookingPlanner() {
  return { version: 1, bookings: [], capacity: { staff: 0, maxConcurrent: 0 },
    latePolicy: { enabled: false, graceMinutes: 0, amount: 0, currency: 'AED' }, history: [] };
}

export function validateBookingPlanner(planner) {
  object(planner, 'Booking planner');
  if (planner.version !== 1) fail('Unsupported booking planner version.');
  if (!Array.isArray(planner.bookings) || planner.bookings.length > 50000) fail('Booking planner must contain at most 50,000 bookings.');
  capacity(planner.capacity); policy(planner.latePolicy); validateHistory(planner.history ?? [], 'Booking settings');
  const ids = new Set(), references = new Set();
  for (const booking of planner.bookings) {
    object(booking, 'Booking'); identifier(booking.id); text(booking.reference, 'Booking reference', 80, true);
    if (ids.has(booking.id) || references.has(booking.reference)) fail('Booking identifiers and references must be unique.');
    ids.add(booking.id); references.add(booking.reference);
    const normalized = bookingFields(booking);
    for (const key of FIELDS) if (canonical(normalized[key]) !== canonical(booking[key])) fail(`Booking ${key} is not in its canonical form.`);
    if (booking.timezone !== ZONE || !STATUSES.has(booking.status)) fail('Booking timezone or status is invalid.');
    integer(booking.version, 'Booking version', 1); timestamp(booking.createdAt, 'Creation time'); timestamp(booking.updatedAt, 'Update time');
    if (timestamp(booking.updatedAt) < timestamp(booking.createdAt)) fail('Booking update time cannot precede creation.');
    policy(booking.latePolicy); validateHistory(booking.history, 'Booking'); validateAssessment(booking.lateAssessment);
    if (booking.history.length !== booking.version) fail('Booking version must match its audit history.');
    if (booking.actualArrival !== null) localTime(booking.actualArrival, 'Actual arrival');
    if (booking.completedAt !== null) timestamp(booking.completedAt, 'Completion time');
    if (booking.cancelledAt !== null) timestamp(booking.cancelledAt, 'Cancellation time');
    if (booking.noShowAt !== null) timestamp(booking.noShowAt, 'No-show time');
    if (['arrived', 'completed'].includes(booking.status)) {
      if (booking.actualArrival === null || booking.lateAssessment === null) fail('An arrived booking needs its actual arrival and late-charge assessment.');
    } else if (booking.actualArrival !== null || booking.lateAssessment !== null) fail('A booking without arrival cannot have an arrival assessment.');
    if ((booking.status === 'completed') !== (booking.completedAt !== null) || (booking.status === 'cancelled') !== (booking.cancelledAt !== null) || (booking.status === 'no-show') !== (booking.noShowAt !== null)) fail('Booking terminal time does not match its status.');
    if (booking.noShowAt && timestamp(booking.noShowAt) <= localTime(booking.slotEnd)) fail('A no-show can only be recorded after the slot ends.');
    if (booking.lateAssessment && booking.lateAssessment.assessedArrival !== booking.actualArrival) fail('Late-charge assessment must refer to the recorded arrival.');
    if (booking.completedAt && timestamp(booking.completedAt) < localTime(booking.actualArrival)) fail('Completion cannot precede actual arrival.');
    if (booking.lateAssessment) {
      const expected = evaluateLateCharge(booking), recorded = booking.lateAssessment;
      for (const key of ['minutesLate', 'chargeableMinutes', 'amount', 'currency', 'policy', 'assessedArrival']) {
        if (canonical(expected[key]) !== canonical(recorded[key])) fail('Late-charge assessment does not match the recorded arrival and captured policy.');
      }
      if (recorded.status === 'waived' ? expected.status !== 'proposed' : recorded.status !== expected.status) fail('Late-charge assessment status does not match the captured policy.');
    }
  }
  rejectOverlaps(planner.bookings);
  return planner;
}

function replaceBooking(planner, booking) {
  const next = clone(planner); next.bookings[next.bookings.findIndex(item => item.id === booking.id)] = booking;
  return validateBookingPlanner(next);
}
function findBooking(planner, id, context) {
  validateBookingPlanner(planner); identifier(id);
  const found = planner.bookings.find(booking => booking.id === id);
  if (!found) fail('Booking was not found.');
  if (context.now < timestamp(found.updatedAt)) fail('The action time cannot precede the latest booking update.');
  return found;
}
export function createBooking(planner, input, context) {
  validateBookingPlanner(planner); const ctx = commandContext(context), fields = bookingFields(input);
  const reason = reasonOf(input, localTime(fields.slotStart) < Math.floor(ctx.now / MINUTE) * MINUTE);
  const id = identifier(context.id ?? globalThis.crypto.randomUUID());
  if (planner.bookings.some(item => item.id === id)) fail('Booking identifier already exists.');
  const booking = { id, reference: `BKG-${localFromMs(ctx.now).slice(0, 10).replaceAll('-', '')}-${String(planner.bookings.length + 1).padStart(4, '0')}`,
    ...fields, timezone: ZONE, status: 'confirmed', version: 1, actualArrival: null, completedAt: null, cancelledAt: null, noShowAt: null,
    latePolicy: clone(planner.latePolicy), lateAssessment: null, createdAt: ctx.at, updatedAt: ctx.at,
    history: [event('created', ctx, reason, { slotStart: { before: null, after: fields.slotStart }, slotEnd: { before: null, after: fields.slotEnd } })] };
  const next = clone(planner); next.bookings.push(booking); return validateBookingPlanner(next);
}

export function updateBooking(planner, id, input, context) {
  const ctx = commandContext(context), before = findBooking(planner, id, ctx); object(input, 'Booking update');
  for (const key of Object.keys(input)) if (![...FIELDS, 'reason'].includes(key)) fail(`Booking ${key} cannot be edited.`);
  if (own(input, 'direction') && input.direction !== before.direction) fail('Booking direction cannot be changed. Create a separate import or export booking.');
  const editKeys = Object.keys(input).filter(key => key !== 'reason');
  if (before.status !== 'confirmed' && !(before.status === 'arrived' && editKeys.every(key => key === 'coordination'))) fail('Only confirmed bookings can be edited; arrived bookings allow coordination updates only.');
  const merged = { ...before, ...input, coordination: own(input, 'coordination') ? { ...before.coordination, ...input.coordination } : before.coordination };
  const fields = bookingFields(merged), changes = changesBetween(before, fields, FIELDS);
  const rescheduled = own(changes, 'slotStart') || own(changes, 'slotEnd');
  const reason = reasonOf(input, rescheduled);
  if (Object.keys(changes).length === 0) return clone(planner);
  return replaceBooking(planner, { ...clone(before), ...fields, version: before.version + 1, updatedAt: ctx.at,
    history: [...clone(before.history), event(rescheduled ? 'rescheduled' : 'updated', ctx, reason, changes)] });
}

export function bookingLateness(booking, now) {
  const end = localTime(booking.slotEnd, 'Slot end');
  const hasArrived = booking.actualArrival !== null && booking.actualArrival !== undefined;
  const reference = hasArrived ? localTime(booking.actualArrival, 'Actual arrival') : timestamp(now);
  const minutesLate = ['cancelled', 'no-show'].includes(booking.status) ? 0 : Math.max(0, Math.floor((reference - end) / MINUTE));
  return { minutesLate, hasArrived, overdue: booking.status === 'confirmed' && reference > end, referenceTime: localFromMs(reference), slotEnd: booking.slotEnd };
}

export function evaluateLateCharge(booking, chosenPolicy = booking.latePolicy) {
  if (booking.actualArrival === null || booking.actualArrival === undefined || ['cancelled', 'no-show'].includes(booking.status)) return null;
  const captured = policy(chosenPolicy), arrival = localTime(booking.actualArrival, 'Actual arrival'), end = localTime(booking.slotEnd, 'Slot end');
  const minutesLate = Math.max(0, Math.floor((arrival - end) / MINUTE));
  const chargeableMinutes = Math.max(0, minutesLate - captured.graceMinutes);
  const status = !captured.enabled ? 'not-configured' : chargeableMinutes > 0 ? 'proposed' : 'not-applicable';
  return { status, minutesLate, chargeableMinutes, amount: status === 'proposed' ? captured.amount : 0,
    currency: 'AED', policy: captured, assessedArrival: booking.actualArrival };
}

export function transitionBooking(planner, id, action, details = {}, context) {
  const ctx = commandContext(context), before = findBooking(planner, id, ctx); object(details, 'Booking action details');
  const next = clone(before); let reason = reasonOf(details);
  if (action === 'arrive') {
    if (before.status !== 'confirmed') fail('Only a confirmed booking can record an arrival.');
    const actualArrival = details.actualArrival ?? localFromMs(ctx.now), arrival = localTime(actualArrival, 'Actual arrival');
    if (arrival > ctx.now + MINUTE) fail('Actual arrival cannot be more than one minute in the future.');
    if (actualArrival.slice(0, 10) < localFromMs(ctx.now).slice(0, 10)) reason = reasonOf(details, true);
    next.actualArrival = actualArrival; next.status = 'arrived'; next.lateAssessment = evaluateLateCharge(next);
  } else if (action === 'complete') {
    if (before.status !== 'arrived') fail('Record the actual arrival before completing a booking.');
    if (ctx.now < localTime(before.actualArrival)) fail('Completion cannot precede actual arrival.');
    next.status = 'completed'; next.completedAt = ctx.at;
  } else if (action === 'cancel') {
    if (before.status !== 'confirmed') fail('Only a confirmed booking can be cancelled.');
    reason = reasonOf(details, true); next.status = 'cancelled'; next.cancelledAt = ctx.at;
  } else if (action === 'no-show') {
    if (before.status !== 'confirmed') fail('Only a confirmed booking can be marked as a no-show.');
    if (ctx.now <= localTime(before.slotEnd)) fail('A no-show can only be recorded after the slot ends.');
    reason = reasonOf(details, true); next.status = 'no-show'; next.noShowAt = ctx.at;
  } else if (action === 'waiveLateCharge') {
    if (!['arrived', 'completed'].includes(before.status) || before.lateAssessment?.status !== 'proposed') fail('Only an existing late-charge proposal can be waived.');
    reason = reasonOf(details, true);
    next.lateAssessment = { ...next.lateAssessment, status: 'waived', waiverReason: reason, waivedBy: ctx.actor, waivedAt: ctx.at };
  } else fail('Unknown booking action.');
  const changes = changesBetween(before, next, ['status', 'actualArrival', 'completedAt', 'cancelledAt', 'noShowAt', 'lateAssessment']);
  next.version++; next.updatedAt = ctx.at; next.history.push(event(action, ctx, reason, changes));
  return replaceBooking(planner, next);
}

export function updateBookingSettings(planner, input, context) {
  validateBookingPlanner(planner); object(input, 'Booking settings'); const ctx = commandContext(context);
  if (planner.history?.length && ctx.now < timestamp(planner.history.at(-1).at)) fail('The settings action time cannot precede the latest settings update.');
  for (const key of Object.keys(input)) if (!['capacity', 'latePolicy', 'reason'].includes(key)) fail(`Unknown booking setting: ${key}.`);
  const next = clone(planner);
  if (own(input, 'capacity')) {object(input.capacity, 'Capacity'); next.capacity = capacity({ ...planner.capacity, ...input.capacity });}
  if (own(input, 'latePolicy')) {object(input.latePolicy, 'Late-charge policy'); next.latePolicy = policy({ ...planner.latePolicy, ...input.latePolicy });}
  const changes = changesBetween(planner, next, ['capacity', 'latePolicy']);
  if (Object.keys(changes).length) {next.history ??= []; next.history.push(event('settings-updated', ctx, reasonOf(input), changes));}
  return validateBookingPlanner(next);
}

export function planDay(planner, date, now) {
  validateBookingPlanner(planner); timestamp(now);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('Planning day must use YYYY-MM-DD.');
  const start = localTime(date + 'T00:00', 'Planning day'), end = start + DAY;
  const bookings = planner.bookings.filter(booking => localTime(booking.slotStart) < end && localTime(booking.slotEnd) > start)
    .sort((left, right) => left.slotStart.localeCompare(right.slotStart) || left.reference.localeCompare(right.reference));
  const counts = { total: bookings.length, confirmed: 0, arrived: 0, completed: 0, cancelled: 0, noShow: 0, overdue: 0 };
  const planned = bookings.filter(booking => !['cancelled', 'no-show'].includes(booking.status));
  const boundaries = new Map();
  for (const booking of bookings) {counts[booking.status === 'no-show' ? 'noShow' : booking.status]++; if (bookingLateness(booking, now).overdue) counts.overdue++;}
  const boundary = (at, staff, bookings) => {
    const delta = boundaries.get(at) ?? { staff: 0, bookings: 0 };
    delta.staff += staff; delta.bookings += bookings; boundaries.set(at, delta);
  };
  for (const booking of planned) {
    boundary(Math.max(start, localTime(booking.slotStart)), booking.staffRequired, 1);
    boundary(Math.min(end, localTime(booking.slotEnd)), -booking.staffRequired, -1);
  }
  const points = [...boundaries.keys()].sort((a, b) => a - b), workload = [], capacityWarnings = [], peak = { staffRequired: 0, concurrentBookings: 0 };
  let staffRequired = 0, concurrentBookings = 0;
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index], to = points[index + 1];
    staffRequired += boundaries.get(from).staff; concurrentBookings += boundaries.get(from).bookings;
    if (!concurrentBookings) continue;
    const segment = { slotStart: localFromMs(from), slotEnd: localFromMs(to), staffRequired, concurrentBookings };
    workload.push(segment); peak.staffRequired = Math.max(peak.staffRequired, segment.staffRequired); peak.concurrentBookings = Math.max(peak.concurrentBookings, segment.concurrentBookings);
    const staffExceeded = planner.capacity.staff > 0 && segment.staffRequired > planner.capacity.staff;
    const concurrentExceeded = planner.capacity.maxConcurrent > 0 && segment.concurrentBookings > planner.capacity.maxConcurrent;
    if (staffExceeded || concurrentExceeded) capacityWarnings.push({ ...segment, staffExceeded, concurrentExceeded });
  }
  const requiring = planned.filter(booking => booking.coordination.customs || booking.coordination.police || booking.coordination.other);
  return { date, timezone: ZONE, bookings: clone(bookings), counts, capacity: clone(planner.capacity), peak, workload, capacityWarnings,
    coordination: { customs: planned.filter(booking => booking.coordination.customs).length, police: planned.filter(booking => booking.coordination.police).length,
      unassigned: requiring.filter(booking => !booking.coordination.owner).length, owners: [...new Set(requiring.map(booking => booking.coordination.owner).filter(Boolean))].sort() } };
}
