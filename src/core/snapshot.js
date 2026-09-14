export const SNAPSHOT_FORMAT = 'solitair-workspace';

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
}
function records(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  value.forEach((item, index) => object(item, `${name}[${index}]`));
}
function numericFields(value, keys, name) {
  for (const key of keys) if (value[key] !== undefined && value[key] !== null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw new Error(`${name}.${key} must be a finite number`);
}
function safeId(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(value)) throw new Error(`${name} has an invalid record identifier`);
}
function safeTree(value, depth = 0) {
  if (depth > 40) throw new Error('Backup is nested too deeply');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Backup contains a non-finite number');
  if (value && typeof value === 'object') for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Backup contains an unsafe object key');
    safeTree(value[key], depth + 1);
  }
}

export function makeSnapshot(db, shipments, warehouse) {
  return {format: SNAPSHOT_FORMAT, version: 1, exportedAt: new Date().toISOString(), db, shipments, warehouse};
}

export function validateSnapshot(snapshot) {
  object(snapshot, 'Backup');
  safeTree(snapshot);
  if (snapshot.format !== SNAPSHOT_FORMAT || snapshot.version !== 1) throw new Error('Unsupported workspace backup format');
  if (typeof snapshot.exportedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.exportedAt))) throw new Error('Invalid backup timestamp');
  object(snapshot.db, 'Invoice store'); object(snapshot.shipments, 'Shipment store'); object(snapshot.warehouse, 'Warehouse store');
  records(snapshot.db.entries, 'Invoices'); records(snapshot.shipments.items, 'Shipments');
  records(snapshot.warehouse.items, 'Warehouse items'); records(snapshot.warehouse.cleared, 'Warehouse history');
  if (!Array.isArray(snapshot.warehouse.removed) || snapshot.warehouse.removed.some(x => typeof x !== 'string')) throw new Error('Invalid warehouse removal history');
  for (const field of ['sec', 'reports', 'equipment']) if (snapshot.db[field] !== undefined) records(snapshot.db[field], field);
  if (snapshot.db.seq !== undefined) {
    object(snapshot.db.seq, 'Invoice sequence');
    for (const key of ['export', 'import']) if (snapshot.db.seq[key] !== undefined && (!Number.isSafeInteger(snapshot.db.seq[key]) || snapshot.db.seq[key] < 0)) throw new Error('Invalid invoice sequence');
  }
  if (snapshot.db.staffList !== undefined && (!Array.isArray(snapshot.db.staffList) || snapshot.db.staffList.some(x => typeof x !== 'string'))) throw new Error('Invalid staff list');
  if (snapshot.db.logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(snapshot.db.logo)) throw new Error('Backup logo must be a PNG, JPEG or WebP image');
  numericFields(snapshot.db, ['openingBalance'], 'Workspace');
  for (const field of ['rates', 'freeHours', 'company', 'bank']) if (snapshot.db[field] != null) object(snapshot.db[field], field);
  if (snapshot.db.rates) for (const [id, rate] of Object.entries(snapshot.db.rates)) {object(rate, 'Tariff override'); numericFields(rate, ['rate', 'min'], id);}
  if (snapshot.db.freeHours) numericFields(snapshot.db.freeHours, ['general', 'special', 'perishable'], 'Storage rules');
  for (const entry of snapshot.db.entries) {
    safeId(entry.id, 'Ledger');
    if (entry.type !== undefined && !['invoice', 'handover'].includes(entry.type)) throw new Error('Unknown ledger record type');
    numericFields(entry, ['total', 'subtotal', 'vat', 'amount', 'wt', 'pcs', 'hawbqty'], 'Ledger record');
    const invoice = entry.type === 'invoice' || (entry.type === undefined && entry.mawb !== undefined);
    if (invoice) {
      if (!['Export', 'Import'].includes(entry.mode) || typeof entry.mawb !== 'string' || !entry.mawb.trim() || typeof entry.cust !== 'string' || typeof entry.total !== 'number') throw new Error('Incomplete invoice record');
      records(entry.items, 'Charge lines'); object(entry.pay, 'Payment breakdown');
      numericFields(entry.pay, ['cash', 'card', 'credit', 'cass', 'bank', 'prepaid'], 'Payment breakdown');
      for (const line of entry.items) numericFields(line, ['qty', 'rate', 'min', 'charge', 'vat', 'total'], 'Charge line');
    } else if (typeof entry.amount !== 'number') throw new Error('Incomplete cash handover record');
  }
  for (const shipment of snapshot.shipments.items) {
    if (typeof shipment.awb !== 'string' || !shipment.awb.trim()) throw new Error('Invalid shipment AWB');
    numericFields(shipment, ['wt', 'pcs'], 'Shipment');
  }
  for (const item of snapshot.warehouse.items.concat(snapshot.warehouse.cleared)) {
    safeId(item.id, 'Warehouse');
    if (typeof item.awb !== 'string') throw new Error('Invalid warehouse AWB');
    numericFields(item, ['wt', 'pcs'], 'Warehouse');
  }
  for (const record of snapshot.db.sec || []) {
    if (record.id !== undefined) safeId(record.id, 'Security');
    if (typeof record.awb !== 'string' || !['Export', 'Import'].includes(record.dir)) throw new Error('Invalid security reception');
  }
  for (const report of snapshot.db.reports || []) {
    safeId(report.id, 'Handover report'); object(report.F, 'Handover figures'); object(report.F.cash, 'Handover cash figures');
    for (const direction of ['exp', 'imp']) {object(report.F[direction], 'Handover movement figures'); for (const group of ['tot', 'spc', 'per']) {object(report.F[direction][group], 'Handover cargo totals'); numericFields(report.F[direction][group], ['awb', 'pcs', 'wt'], 'Handover cargo totals');}}
    numericFields(report.F.cash, ['takeover', 'cash', 'card', 'cass', 'credit', 'bank', 'sales', 'onhand', 'handed'], 'Handover cash figures');
  }
  return snapshot;
}

export function migrateSnapshot(input) {
  object(input, 'Backup'); safeTree(input);
  // Legacy backups contain only the register; missing stores stay explicitly empty.
  const recovered = input.snapshot && Number.isInteger(input.revision) ? input.snapshot : input;
  const source = recovered.format ? recovered : makeSnapshot(recovered, {items: []}, {items: [], cleared: [], removed: []});
  const next = JSON.parse(JSON.stringify(source));
  object(next.db, 'Invoice store'); records(next.db.entries, 'Invoices');
  next.db.seq ??= {export: 0, import: 0}; next.db.seq.export ??= 0; next.db.seq.import ??= 0;
  next.db.sec ??= []; next.db.rates ??= {};
  next.db.openingBalance ??= 0; next.db.openingNote ??= ''; next.db.openingDate ??= '';
  next.db.customers = [];
  for (const entry of next.db.entries) {
    entry.type ??= entry.amount !== undefined && entry.mawb === undefined ? 'handover' : 'invoice';
    if (entry.type === 'invoice' && entry.billTo === undefined) {
      entry.billTo = entry.cust || ''; entry.billTrn = entry.acct || ''; entry.billAddr = entry.addr || '';
    }
  }
  for (const record of next.db.sec) record.id ||= 'SEC_' + crypto.randomUUID();
  next.shipments ??= {items: []}; next.warehouse ??= {items: [], cleared: [], removed: []};
  next.warehouse.cleared ??= []; next.warehouse.removed ??= [];
  return validateSnapshot(next);
}
