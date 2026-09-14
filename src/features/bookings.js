import { app } from '../core/runtime.js';
import { planDay, bookingLateness, dubaiDate, dubaiLocalTime } from '../domain/bookings.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const byId = id => document.getElementById(id);
const amount = value => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const number = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(Number(value || 0));
const humanDate = value => value ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z')) : '';
const localDisplay = value => value ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)} ${value.slice(11, 16)}` : 'Not recorded';
const time = value => value?.slice(11, 16) || '—';
const STATUS = { confirmed: 'Booked', arrived: 'Arrived', completed: 'Completed', cancelled: 'Cancelled', 'no-show': 'No-show' };
const GLYPHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2m4 0h2m-8 3h2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  left: '<path d="m14 5-7 7 7 7"/>',
  right: '<path d="m10 5 7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="m12 3 10 18H2L12 3ZM12 9v5m0 3v.1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
};
const icon = name => `<svg class="bp-icon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPHS[name] || GLYPHS.calendar}</svg>`;
const states = { Export: { date: dubaiDate(new Date().toISOString()), query: '', status: 'active' }, Import: { date: dubaiDate(new Date().toISOString()), query: '', status: 'active' } };
let activeDirection = 'Export';
let initialized = false;
let committing = false;
let returnFocus;

function planner() { return app.bookingPlanner(); }
function pendingCoordination(booking) {
  const coordination = booking.coordination || {};
  return Boolean(coordination.customs && !coordination.customsConfirmed || coordination.police && !coordination.policeConfirmed || (coordination.customs || coordination.police || coordination.other) && !coordination.owner);
}
function badge(booking) { return `<span class="bp-badge bp-status-${booking.status}">${STATUS[booking.status] || esc(booking.status)}</span>`; }
function bookingById(id) { return planner().bookings.find(booking => booking.id === id); }
function pageId(direction) { return `p-bookings-${direction.toLowerCase()}`; }
function shiftDate(date, days) {
  const instant = new Date(date + 'T12:00:00Z');
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}

function workloadMarkup(day) {
  const highest = Math.max(day.peak.staffRequired, day.capacity.staff, 1);
  const percent = value => value.slice(0, 10) < day.date ? 0 : value.slice(0, 10) > day.date ? 100 : (Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16))) / 14.4;
  const segments = (day.workload || []).map(segment => {
    const left = percent(segment.slotStart), width = Math.max(0, percent(segment.slotEnd) - left);
    const exceeded = day.capacity.staff > 0 && segment.staffRequired > day.capacity.staff || day.capacity.maxConcurrent > 0 && segment.concurrentBookings > day.capacity.maxConcurrent;
    return `<div class="bp-load-block ${exceeded ? 'bp-load-over' : ''}" style="left:${left}%;width:${width}%;height:${Math.max(4, segment.staffRequired / highest * 100)}%" title="${esc(time(segment.slotStart))}–${esc(time(segment.slotEnd))}: ${segment.staffRequired} staff / ${segment.concurrentBookings} bookings"><span>${segment.staffRequired}</span></div>`;
  }).join('');
  return `<section class="bp-workload" aria-label="Shared hourly planned staffing workload"><header><div><div class="bp-eyebrow">EXPORT + IMPORT · SHARED TEAM</div><h2>The day’s workload</h2></div><span class="bp-workload-note">Peak ${number(day.peak.staffRequired)} staff · ${number(day.peak.concurrentBookings)} concurrent bookings</span></header><div class="bp-workload-scroll"><div class="bp-chart"><div class="bp-load-axis">${day.capacity.staff ? `<span>Capacity ${number(day.capacity.staff)}</span>` : '<span>Staff capacity not set</span>'}<span>Staff demand</span></div><div class="bp-load-plot">${day.capacity.staff ? `<div class="bp-capacity-line" style="bottom:${day.capacity.staff / highest * 100}%"></div>` : ''}${segments || '<div class="bp-chart-empty">No planned booking windows in this day</div>'}<div class="bp-chart-grid">${Array.from({ length: 24 }, () => '<span></span>').join('')}</div></div><div class="bp-chart-hours">${Array.from({ length: 24 }, (_, hour) => `<span>${String(hour).padStart(2, '0')}</span>`).join('')}</div></div></div><footer><span><i></i> Planned staff demand</span><span><i class="bp-legend-capacity"></i> ${day.capacity.staff ? 'Configured staff capacity' : 'Set capacity to identify conflicts'}</span><span><i class="bp-legend-over"></i> Capacity exceeded</span><span>Dubai · GST (UTC+4). Planned windows include completed visits; exclude cancelled / no-show. Not live occupancy.</span></footer></section>`;
}

function visibleBookings(day, direction) {
  const state = states[direction], query = state.query.toLowerCase();
  return day.bookings.filter(booking => {
    if (booking.direction !== direction) return false;
    if (state.status === 'active' && !['confirmed', 'arrived'].includes(booking.status)) return false;
    if (state.status === 'overdue' && !bookingLateness(booking, new Date().toISOString()).overdue) return false;
    if (state.status === 'coordination' && !pendingCoordination(booking)) return false;
    if (!['active', 'all', 'overdue', 'coordination'].includes(state.status) && booking.status !== state.status) return false;
    return !query || [booking.awb, booking.reference, booking.customer, booking.cargoType, booking.shc, booking.flightNumber, booking.vehicleRegistration, booking.dock, booking.coordination?.owner].some(value => String(value || '').toLowerCase().includes(query)) || query.replace(/\D/g, '').length >= 3 && booking.awb.replace(/\D/g, '').includes(query.replace(/\D/g, ''));
  });
}

function coordinationBadges(booking) {
  const coordination = booking.coordination || {};
  const requirements = [coordination.customs ? `<span class="bp-coord ${coordination.customsConfirmed ? 'bp-coord-ready' : ''}">${icon(coordination.customsConfirmed ? 'check' : 'shield')} Customs${coordination.customsConfirmed ? ' confirmed' : ' required'}</span>` : '', coordination.police ? `<span class="bp-coord ${coordination.policeConfirmed ? 'bp-coord-ready' : ''}">${icon(coordination.policeConfirmed ? 'check' : 'shield')} Police${coordination.policeConfirmed ? ' confirmed' : ' required'}</span>` : '', coordination.other ? `<span class="bp-coord">${icon('people')}${esc(coordination.other)}</span>` : ''].filter(Boolean);
  return requirements.length ? requirements.join('') : '<span class="bp-no-coordination">No external coordination recorded</span>';
}

function bookingCard(booking) {
  const late = bookingLateness(booking, new Date().toISOString());
  const proposal = booking.lateAssessment;
  return `<article class="bp-booking" data-booking-id="${esc(booking.id)}"><div class="bp-booking-time"><strong>${esc(time(booking.slotStart))}</strong><span>to ${esc(time(booking.slotEnd))}</span>${booking.slotStart.slice(0, 10) !== booking.slotEnd.slice(0, 10) ? '<small>Overnight slot</small>' : ''}<span class="bp-time-rule"></span>${icon('clock')}</div><div class="bp-booking-info"><div class="bp-booking-head"><button type="button" class="bp-awb" data-bp-detail="${esc(booking.id)}">${esc(booking.awb)}</button>${badge(booking)}${booking.source === 'synthetic-demo' ? '<span class="bp-demo-label">Synthetic example</span>' : ''}${late.overdue ? `<span class="bp-badge bp-overdue">${number(late.minutesLate)} min overdue</span>` : ''}</div><h3>${esc(booking.customer)}</h3><div class="bp-booking-facts"><span>${esc(booking.origin)} ${icon('arrow')} ${esc(booking.destination)}</span><span>${esc(booking.cargoType)} · ${esc(booking.shc)}</span><span>${number(booking.pieces)} pcs · ${number(booking.weight)} kg</span><span>${icon('people')}${number(booking.staffRequired)} staff</span></div><div class="bp-booking-coordination">${coordinationBadges(booking)}</div>${booking.coordination?.owner ? `<div class="bp-owner">Coordination owner <strong>${esc(booking.coordination.owner)}</strong></div>` : ''}${proposal?.status === 'proposed' ? `<button type="button" class="bp-proposal-link" data-bp-detail="${esc(booking.id)}">${icon('alert')} Late fee proposal · AED ${amount(proposal.amount)} · review required</button>` : ''}</div><div class="bp-booking-actions"><button type="button" class="bp-button bp-button-quiet" data-bp-detail="${esc(booking.id)}">Manage ${icon('right')}</button>${booking.status === 'confirmed' ? `<button type="button" class="bp-button bp-button-soft" data-bp-arrive="${esc(booking.id)}">Record arrival</button>` : booking.status === 'arrived' ? `<button type="button" class="bp-button bp-button-soft" data-bp-complete="${esc(booking.id)}">Complete visit</button>` : ''}<small>${esc(booking.reference)}</small></div></article>`;
}

function renderAgenda(direction, day = planDay(planner(), states[direction].date, new Date().toISOString())) {
  const container = byId(`bp-agenda-${direction}`);
  if (!container) return;
  const filtered = visibleBookings(day, direction);
  byId(`bp-list-count-${direction}`).textContent = `${filtered.length} shown`;
  const hasAny = day.bookings.some(booking => booking.direction === direction);
  container.innerHTML = filtered.length ? filtered.map(bookingCard).join('') : `<div class="bp-empty">${icon('calendar')}<h3>${hasAny ? 'No bookings match these filters' : `A clear day for ${direction.toLowerCase()} bookings`}</h3><p>${hasAny ? 'Adjust the status or search to see the other bookings on this date.' : 'Reserve a slot, plan the team and record any customs or police coordination.'}</p><div><button type="button" class="bp-button bp-button-primary" data-bp-new="${direction}">${icon('plus')} New ${direction.toLowerCase()} booking</button>${!planner().bookings.length ? `<button type="button" class="bp-button bp-button-quiet" data-bp-sample="${direction}">Try a synthetic example</button>` : ''}</div></div>`;
}

function renderPage(direction) {
  const page = byId(pageId(direction));
  if (!page) return;
  const state = states[direction];
  const current = planner();
  const day = planDay(current, state.date, new Date().toISOString());
  const directional = day.bookings.filter(booking => booking.direction === direction && !['cancelled', 'no-show'].includes(booking.status));
  const pending = day.bookings.filter(booking => ['confirmed', 'arrived'].includes(booking.status) && pendingCoordination(booking)).length;
  page.innerHTML = `<div class="booking-planner" data-booking-direction="${direction}"><section class="bp-topline"><div><span class="bp-eyebrow">INTERNAL CS PROTOTYPE</span><h2>Make room for what’s next.</h2><p>${direction === 'Export' ? 'Schedule cargo drop-offs and prepare the acceptance team.' : 'Schedule import collection visits and coordinate the receiving team.'}</p></div><div class="bp-top-actions"><button type="button" class="bp-button bp-button-secondary" data-bp-settings>${icon('settings')} Planning rules</button><button type="button" class="bp-button bp-button-primary" data-bp-new="${direction}">${icon('plus')} New booking</button></div></section><section class="bp-daybar" aria-label="Booking date"><div class="bp-day-title">${icon('calendar')}<div><span>YOUR SELECTED DAY</span><h3>${esc(humanDate(state.date))}</h3></div></div><div class="bp-date-controls"><button type="button" class="bp-button bp-day-arrow" data-bp-shift="-1" aria-label="Previous day">${icon('left')}</button><label class="bp-date-field"><span class="ws-sr-only">Booking date</span><input id="bp-date-${direction}" data-bp-date type="date" value="${state.date}" aria-label="Booking date"></label><button type="button" class="bp-button bp-day-arrow" data-bp-shift="1" aria-label="Next day">${icon('right')}</button><button type="button" class="bp-button bp-button-quiet" data-bp-today>Today</button></div></section><section class="bp-summary" aria-label="Day planning summary"><div><span>${direction} bookings</span><strong>${directional.length}</strong><small>Excludes cancelled / no-show</small></div><div><span>Shared team peak</span><strong>${number(day.peak.staffRequired)} <small>/ ${day.capacity.staff ? number(day.capacity.staff) : 'not set'}</small></strong><small>Staff · export + import</small></div><div><span>Coordination to confirm</span><strong>${pending}</strong><small>Across both directions</small></div><div class="${day.capacityWarnings.length ? 'bp-summary-alert' : ''}"><span>Capacity conflict windows</span><strong>${day.capacityWarnings.length}</strong><small>${!day.capacity.staff && !day.capacity.maxConcurrent ? 'Set capacity before assessing load' : 'Shared staff / concurrent bookings'}</small></div></section>${day.capacityWarnings.length ? `<div class="bp-notice bp-notice-warning" role="status">${icon('alert')}<div><strong>Planned demand exceeds configured capacity.</strong><span>${day.capacityWarnings.slice(0, 3).map(window => `${time(window.slotStart)}–${time(window.slotEnd)}: ${window.staffRequired} staff / ${window.concurrentBookings} bookings`).map(esc).join(' · ')}${day.capacityWarnings.length > 3 ? ' · more windows in the workload chart' : ''}. Review staffing or reschedule a booking.</span></div></div>` : !day.capacity.staff && !day.capacity.maxConcurrent ? `<div class="bp-notice">${icon('people')}<div><strong>Capacity is not configured.</strong><span>Set available staff or a concurrent-booking limit to flag overlapping demand.</span></div><button type="button" class="bp-text-button" data-bp-settings>Set capacity ${icon('arrow')}</button></div>` : ''}${workloadMarkup(day)}<section class="bp-agenda-panel"><header class="bp-agenda-header"><div><span class="bp-eyebrow">${direction.toUpperCase()} APPOINTMENTS</span><h2>Booking agenda <span id="bp-list-count-${direction}"></span></h2></div><div class="bp-filters"><label class="bp-search">${icon('search')}<input data-bp-search aria-label="Search bookings" placeholder="AWB, customer or owner…" value="${esc(state.query)}" type="search"></label><label><span class="ws-sr-only">Booking status</span><select data-bp-status aria-label="Booking status">${[['active', 'Active bookings'], ['all', 'All statuses'], ['confirmed', 'Booked'], ['arrived', 'Arrived'], ['overdue', 'Overdue arrival'], ['coordination', 'Coordination pending'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['no-show', 'No-show']].map(([value, label]) => `<option value="${value}" ${state.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div></header><div id="bp-agenda-${direction}"></div></section><footer class="bp-planner-footer">${icon('shield')} Internal CS scheduling prototype · arrival means customer/vehicle check-in; completion means the visit finished. Cargo acceptance and release remain separate.</footer></div>`;
  renderAgenda(direction, day);
}

function dialog(title, contents, { wide = false, drawer = false } = {}) {
  const element = byId('bp-dialog');
  if (!element.open) returnFocus = document.activeElement;
  element.className = `bp-dialog${wide ? ' bp-dialog-wide' : ''}${drawer ? ' bp-dialog-drawer' : ''}`;
  element.innerHTML = `<header class="bp-dialog-heading"><div><span class="bp-eyebrow">INTERNAL CS PROTOTYPE · DUBAI</span><h2 id="bp-dialog-title">${esc(title)}</h2></div><button type="button" class="bp-button bp-dialog-close" data-bp-close aria-label="Close booking dialog">${icon('close')}</button></header><div class="bp-dialog-body">${contents}</div>`;
  if (!element.open) element.showModal(); else element.querySelector('[data-bp-close]')?.focus();
  app.uaeDateFields?.();
  element.scrollTop = 0;
  element.querySelector('.bp-dialog-body').scrollTop = 0;
}
function closeDialog() { byId('bp-dialog').close(); if (returnFocus?.isConnected) returnFocus.focus(); }
function formError(message) { const target = byId('bp-form-error'); if (target) { target.textContent = message; target.hidden = false; target.scrollIntoView({ block: 'nearest' }); } }
function execute(action, ...args) {
  committing = true;
  let saved = false;
  try { saved = app.bookingCommand(action, ...args); }
  finally { committing = false; }
  if (!saved) { formError(app.bookingError || 'The booking could not be saved. Your input is still available.'); return false; }
  renderPage(activeDirection);
  return true;
}
const errorRegion = '<p id="bp-form-error" class="bp-form-error" role="alert" hidden></p>';
function field(label, input, wide = false) { return `<label class="bp-field${wide ? ' bp-field-wide' : ''}"><span>${label}</span>${input}</label>`; }
function textInput(name, value = '', extra = '') { return `<input name="${name}" value="${esc(value)}" ${extra}>`; }
function coordinationFields(coordination = {}) {
  return `<fieldset class="bp-coordination-fields"><legend>Coordination before the visit</legend><p>Record requirements and your team’s confirmed arrangements. These checkboxes do not verify authority attendance.</p><div class="bp-coordination-options"><div><label><input type="checkbox" name="customs" ${coordination.customs ? 'checked' : ''}> Customs required</label><label class="bp-confirmation"><input type="checkbox" name="customsConfirmed" ${coordination.customsConfirmed ? 'checked' : ''}> Arrangement confirmed</label></div><div><label><input type="checkbox" name="police" ${coordination.police ? 'checked' : ''}> Police required</label><label class="bp-confirmation"><input type="checkbox" name="policeConfirmed" ${coordination.policeConfirmed ? 'checked' : ''}> Arrangement confirmed</label></div></div><div class="bp-form-grid">${field('Other coordination', textInput('other', coordination.other, 'placeholder="e.g. handling agent or special equipment" maxlength="200"'))}${field('Coordination owner', textInput('coordinationOwner', coordination.owner, 'placeholder="Person or team responsible" maxlength="120"'))}${field('Coordination note', `<textarea name="coordinationNote" rows="2" maxlength="1000" placeholder="Contacts, arrangements or outstanding actions">${esc(coordination.note)}</textarea>`, true)}</div></fieldset>`;
}
function readCoordination(form) { return { customs: form.elements.customs.checked, police: form.elements.police.checked, customsConfirmed: form.elements.customsConfirmed.checked, policeConfirmed: form.elements.policeConfirmed.checked, other: form.elements.other.value, owner: form.elements.coordinationOwner.value, note: form.elements.coordinationNote.value }; }

function openBookingForm(direction, booking = null, synthetic = false) {
  const state = states[direction];
  const firstCustomer = synthetic ? app.CUSTOMERS?.[0]?.name || '' : '';
  const currentLocal = dubaiLocalTime(new Date().toISOString());
  const nextHour = state.date === currentLocal.slice(0, 10) && Number(currentLocal.slice(11, 13)) < 22 ? Number(currentLocal.slice(11, 13)) + 1 : 9;
  const defaultStart = state.date + 'T' + String(nextHour).padStart(2, '0') + ':00';
  const defaultEnd = state.date + 'T' + String(nextHour + 1).padStart(2, '0') + ':00';
  const values = booking || { direction, awb: synthetic ? direction === 'Export' ? '780-30909701' : '780-30909702' : '', customer: firstCustomer, origin: direction === 'Export' ? 'DWC' : synthetic ? 'NBO' : '', destination: direction === 'Import' ? 'DWC' : synthetic ? 'NBO' : '', cargoType: 'General', shc: 'GEN', pieces: synthetic ? 12 : '', weight: synthetic ? 250 : '', staffRequired: 1, slotStart: defaultStart, slotEnd: defaultEnd, coordination: {}, source: synthetic ? 'synthetic-demo' : 'manual' };
  const policy = booking?.latePolicy || planner().latePolicy;
  dialog(booking ? 'Edit booking / reschedule' : `New ${direction.toLowerCase()} booking`, `<form id="bp-booking-form">${errorRegion}${values.source === 'synthetic-demo' ? '<div class="bp-notice">Synthetic example · review the fields and save only if you want this example in the planner.</div>' : ''}<div class="bp-form-section-title"><span>01</span><div><h3>Cargo and customer</h3><p>${direction === 'Export' ? 'Cargo drop-off booking' : 'Import collection booking'} · internal planning record</p></div><span class="bp-direction-tag">${direction}</span></div><div class="bp-form-grid">${field('Master air waybill *', textInput('awb', values.awb, 'required maxlength="30" placeholder="780-12345678" autocomplete="off"'))}${field('Customer *', textInput('customer', values.customer, 'required list="bp-customer-list" maxlength="200" placeholder="Select or enter customer"'))}${field('Origin *', textInput('origin', values.origin, `required maxlength="3" ${direction === 'Export' ? 'readonly' : ''} placeholder="IATA code"`))}${field('Destination *', textInput('destination', values.destination, `required maxlength="3" ${direction === 'Import' ? 'readonly' : ''} placeholder="IATA code"`))}${field('Cargo type *', textInput('cargoType', values.cargoType, 'required list="bp-cargo-list" maxlength="100"'))}${field('Handling code / SHC *', textInput('shc', values.shc, 'required list="bp-shc-list" maxlength="80" placeholder="GEN, PER, DGR…"'))}${field('Pieces *', textInput('pieces', values.pieces, 'type="number" required min="1" step="1"'))}${field('Gross weight (kg) *', textInput('weight', values.weight, 'type="number" required min="0.001" step="any"'))}</div><div class="bp-form-section-title"><span>02</span><div><h3>Visit window and team</h3><p>All dates and times are Dubai / GST (UTC+4).</p></div></div><div class="bp-form-grid">${field('Arrival window start *', textInput('slotStart', values.slotStart, 'type="datetime-local" required'))}${field('Arrival window end *', textInput('slotEnd', values.slotEnd, 'type="datetime-local" required'))}${field('Staff required *', textInput('staffRequired', values.staffRequired, 'type="number" min="1" step="1" required'))}${field('Dock / location', textInput('dock', values.dock, 'maxlength="100" placeholder="Optional planned dock"'))}${field('Flight number', textInput('flightNumber', values.flightNumber, 'maxlength="30" placeholder="Optional flight reference"'))}${field('Flight departure · Dubai', textInput('flightDeparture', values.flightDeparture, 'type="datetime-local"'))}${field('Vehicle type', textInput('vehicleType', values.vehicleType, 'maxlength="100" placeholder="e.g. van or reefer truck"'))}${field('Vehicle registration', textInput('vehicleRegistration', values.vehicleRegistration, 'maxlength="60" placeholder="Optional vehicle plate"'))}${field(booking ? 'Reason for rescheduling' : 'Reason if booking a past slot', textInput('reason', synthetic ? 'Synthetic example for internal planner evaluation' : '', 'maxlength="1000" placeholder="Required for a slot change or past slot"'))}</div>${coordinationFields(values.coordination)}<div class="bp-policy-note">${icon('clock')}<span>${policy?.enabled ? `This booking’s policy: AED ${amount(policy.amount)} proposed after arrival is more than ${number(policy.graceMinutes)} minutes past the <strong>slot end</strong>. A proposal requires review and is never added to the invoice ledger here.` : 'Late fees are disabled for this booking. Configure future-booking policy in Planning rules; changing policy does not retroactively change existing bookings.'}</span></div><datalist id="bp-customer-list">${(app.CUSTOMERS || []).map(customer => `<option value="${esc(customer.name)}"></option>`).join('')}</datalist><datalist id="bp-cargo-list">${['General', 'Perishable', 'Dangerous goods', 'Live animals', 'Pharmaceuticals', 'Valuable', 'Other'].map(value => `<option value="${value}"></option>`).join('')}</datalist><datalist id="bp-shc-list">${(app.CFG.shcCodes || []).map(code => `<option value="${esc(code.c)}">${esc(code.d)}</option>`).join('')}</datalist><div class="bp-form-actions"><button type="button" class="bp-button bp-button-secondary" data-bp-close>Keep planning</button><button type="submit" class="bp-button bp-button-primary" id="bp-save-booking">${booking ? 'Save changes' : 'Save booking'} ${icon('check')}</button></div></form>`, { wide: true });
  const form = byId('bp-booking-form');
  form.onsubmit = event => {
    event.preventDefault();
    const input = { direction, awb: form.elements.awb.value, customer: form.elements.customer.value, origin: form.elements.origin.value, destination: form.elements.destination.value, cargoType: form.elements.cargoType.value, shc: form.elements.shc.value, pieces: Number(form.elements.pieces.value), weight: Number(form.elements.weight.value), slotStart: form.elements.slotStart.value, slotEnd: form.elements.slotEnd.value, staffRequired: Number(form.elements.staffRequired.value), reason: form.elements.reason.value, flightNumber: form.elements.flightNumber.value, flightDeparture: form.elements.flightDeparture.value, vehicleType: form.elements.vehicleType.value, vehicleRegistration: form.elements.vehicleRegistration.value, dock: form.elements.dock.value, coordination: readCoordination(form), source: values.source || 'manual' };
    const success = booking ? execute('update', booking.id, input) : execute('create', input);
    if (success) { state.date = input.slotStart.slice(0, 10); state.status = 'active'; closeDialog(); renderPage(direction); app.toast(booking ? 'Booking updated' : 'Booking saved', 'ok'); }
  };
}

function openCoordination(booking) {
  dialog('Update coordination', `<form id="bp-coordination-form">${errorRegion}<div class="bp-form-context">${esc(booking.awb)} · ${esc(booking.customer)}</div>${coordinationFields(booking.coordination)}<div class="bp-form-actions"><button type="button" class="bp-button bp-button-secondary" data-bp-close>Cancel</button><button type="submit" class="bp-button bp-button-primary">Save coordination</button></div></form>`);
  byId('bp-coordination-form').onsubmit = event => { event.preventDefault(); if (execute('update', booking.id, { coordination: readCoordination(event.currentTarget) })) { showDetail(booking.id); app.toast('Coordination updated', 'ok'); } };
}

function showDetail(id) {
  const booking = bookingById(id);
  if (!booking) return;
  const assessment = booking.lateAssessment;
  const late = bookingLateness(booking, new Date().toISOString());
  const fact = (name, value) => `<div><dt>${name}</dt><dd>${esc(value)}</dd></div>`;
  const statusDescription = { confirmed: 'The visit is booked. Actual arrival has not been recorded.', arrived: 'Customer / vehicle check-in recorded. This does not confirm cargo acceptance.', completed: 'The scheduled visit is marked complete. This does not confirm cargo release.', cancelled: 'This booking is cancelled and does not consume planned capacity.', 'no-show': 'The customer or vehicle did not arrive. An operator recorded the no-show after the slot ended; no fee is created.' };
  dialog(booking.awb, `<div class="bp-detail-top"><span class="bp-direction-tag">${esc(booking.direction)}</span>${badge(booking)}${booking.source === 'synthetic-demo' ? '<span class="bp-demo-label">Synthetic example</span>' : ''}<span>${esc(booking.reference)}</span></div><h3 class="bp-detail-customer">${esc(booking.customer)}</h3><p class="bp-detail-route">${esc(booking.origin)} ${icon('arrow')} ${esc(booking.destination)} <span>${esc(booking.cargoType)} · ${esc(booking.shc)}</span></p><div class="bp-detail-slot">${icon('calendar')}<div><span>PLANNED ARRIVAL WINDOW · DUBAI</span><strong>${esc(localDisplay(booking.slotStart))} — ${esc(localDisplay(booking.slotEnd))}</strong></div></div><p class="bp-status-explanation">${statusDescription[booking.status] || ''}${late.overdue ? ` The arrival window ended ${number(late.minutesLate)} minutes ago; review before recording a no-show.` : ''}</p><dl class="bp-detail-facts">${fact('Gross weight', `${number(booking.weight)} kg`)}${fact('Pieces', number(booking.pieces))}${fact('Staff demand', number(booking.staffRequired))}${fact('Actual arrival', localDisplay(booking.actualArrival))}${fact('Flight', booking.flightNumber || 'Not recorded')}${fact('Flight departure · Dubai', localDisplay(booking.flightDeparture))}${fact('Vehicle', [booking.vehicleType, booking.vehicleRegistration].filter(Boolean).join(' · ') || 'Not recorded')}${fact('Dock / location', booking.dock || 'Not assigned')}</dl><section class="bp-detail-section"><header><h3>External coordination</h3>${['confirmed', 'arrived'].includes(booking.status) ? `<button type="button" class="bp-text-button" data-bp-coordination="${esc(id)}">Update ${icon('arrow')}</button>` : ''}</header><div class="bp-booking-coordination">${coordinationBadges(booking)}</div><p><strong>Owner:</strong> ${esc(booking.coordination?.owner || 'Not assigned')}</p>${booking.coordination?.note ? `<p>${esc(booking.coordination.note)}</p>` : ''}<small>Arrangements are operator-recorded; attendance is not independently verified.</small></section><section class="bp-detail-section bp-late-review"><header><h3>Late arrival review</h3><span class="bp-badge ${assessment?.status === 'proposed' ? 'bp-overdue' : ''}">${esc(assessment?.status === 'proposed' ? 'Proposal · needs review' : assessment?.status === 'waived' ? 'Waived' : ['cancelled', 'no-show'].includes(booking.status) ? 'No proposal' : !booking.actualArrival ? 'Awaiting actual arrival' : assessment?.status === 'not-configured' ? 'Policy not configured' : 'No proposal')}</span></header>${assessment?.status === 'proposed' || assessment?.status === 'waived' ? `<strong class="bp-proposal-amount">AED ${amount(assessment.amount)}</strong><p>${number(assessment.minutesLate)} minutes after slot end · ${number(assessment.policy?.graceMinutes ?? booking.latePolicy?.graceMinutes)} minute grace.</p>${assessment.status === 'proposed' ? `<button type="button" class="bp-button bp-button-secondary" data-bp-waive="${esc(id)}">Waive proposal</button>` : ''}` : `<p>${booking.latePolicy?.enabled ? `Captured booking policy: AED ${amount(booking.latePolicy.amount)} after ${number(booking.latePolicy.graceMinutes)} minutes past the slot end. Assessment is made when actual arrival is recorded.` : 'No late fee was enabled when this booking was created.'}</p>`}<small>The captured policy is retained through rescheduling. A proposal is a review item only; it does not add a charge, collect money or modify the invoice register.</small></section><section class="bp-detail-section"><header><h3>Booking history</h3><small>Version ${number(booking.version)}</small></header><ol class="bp-history">${(booking.history || []).slice().reverse().slice(0, 8).map(entry => `<li><span></span><div><strong>${esc(String(entry.type || 'Updated').replace(/([a-z])([A-Z])/g, '$1 $2'))}</strong><small>${esc(entry.actor || 'Unassigned')} · ${esc(localDisplay(dubaiLocalTime(entry.at)))}</small>${entry.reason ? `<p>${esc(entry.reason)}</p>` : ''}</div></li>`).join('') || '<li>No recorded changes.</li>'}</ol></section><div class="bp-detail-actions">${booking.status === 'confirmed' ? `<button type="button" class="bp-button bp-button-primary" data-bp-arrive="${esc(id)}">Record actual arrival</button><button type="button" class="bp-button bp-button-secondary" data-bp-edit="${esc(id)}">Edit / reschedule</button>` : booking.status === 'arrived' ? `<button type="button" class="bp-button bp-button-primary" data-bp-complete="${esc(id)}">Complete visit</button>` : ''}${booking.status === 'confirmed' && late.overdue ? `<button type="button" class="bp-button bp-button-secondary" data-bp-no-show="${esc(id)}">Record no-show</button>` : ''}${booking.status === 'confirmed' ? `<button type="button" class="bp-button bp-button-danger" data-bp-cancel="${esc(id)}">Cancel booking</button>` : ''}</div>`, { drawer: true });
}

function openTransition(id, action) {
  const booking = bookingById(id);
  if (!booking) return;
  const config = { 'no-show': ['Record no-show', 'Confirm that the customer or vehicle did not arrive after the slot ended. The booking remains in its history, releases capacity and creates no fee.', 'Record no-show'], arrive: ['Record actual arrival', 'Record when the customer or vehicle checked in. This is separate from formal cargo acceptance or release.', 'Record arrival'], complete: ['Complete visit', 'Mark the booked visit as finished. This does not confirm release of cargo.', 'Complete visit'], cancel: ['Cancel booking', 'The booking stays in its history and releases its planned capacity. Give a reason for the cancellation.', 'Cancel booking'], waiveLateCharge: ['Waive late fee proposal', 'Record why this review proposal should be waived. No invoice or payment is changed.', 'Waive proposal'] }[action];
  dialog(config[0], `<form id="bp-transition-form">${errorRegion}<div class="bp-form-context">${esc(booking.awb)} · ${esc(booking.customer)}</div><p class="bp-dialog-description">${config[1]}</p><div class="bp-form-grid">${action === 'arrive' ? field('Actual arrival · Dubai *', textInput('actualArrival', dubaiLocalTime(new Date().toISOString()), 'type="datetime-local" required'), true) : ''}${field(`Reason / note${['cancel', 'no-show', 'waiveLateCharge'].includes(action) ? ' *' : ''}`, `<textarea name="reason" rows="3" maxlength="1000" ${['cancel', 'no-show', 'waiveLateCharge'].includes(action) ? 'required' : ''} placeholder="Record the context for this change"></textarea>`, true)}</div>${action === 'arrive' ? '<p class="bp-policy-note">Late arrival is measured after the scheduled slot end. If the policy captured for this booking applies, recording arrival creates a fee proposal for review only.</p>' : ''}<div class="bp-form-actions"><button type="button" class="bp-button bp-button-secondary" data-bp-close>Back</button><button type="submit" class="bp-button ${action === 'cancel' ? 'bp-button-danger' : 'bp-button-primary'}" id="bp-confirm-transition">${config[2]}</button></div></form>`);
  byId('bp-transition-form').onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    const details = { reason: form.elements.reason.value };
    if (action === 'arrive') details.actualArrival = form.elements.actualArrival.value;
    if (execute('transition', id, action, details)) { showDetail(id); app.toast(config[2] + ' recorded', 'ok'); }
  };
}

function openSettings() {
  const current = planner();
  dialog('Planning capacity and late policy', `<form id="bp-settings-form">${errorRegion}<div class="bp-form-section-title"><span>01</span><div><h3>One shared team</h3><p>Capacity applies to overlapping export and import bookings together.</p></div></div><div class="bp-form-grid">${field('Available staff', textInput('capacityStaff', current.capacity.staff, 'type="number" min="0" step="1" required'))}${field('Maximum concurrent bookings', textInput('maxConcurrent', current.capacity.maxConcurrent, 'type="number" min="0" step="1" required'))}</div><p class="bp-field-hint">Zero means not configured. The planner flags conflicts but does not automatically reject or move a booking.</p><div class="bp-form-section-title"><span>02</span><div><h3>Late arrival review policy</h3><p>Company prototype policy, disabled by default. Applies only to newly created bookings; no operator tariff is implied.</p></div></div><label class="bp-policy-toggle"><input type="checkbox" name="lateEnabled" ${current.latePolicy.enabled ? 'checked' : ''}><span><strong>Enable late fee proposals</strong><small>For review only; never automatically invoiced.</small></span></label><div class="bp-form-grid" id="bp-policy-fields">${field('Grace after slot end (minutes)', textInput('graceMinutes', current.latePolicy.graceMinutes, 'type="number" min="0" step="1" required'))}${field('Flat proposal amount (AED)', textInput('lateAmount', current.latePolicy.amount, 'type="number" min="0" step="0.01" required'))}</div><div class="bp-notice"><div><strong>Policy is captured when a booking is created.</strong><span>Arrival is compared with that booking’s scheduled slot end and grace period, not flight departure. Existing bookings retain their original policy, including after rescheduling. Recording an actual arrival is required before any proposal exists.</span></div></div><div class="bp-form-actions"><button type="button" class="bp-button bp-button-secondary" data-bp-close>Cancel</button><button type="submit" class="bp-button bp-button-primary" id="bp-save-settings">Save planning rules</button></div></form>`, { wide: true });
  const form = byId('bp-settings-form');
  const toggle = () => { form.elements.graceMinutes.disabled = !form.elements.lateEnabled.checked; form.elements.lateAmount.disabled = !form.elements.lateEnabled.checked; };
  form.elements.lateEnabled.onchange = toggle; toggle();
  form.onsubmit = event => { event.preventDefault(); const patch = { capacity: { staff: Number(form.elements.capacityStaff.value), maxConcurrent: Number(form.elements.maxConcurrent.value) }, latePolicy: { enabled: form.elements.lateEnabled.checked, graceMinutes: Number(form.elements.graceMinutes.value), amount: Number(form.elements.lateAmount.value), currency: 'AED' } }; if (execute('settings', patch)) { closeDialog(); app.toast('Planning rules saved', 'ok'); } };
}

export function renderBookings(direction = 'Export') {
  activeDirection = direction === 'Import' ? 'Import' : 'Export';
  renderPage(activeDirection);
}

export function buildBookings() {
  for (const direction of ['Export', 'Import']) {
    if (!byId(pageId(direction))) { const page = document.createElement('div'); page.id = pageId(direction); page.className = 'page'; document.querySelector('.wrap').append(page); }
    renderPage(direction);
  }
  if (initialized) return;
  initialized = true;
  const modal = document.createElement('dialog'); modal.id = 'bp-dialog'; modal.className = 'bp-dialog'; modal.setAttribute('aria-labelledby', 'bp-dialog-title'); document.body.append(modal);
  modal.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); });
  document.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control) return;
    const owner = control.closest('[data-booking-direction]');
    if (owner) activeDirection = owner.dataset.bookingDirection;
    if (control.hasAttribute('data-bp-close')) closeDialog();
    else if (control.dataset.bpNew) openBookingForm(control.dataset.bpNew);
    else if (control.dataset.bpSample) openBookingForm(control.dataset.bpSample, null, true);
    else if (control.hasAttribute('data-bp-settings')) openSettings();
    else if (control.hasAttribute('data-bp-shift')) { states[activeDirection].date = shiftDate(states[activeDirection].date, Number(control.dataset.bpShift)); renderPage(activeDirection); }
    else if (control.hasAttribute('data-bp-today')) { states[activeDirection].date = dubaiDate(new Date().toISOString()); renderPage(activeDirection); }
    else if (control.dataset.bpDetail) showDetail(control.dataset.bpDetail);
    else if (control.dataset.bpEdit) { const booking = bookingById(control.dataset.bpEdit); if (booking) openBookingForm(booking.direction, booking); }
    else if (control.dataset.bpCoordination) { const booking = bookingById(control.dataset.bpCoordination); if (booking) openCoordination(booking); }
    else if (control.dataset.bpArrive) openTransition(control.dataset.bpArrive, 'arrive');
    else if (control.dataset.bpComplete) openTransition(control.dataset.bpComplete, 'complete');
    else if (control.dataset.bpNoShow) openTransition(control.dataset.bpNoShow, 'no-show');
    else if (control.dataset.bpCancel) openTransition(control.dataset.bpCancel, 'cancel');
    else if (control.dataset.bpWaive) openTransition(control.dataset.bpWaive, 'waiveLateCharge');
  });
  document.addEventListener('input', event => {
    if (!event.target.hasAttribute('data-bp-search')) return;
    const direction = event.target.closest('[data-booking-direction]').dataset.bookingDirection;
    states[direction].query = event.target.value; renderAgenda(direction);
  });
  document.addEventListener('change', event => {
    const direction = event.target.closest('[data-booking-direction]')?.dataset.bookingDirection;
    if (!direction) return;
    if (event.target.hasAttribute('data-bp-date') && event.target.value) { states[direction].date = event.target.value; renderPage(direction); }
    else if (event.target.hasAttribute('data-bp-status')) { states[direction].status = event.target.value; renderAgenda(direction); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.open) { event.preventDefault(); closeDialog(); } });
  window.addEventListener('solitair:change', () => { if (committing) return; const visible = document.querySelector('.page.on .booking-planner'); if (visible) renderPage(visible.dataset.bookingDirection); });
}

export function openBooking(id) {
  const booking = bookingById(id);
  if (!booking) return false;
  const state = states[booking.direction];
  state.date = booking.slotStart.slice(0, 10); state.status = 'all'; state.query = '';
  activeDirection = booking.direction;
  app.navigateWorkspace?.('bookings-' + booking.direction.toLowerCase());
  renderPage(booking.direction); showDetail(id);
  return true;
}

app.openBooking = openBooking;
app.buildBookings = buildBookings;
app.renderBookings = renderBookings;
