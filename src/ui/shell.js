import { app } from '../core/runtime.js';

const PAGES = {
  overview: ['Overview', 'Your cargo operation, connected.', 'overview'],
  shipments: ['Shipment Database', 'Bring the manifest into one searchable workspace.', 'box'],
  export: ['Export Advice', 'From air waybill to a complete charge advice.', 'out'],
  import: ['Import Advice', 'Review incoming cargo, charges and delivery details.', 'in'],
  lying: ['Warehouse / Lying List', 'Cargo on the warehouse list and its scheduled departures.', 'warehouse'],
  security: ['Facility Security', 'Reconcile received air waybills with the invoice register.', 'shield'],
  register: ['Invoice Register', 'Your invoices, payment allocations and cash movements.', 'receipt'],
  handover: ['Shift Handover', 'Carry the figures and outstanding work into the next shift.', 'handover'],
  dash: ['Dashboard', 'Explore recorded revenue and payment distribution.', 'chart'],
  customers: ['Customer Database', 'Find the AWB owner and the right billing party.', 'people'],
  admin: ['Rates & Data', 'Manage tariffs, workspace details and local backups.', 'settings'],
};
const GROUPS = [['WORKSPACE', ['overview', 'shipments']], ['CARGO OPERATIONS', ['export', 'import', 'lying', 'security']], ['FINANCE & REPORTING', ['register', 'handover', 'dash']], ['MANAGE', ['customers', 'admin']]];
const ICONS = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
  out: '<path d="M4 14v6h16v-6M12 16V3m-5 5 5-5 5 5"/>',
  in: '<path d="M4 14v6h16v-6M12 3v13m-5-5 5 5 5-5"/>',
  warehouse: '<path d="M3 21V8l9-5 9 5v13M7 21V11h10v10M7 15h10M7 18h10"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h4"/>',
  handover: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V6m5 9V9"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-3-5"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="m12 3 10 18H2L12 3ZM12 9v5m0 3v.1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  link: '<path d="m10 14 4-4m-6 2-2 2a4 4 0 0 0 6 6l2-2m-4-12 2-2a4 4 0 0 1 6 6l-2 2"/>',
};
const icon = (name, cls = '') => `<svg class="ws-icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.box}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const el = id => document.getElementById(id);
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const money = value => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number(value));
const count = value => new Intl.NumberFormat('en-GB').format(number(value));
const key = value => String(value || '').replace(/\D/g, '');
const direction = shipment => app.shDirection ? app.shDirection(shipment) : shipment.dep ? 'Export' : shipment.rcf ? 'Import' : '';
const invoices = () => (app.DB?.entries || []).filter(row => row.type === 'invoice');
const shipments = () => app.SH?.items || [];
const matchAwb = (left, right) => !!key(left) && key(left) === key(right);
const synthetic = row => row?.source === 'synthetic-demo' || row?.synthetic === true || app.SH?.demo === true;
const dateText = value => value ? app.fmtDT ? app.fmtDT(value) : String(value).replace('T', ' ') : 'Not recorded';
const navAction = (page, text, className = 'ws-link') => `<button type="button" class="${className}" data-ws-nav="${page}">${escape(text)}${icon('arrow')}</button>`;

let currentPage = 'overview';
let dialogReturnFocus;
let searchResults = [];
let mounted = false;

function renderOverview() {
  const all = invoices();
  const current = shipments();
  const warehouse = app.LL?.items || [];
  const missing = (app.DB?.sec || []).filter(row => !row.ack && !all.some(invoice => matchAwb(invoice.mawb, row.awb) && (!row.dir || invoice.mode === row.dir)));
  const total = all.reduce((sum, invoice) => sum + number(invoice.total), 0);
  const exports = current.filter(row => direction(row) === 'Export').length;
  const imports = current.filter(row => direction(row) === 'Import').length;
  const recent = current.slice().sort((a, b) => number(b.importedAt) - number(a.importedAt)).slice(0, 6);
  const incomplete = current.filter(row => row.wt == null || !row.cust || !(row.dep || row.rcf));
  const warningRows = missing.slice(0, 3).map(row => ({ title: row.awb, detail: `${row.dir || 'Cargo'} received · no direction-matched invoice`, action: 'security', tone: 'amber', label: 'Review reception' }));
  incomplete.slice(0, Math.max(0, 3 - warningRows.length)).forEach(row => warningRows.push({ title: row.awb, detail: 'Manifest has missing weight, owner or schedule', awb: row.awb, tone: 'amber', label: 'Review shipment' }));
  const today = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }).format(new Date());
  el('p-overview').innerHTML = `
    <section class="ws-overview-intro" aria-label="Workspace overview">
      <div><div class="ws-eyebrow">THE OPERATIONS DESK <span>/</span> ${escape(today.toUpperCase())}</div><h1>Every shipment.<br><span>A clearer picture.</span></h1><p>From manifest to invoice and shift handover.<br>Your cargo workflow, in one place.</p><div class="ws-intro-actions">${navAction('export', 'New export advice', 'ws-button ws-primary')}${navAction('shipments', 'Import a manifest', 'ws-button ws-secondary')}</div></div>
      <div class="ws-route-art" aria-hidden="true"><div class="ws-art-coordinates">CARGO / DOCUMENTS / HANDOVER</div><svg viewBox="0 0 390 210" fill="none"><g stroke="currentColor" opacity=".18"><path d="M0 40H390M0 80H390M0 120H390M0 160H390M40 0V210M90 0V210M140 0V210M190 0V210M240 0V210M290 0V210M340 0V210"/><circle cx="192" cy="106" r="80"/><circle cx="192" cy="106" r="52"/></g><path d="M50 165C110 155 103 63 191 105S302 84 340 36" stroke="currentColor" stroke-width="2" stroke-dasharray="5 6"/><path d="m183 109 34-27-18 39-7-13-9 1Z" fill="currentColor"/><circle cx="50" cy="165" r="7" fill="currentColor"/><circle cx="340" cy="36" r="7" fill="currentColor"/><circle cx="50" cy="165" r="14" stroke="currentColor" opacity=".3"/><circle cx="340" cy="36" r="14" stroke="currentColor" opacity=".3"/></svg><div class="ws-art-caption"><span>MANIFEST</span><span>CHARGE ADVICE</span><span>HANDOVER</span></div></div>
    </section>
    <div class="ws-section-label"><span>WORKSPACE AT A GLANCE</span><span>Saved local records · all dates</span></div>
    <section class="ws-metrics" aria-label="Recorded workspace metrics">
      ${metric('shipments', 'Manifest shipments', count(current.length), `${exports} export · ${imports} import${current.length - exports - imports ? ` · ${current.length - exports - imports} unspecified` : ''}`, 'box', 'manifest')}
      ${metric('register', 'Recorded invoice total', money(total), `${count(all.length)} charge advice${all.length === 1 ? '' : 's'} · AED`, 'receipt', 'invoiced')}
      ${metric('lying', 'On warehouse list', count(warehouse.length), 'Recorded entries · not a physical stock count', 'warehouse', 'warehouse')}
      ${metric('register', 'Cash on hand', money(app.cashOnHand ? app.cashOnHand() : 0), 'AED · opening + collected − handed over', 'handover', 'cash')}
    </section>
    <div class="ws-overview-columns"><section class="ws-card ws-shipments-card"><header class="ws-card-heading"><div><div class="ws-eyebrow">SHIPMENT WORKSPACE</div><h2>Recently imported</h2></div>${navAction('shipments', 'View all')}</header><div class="ws-table-scroll"><table class="ws-table"><thead><tr><th>Air waybill / owner</th><th>Route</th><th>Direction</th><th class="ws-number">Gross weight</th><th><span class="ws-sr-only">Open shipment</span></th></tr></thead><tbody>${recent.length ? recent.map(row => `<tr><td><button type="button" class="ws-awb" data-ws-awb="${escape(row.awb)}">${escape(row.awb)}</button><span class="ws-cell-sub" title="${escape(row.cust)}">${escape(row.cust || 'Owner not recorded')}</span></td><td><span class="ws-route">${escape(row.org || '—')} ${icon('arrow')} ${escape(row.dst || '—')}</span><span class="ws-cell-sub">${escape(row.fltno || 'Flight not recorded')}</span></td><td><span class="ws-status ${direction(row) === 'Import' ? 'ws-blue' : 'ws-green'}">${escape(direction(row) || 'Unspecified')}</span></td><td class="ws-number">${row.wt == null ? '—' : count(row.wt)} <small>kg</small></td><td><button type="button" class="ws-icon-button" data-ws-awb="${escape(row.awb)}" aria-label="Open shipment ${escape(row.awb)}">${icon('arrow')}</button></td></tr>`).join('') : `<tr><td colspan="5"><div class="ws-empty">${icon('box')}<strong>Your shipment workspace starts here</strong><p>Paste or upload a manifest to connect an AWB to its cargo details.</p>${navAction('shipments', 'Open manifest intake')}</div></td></tr>`}</tbody></table></div><footer class="ws-card-footer">${current.some(synthetic) ? '<span class="ws-demo-dot"></span> Includes synthetic sample shipments' : current.some(row => !row.source || row.source === 'legacy-unclassified') ? 'Includes records with unclassified source' : 'Imported manifest records'}<span>Ordered by import time</span></footer></section>
    <section class="ws-card ws-attention"><header class="ws-card-heading"><div><div class="ws-eyebrow">NEXT ACTIONS</div><h2>Needs a look</h2></div><span class="ws-count">${count(missing.length + incomplete.length)}</span></header><div class="ws-attention-body">${warningRows.length ? warningRows.map(row => `<button type="button" class="ws-attention-row" ${row.awb ? `data-ws-awb="${escape(row.awb)}"` : `data-ws-nav="${row.action}"`}><span class="ws-attention-icon">${icon('alert')}</span><span><strong>${escape(row.title)}</strong><span>${escape(row.detail)}</span><em>${escape(row.label)} ${icon('arrow')}</em></span></button>`).join('') : `<div class="ws-no-issues"><span>${icon('check')}</span><h3>No exceptions in these checks</h3><p>No unmatched active security receptions or incomplete manifests were found.</p><small>These checks do not establish cargo acceptance or physical release.</small></div>`}</div><footer class="ws-card-footer">${navAction('security', 'Open security reconciliation')}</footer></section></div>
    <section class="ws-workflow-strip"><div><span class="ws-workflow-icon">${icon('link')}</span><div><h3>Follow the air waybill</h3><p>One lookup connects shipment details, invoices and warehouse records.</p></div></div><button type="button" class="ws-button ws-secondary" data-ws-search>Find a shipment ${icon('search')}</button></section>
  `;
}

function metric(page, title, value, description, glyph, id) {
  return `<button type="button" class="ws-metric" data-ws-nav="${page}" data-metric="${id}"><span class="ws-metric-label">${escape(title)}${icon(glyph)}</span><strong>${escape(value)}</strong><span class="ws-metric-note">${escape(description)}</span></button>`;
}

function updatePage(page, push = true) {
  if (!PAGES[page]) page = 'overview';
  currentPage = page;
  document.querySelectorAll('.page').forEach(node => node.classList.toggle('on', node.id === `p-${page}`));
  document.querySelectorAll('[data-ws-route]').forEach(node => {
    const active = node.dataset.wsRoute === page;
    node.classList.toggle('active', active);
    if (active) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  document.querySelectorAll('.tabs button').forEach(node => node.classList.toggle('on', node.dataset.p === page));
  el('ws-location').textContent = PAGES[page][0];
  el('ws-page-title').textContent = PAGES[page][0];
  el('ws-page-description').textContent = PAGES[page][1];
  el('ws-page-heading').hidden = page === 'overview';
  document.body.dataset.workspacePage = page;
  document.title = `${PAGES[page][0]} · SolitAir Cargo`;
  if (page === 'overview') renderOverview();
  document.body.classList.remove('ws-nav-open');
  el('ws-menu')?.setAttribute('aria-expanded', 'false');
  if (push && location.hash !== `#${page}`) location.hash = page;
}

function navigate(page, push = true) {
  if (!PAGES[page]) page = 'overview';
  const button = document.querySelector(`.tabs button[data-p="${page}"]`);
  if (button && button._workspaceLegacyClick) button._workspaceLegacyClick.call(button);
  updatePage(page, push);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function routeFromHash() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  navigate(PAGES[path] ? path : 'overview', false);
  const awb = new URLSearchParams(query).get('awb');
  if (awb) openShipment(awb);
}

function openDialog(title, content, className = '') {
  const dialog = el('ws-dialog');
  if (!dialog.open) dialogReturnFocus = document.activeElement;
  dialog.className = `ws-dialog ${className}`;
  dialog.innerHTML = `<header class="ws-dialog-heading"><div><span class="ws-eyebrow">SOLITAIR WORKSPACE</span><h2 id="ws-dialog-title">${escape(title)}</h2></div><button type="button" class="ws-icon-button" data-ws-close aria-label="Close dialog">${icon('close')}</button></header><div class="ws-dialog-body">${content}</div>`;
  if (!dialog.open) dialog.showModal();
  else dialog.querySelector('[data-ws-close]')?.focus();
}

function closeDialog() {
  el('ws-dialog').close();
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
}

function startAdvice(awb, mode) {
  closeDialog();
  navigate(mode === 'Import' ? 'import' : 'export');
  const field = el(mode === 'Import' ? 'i_mawb' : 'a_mawb');
  if (field) {
    field.value = awb;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.focus();
  }
}

function openShipment(awb) {
  const shipment = shipments().find(row => matchAwb(row.awb, awb));
  const related = invoices().filter(row => matchAwb(row.mawb, awb) && (!shipment || !direction(shipment) || row.mode === direction(shipment)));
  const reception = (app.DB?.sec || []).filter(row => matchAwb(row.awb, awb) && (!shipment || !direction(shipment) || row.dir === direction(shipment)));
  const lying = (app.LL?.items || []).filter(row => matchAwb(row.awb, awb));
  const source = shipment || related[0];
  if (!source) {
    openDialog(awb, `<div class="ws-empty">${icon('box')}<strong>No shipment or invoice record found</strong><p>Review the manifest or enter an advice manually.</p>${navAction('shipments', 'Open Shipment Database', 'ws-button ws-primary')}</div>`);
    return;
  }
  const mode = shipment ? direction(shipment) : source.mode;
  const canonicalAwb = shipment?.awb || source.mawb || awb;
  const detail = (name, value) => `<div><dt>${escape(name)}</dt><dd>${escape(value ?? 'Not recorded')}</dd></div>`;
  openDialog(canonicalAwb, `
    <div class="ws-detail-route"><strong>${escape(source.org || '—')}</strong><span>${icon('out')}<span>${escape(source.fltno || 'Flight not recorded')}</span></span><strong>${escape(source.dst || '—')}</strong></div>
    <div class="ws-detail-meta"><span class="ws-status ${mode === 'Import' ? 'ws-blue' : 'ws-green'}">${escape(mode || 'Direction not recorded')}</span><span>${shipment ? synthetic(shipment) ? 'Synthetic manifest record' : shipment.source === 'manifest' ? 'Imported manifest record' : 'Unclassified source' : 'From saved invoice'}</span></div>
    <dl class="ws-detail-facts">${detail('AWB owner', source.cust || 'Not recorded')}${detail('Gross weight', source.wt == null ? 'Not recorded' : `${count(source.wt)} kg`)}${detail('Pieces', source.pcs == null ? 'Not recorded' : count(source.pcs))}${detail('Handling code', source.shc || 'Not recorded')}${detail(mode === 'Import' ? 'RCF time' : 'Scheduled departure', dateText(shipment ? mode === 'Import' ? source.rcf : source.dep : mode === 'Import' ? source.t1 : source.t2))}${detail('Nature of goods', source.nog || 'Not recorded')}</dl>
    <div class="ws-detail-section"><div class="ws-eyebrow">CONNECTED RECORDS</div><h3>The AWB trail</h3><p>Linked by normalized AWB${mode ? ` and ${escape(mode.toLowerCase())} direction for invoices and reception` : ''}. These records do not prove physical acceptance or release.</p><div class="ws-trace"><div class="ws-trace-node">${icon('box')}<strong>${shipment ? '1' : '0'}</strong><span>Manifest record</span></div><span class="ws-trace-edge">${icon('arrow')}</span><button class="ws-trace-node" type="button" data-ws-register="${escape(canonicalAwb)}">${icon('receipt')}<strong>${related.length}</strong><span>Invoices</span></button><span class="ws-trace-edge">${icon('arrow')}</span><button class="ws-trace-node" type="button" data-ws-nav="lying">${icon('warehouse')}<strong>${lying.length}</strong><span>Warehouse rows</span></button></div><div class="ws-related-note">${icon('shield')} ${reception.length} security reception${reception.length === 1 ? '' : 's'} · ${reception.filter(row => row.ack).length} acknowledged ${navAction('security', 'Review')}</div></div>
    ${related.length ? `<section class="ws-detail-section"><h3>Saved charge advices</h3>${related.map(row => `<button type="button" class="ws-invoice-result" data-ws-invoice="${escape(row.id)}"><span><strong>${escape(row.ref)}</strong><small>${escape(row.billTo || row.cust)} · ${escape(row.payMode || 'Payment mode not recorded')}</small></span><strong>AED ${money(row.total)}</strong>${icon('arrow')}</button>`).join('')}</section>` : '<p class="ws-detail-note">No direction-matched charge advice has been saved for this AWB.</p>'}
    <div class="ws-detail-actions">${mode ? `<button type="button" class="ws-button ws-primary" data-ws-advice="${escape(canonicalAwb)}" data-mode="${escape(mode)}">New ${escape(mode.toLowerCase())} advice ${icon('plus')}</button>` : ''}<button type="button" class="ws-button ws-secondary" data-ws-nav="shipments">Open manifest ${icon('arrow')}</button></div>
  `, 'ws-drawer');
}

function openInvoice(id) {
  const invoice = invoices().find(row => row.id === id);
  if (!invoice) return;
  openDialog(`Advice ${invoice.ref}`, `<div class="ws-invoice-summary"><span class="ws-status ws-green">${escape(invoice.mode)}</span><span>${escape(invoice.mawb)}</span><strong>AED ${money(invoice.total)}</strong><p>${escape(invoice.billTo || invoice.cust)}</p><small>${escape(invoice.payMode || '')} · ${escape(invoice.date ? app.fmtD(invoice.date) : '')}</small></div><div class="ws-detail-section"><h3>Saved charge lines</h3><div class="ws-table-scroll"><table class="ws-table"><thead><tr><th>Description</th><th class="ws-number">AED</th></tr></thead><tbody>${(invoice.items || []).map(line => `<tr><td>${escape(line.d)}</td><td class="ws-number">${money(line.charge)}</td></tr>`).join('')}</tbody></table></div></div><div class="ws-detail-actions"><button type="button" class="ws-button ws-primary" data-ws-preview="${escape(id)}">Preview advice ${icon('receipt')}</button><button type="button" class="ws-button ws-secondary" data-ws-register="${escape(invoice.mawb)}">Open register ${icon('arrow')}</button></div>`, 'ws-drawer');
}

function openSearch() {
  openDialog('Find anything in your workspace', `<label class="ws-sr-only" for="ws-search-input">Search AWB, customer or invoice reference</label><div class="ws-search-field">${icon('search')}<input id="ws-search-input" type="search" autocomplete="off" placeholder="Air waybill, customer or invoice reference…" aria-controls="ws-search-results"></div><p class="ws-search-hint">Search manifests, saved invoices and the demo customer master.</p><div id="ws-search-results" aria-live="polite"></div>`, 'ws-search-dialog');
  el('ws-search-input').addEventListener('input', renderSearch);
  el('ws-search-input').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); el('ws-search-results').querySelector('button')?.focus(); }
    if (event.key === 'Enter') { event.preventDefault(); el('ws-search-results').querySelector('button')?.click(); }
  });
  renderSearch();
  el('ws-search-input').focus();
}

function renderSearch() {
  const term = el('ws-search-input').value.trim().toLowerCase();
  const numericTerm = key(term);
  const matches = values => values.some(value => String(value || '').toLowerCase().includes(term));
  searchResults = [];
  if (term.length >= 2) {
    shipments().filter(row => matches([row.awb, row.cust, row.fltno, row.org, row.dst]) || numericTerm.length >= 3 && key(row.awb).includes(numericTerm)).slice(0, 7).forEach(row => searchResults.push({ type: 'Shipment', title: row.awb, sub: [row.org, row.dst].join(' → ') + ' · ' + (row.cust || 'Owner not recorded'), awb: row.awb, icon: 'box' }));
    invoices().filter(row => matches([row.mawb, row.ref, row.cust, row.billTo]) || numericTerm.length >= 3 && key(row.mawb).includes(numericTerm)).slice(0, 5).forEach(row => searchResults.push({ type: 'Invoice', title: row.ref, sub: row.mawb + ' · AED ' + money(row.total), invoice: row.id, icon: 'receipt' }));
    (app.CUSTOMERS || []).filter(row => matches([row.name, row.no, row.trn])).slice(0, 5).forEach(row => searchResults.push({ type: 'Customer', title: row.name, sub: `Customer ${row.no} · demo master`, customer: row.name, icon: 'people' }));
  }
  el('ws-search-results').innerHTML = searchResults.length ? searchResults.map(result => `<button type="button" class="ws-search-result" ${result.awb ? `data-ws-awb="${escape(result.awb)}"` : result.invoice ? `data-ws-invoice="${escape(result.invoice)}"` : `data-ws-customer="${escape(result.customer)}"`}>${icon(result.icon)}<span><small>${result.type}</small><strong>${escape(result.title)}</strong><span>${escape(result.sub)}</span></span>${icon('arrow')}</button>`).join('') : `<div class="ws-empty">${icon('search')}<strong>${term.length < 2 ? 'Start with an AWB, name or reference' : 'No matching records'}</strong><p>${term.length < 2 ? 'Enter at least two characters. Use the arrow key to reach results.' : 'Try a shorter search, or load the shipment manifest.'}</p></div>`;
}

function filterRegister(awb) {
  closeDialog();
  navigate('register');
  el('rf_clear')?.click();
  const field = el('rf_q');
  field.value = awb;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
}

function updateStorageContext() {
  const storage = app.storageStatus;
  const browserOnly = storage?.browserOnly !== false;
  const footer = document.querySelector('.ws-sidebar-footer p');
  if (footer) footer.innerHTML = `${browserOnly ? 'Saved in this browser.' : 'Local disk workspace.'}<br>Synthetic customer master.`;
  const note = document.querySelector('.ws-main-footer>span:last-child');
  if (note) note.textContent = `${browserOnly ? 'Browser sandbox' : 'Local disk snapshots'} · Synthetic customer master · Back up in Rates & Data`;
  const label = document.querySelector('.ws-local-chip');
  if (label) label.textContent = browserOnly ? 'Browser sandbox' : 'Local disk workspace';
  const status = el('storage-status');
  if (status) el('ws-main-content').append(status);
}

export function mountWorkspace() {
  if (mounted) return;
  mounted = true;
  document.body.classList.add('workspace-app');
  const header = document.querySelector('.hdr');
  const main = document.querySelector('.wrap');
  const legacyTabs = header.querySelector('.tabs');
  const legacyBrand = header.querySelector('.brand');
  const staff = el('staff');
  const cash = header.querySelector('.cashchip');
  const sidebar = document.createElement('aside');
  sidebar.id = 'ws-sidebar';
  sidebar.className = 'ws-sidebar';
  sidebar.setAttribute('aria-label', 'Workspace navigation');
  sidebar.innerHTML = `<a href="#overview" class="ws-brand" aria-label="SolitAir Cargo overview"><span class="ws-brand-symbol"><svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m5 24 11-19 11 19H5Z" stroke="currentColor" stroke-width="2"/><path d="m11 24 5-9 5 9M4 28h24" stroke="currentColor" stroke-width="2"/></svg></span><span>solitair<span>CARGO WORKSPACE</span></span></a><div class="ws-workspace-switch"><span class="ws-workspace-mark">DWC</span><div><strong>Cargo operations</strong><span>Local workspace</span></div>${icon('warehouse')}</div><nav aria-label="Main navigation">${GROUPS.map(([title, pages]) => `<div class="ws-nav-group"><div class="ws-nav-label">${title}</div>${pages.map(page => `<a href="#${page}" data-ws-route="${page}">${icon(PAGES[page][2])}<span>${PAGES[page][0]}</span>${page === 'overview' ? '<span class="ws-nav-indicator"></span>' : ''}</a>`).join('')}</div>`).join('')}</nav><div class="ws-sidebar-footer"><span class="ws-mode-label">LOCAL PROTOTYPE</span><p>Saved in this browser.<br>Synthetic customer master.</p><a href="#admin">Workspace & backups ${icon('arrow')}</a></div>`;
  document.body.prepend(sidebar);
  const skip = document.createElement('a');
  skip.className = 'ws-skip'; skip.href = '#ws-main-content'; skip.textContent = 'Skip to workspace';
  skip.onclick = event => { event.preventDefault(); main.focus(); };
  document.body.prepend(skip);
  header.classList.add('ws-topbar');
  const retained = document.createElement('div');
  retained.hidden = true;
  retained.className = 'ws-legacy-navigation';
  retained.append(legacyTabs, legacyBrand);
  header.replaceChildren(retained);
  header.insertAdjacentHTML('beforeend', `<button id="ws-menu" class="ws-icon-button" type="button" aria-label="Toggle navigation" aria-controls="ws-sidebar" aria-expanded="false">${icon('menu')}</button><div class="ws-breadcrumb">Workspace <span>/</span> <strong id="ws-location">Overview</strong></div><button id="ws-search-open" class="ws-global-search" type="button" data-ws-search>${icon('search')}<span>Search AWB, customer, invoice…</span><kbd>Ctrl K</kbd></button><div class="ws-topbar-context"><span class="ws-local-chip">Local prototype</span><div id="ws-staff-control"><label for="staff">Counter staff</label></div></div>`);
  el('ws-staff-control').append(staff);
  cash.classList.add('ws-header-cash');
  cash.title = 'Opening balance plus cash collected, less cash handed over. Open the register to reconcile.';
  cash.setAttribute('role', 'button'); cash.tabIndex = 0;
  cash.onclick = () => navigate('register');
  cash.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate('register'); } };
  header.append(cash);
  main.id = 'ws-main-content'; main.tabIndex = -1;
  main.classList.add('ws-main'); main.setAttribute('role', 'main');
  main.insertAdjacentHTML('afterbegin', '<header id="ws-page-heading" class="ws-page-heading" hidden><div class="ws-eyebrow">CARGO WORKSPACE</div><h1 id="ws-page-title"></h1><p id="ws-page-description"></p></header><div id="p-overview" class="page"></div>');
  main.insertAdjacentHTML('beforeend', '<footer class="ws-main-footer"><span>SolitAir Cargo Workspace</span><span>Local browser storage · Synthetic customer master · Back up in Rates & Data</span></footer>');
  const dialog = document.createElement('dialog');
  dialog.id = 'ws-dialog'; dialog.className = 'ws-dialog'; dialog.setAttribute('aria-labelledby', 'ws-dialog-title');
  document.body.append(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) closeDialog(); });
  dialog.addEventListener('close', () => { if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus(); });
  document.querySelectorAll('.tabs button').forEach(button => {
    button._workspaceLegacyClick = button.onclick;
    button.onclick = () => navigate(button.dataset.p);
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    if (target.hasAttribute('data-ws-search')) { event.preventDefault(); openSearch(); }
    else if (target.dataset.wsRoute) { event.preventDefault(); navigate(target.dataset.wsRoute); }
    else if (target.dataset.wsNav) { if (dialog.open) closeDialog(); navigate(target.dataset.wsNav); }
    else if (target.dataset.wsAwb) openShipment(target.dataset.wsAwb);
    else if (target.dataset.wsInvoice) openInvoice(target.dataset.wsInvoice);
    else if (target.dataset.wsAdvice) startAdvice(target.dataset.wsAdvice, target.dataset.mode);
    else if (target.dataset.wsRegister) filterRegister(target.dataset.wsRegister);
    else if (target.dataset.wsPreview) { const invoice = invoices().find(row => row.id === target.dataset.wsPreview); closeDialog(); if (invoice) app.printAdvice(invoice, true); }
    else if (target.dataset.wsCustomer) { closeDialog(); navigate('customers'); el('cu_filter').value = target.dataset.wsCustomer; el('cu_filter').dispatchEvent(new Event('input', { bubbles: true })); el('cu_filter').focus(); }
    else if (target.hasAttribute('data-ws-close')) closeDialog();
  });
  el('ws-menu').onclick = () => { const open = document.body.classList.toggle('ws-nav-open'); el('ws-menu').setAttribute('aria-expanded', String(open)); };
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape') {
      if (dialog.open) { event.preventDefault(); closeDialog(); }
      document.body.classList.remove('ws-nav-open'); el('ws-menu').setAttribute('aria-expanded', 'false');
    }
  });
  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('solitair:storage', updateStorageContext);
  window.addEventListener('solitair:change', () => { if (currentPage === 'overview') renderOverview(); });
  window.addEventListener('focus', () => { if (currentPage === 'overview') renderOverview(); });
  updateStorageContext();
  routeFromHash();
  if (!location.hash) history.replaceState(null, '', '#overview');
}
