import { app } from '../core/runtime.js';

function validAwb(value) { return typeof value === 'string' && /^[0-9 -]+$/.test(value) && /^\d{11}$/.test(app.awbKey(value)); }
function receptionRecord(awb, dir, by) {
  if (!validAwb(awb) || !['Export', 'Import'].includes(dir)) throw new Error('Enter an 11-digit AWB and select Export or Import.');
  return { id: 'SEC_' + crypto.randomUUID(), awb, dir, by: by || '', ts: new Date().toISOString(), ack: false };
}
function commitSecurity(next) {
  const previous = app.DB.sec;
  app.DB.sec = next;
  try {
    if (app.save() === false) { app.DB.sec = previous; return false; }
  } catch {
    app.DB.sec = previous;
    app.toast('Could not save the reception list. Your changes were not recorded.', 'err');
    return false;
  }
  app.renderSecurity();
  return true;
}

app.validateSecurityList = function validateSecurityList(data) {
  if (!Array.isArray(data) || data.length > 50000) throw new Error('Choose a security list containing at most 50,000 records.');
  const ids = new Set(), active = new Set();
  return data.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(row.id)
      || !validAwb(row.awb) || !['Export', 'Import'].includes(row.dir)
      || typeof row.by !== 'string' || row.by.length > 500
      || typeof row.ts !== 'string' || !Number.isFinite(Date.parse(row.ts))
      || typeof row.ack !== 'boolean') throw new Error('Security record ' + (index + 1) + ' is invalid. The existing list was kept.');
    const key = row.dir + ':' + app.awbKey(row.awb);
    if (ids.has(row.id) || (!row.ack && active.has(key))) throw new Error('The security list contains duplicate identities or active receptions.');
    ids.add(row.id); if (!row.ack) active.add(key);
    return { id: row.id, awb: row.awb, dir: row.dir, by: row.by, ts: row.ts, ack: row.ack };
  });
};

app.buildSecurity = function buildSecurity(){
  var h = '<div class="panel"><h3>Facility Security — AWB Reception</h3><div class="body">';
  h += '<div class="fgrid">';
  h += app.fld("Flow Direction *", app.sel("sec_dir", ["Export","Import"], ["Export - outbound cargo","Import - inbound cargo"]), "req");
  h += app.fld("AWB # *", '<input id="sec_awb" type="text" placeholder="e.g. 780-30900000">', "req");
  h += app.fld("Received By / Section", '<input id="sec_by" type="text" placeholder="e.g. ACC, WH, X-ray">');
  h += '</div>';
  h += '<div class="btnbar" style="margin-top:11px">'
     + '<button class="btn pri" id="sec_add">+ Add to Reception List</button>'
     + '<button class="btn dgr" id="sec_ack">Acknowledge / Clear Selected</button>'
     + '<span class="hint" style="margin-left:8px">Or paste a block of AWBs below</span>'
     + '</div>';
  h += '<div style="margin-top:9px">'
     + '<button class="btn ok" id="sec_blockadd" style="margin-right:8px">Add Block</button>'
     + '<textarea id="sec_block" rows="2" style="width:calc(100% - 92px);border:1px solid var(--line);border-radius:6px;padding:6px 9px;background:#fff;font-size:12px;resize:vertical" placeholder="Paste one AWB per line, e.g.&#10;780-30000001&#10;780-30000002&#10;780-30000003"></textarea>'
     + '</div>';
  h += '</div></div>';

  h += '<div id="sec_alerts"></div>';

  h += '<div class="panel" style="margin-top:12px"><h3>AWB Reception — Inbound to Warehouse</h3><div class="body" style="padding:12px 14px">';
  h += '<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap">';
  h += '<span style="font-size:10.5px;font-weight:700;color:var(--mut);letter-spacing:.5px;text-transform:uppercase">Filter by flow:</span>';
  h += '<select id="sec_dirfilter" style="border:1px solid var(--line);border-radius:6px;padding:5px 9px;background:#fff;font-size:12px">';
  h += '<option value="">All flows</option><option value="Export">Export</option><option value="Import">Import</option>';
  h += '</select>';
  h += '<button class="btn sm pri" id="sec_scan" style="margin-left:auto">Scan for Missing Invoice</button>';
  h += '</div>';
  h += '<div class="regwrap"><table class="reg" id="sec_tbl"><thead><tr>';
  h += '<th style="width:36px"><input type="checkbox" id="sec_selectall" aria-label="Select all visible reception records"></th><th>AWB #</th><th>Flow</th><th>Received</th><th>Received By</th>';
  h += '<th>Invoice Status</th><th style="width:50px"></th></tr></thead><tbody></tbody></table></div>';
  h += '<p class="hint" style="margin:8px 0 0 0">AWBs with an invoice on the register show <span class="tick">Invoiced</span>. Those without show <span class="cross" style="color:#dc2626;font-weight:700">NOT INVOICED</span>.</p>';
  h += '</div></div>';

  h += '<div class="panel" id="sec_missingpanel" style="margin-top:12px;background:#fef2f2;border:1px solid #fecaca">';
  h += '<h3>Missing Invoice — AWB Not Yet Invoiced <span class="badge" style="background:#dc2626;margin-left:6px">ALERT</span></h3>';
  h += '<div class="body"><div id="sec_missing"></div></div>';
  h += '</div>';

  h += '<div class="panel" style="margin-top:12px"><h3>Invoiced Confirmation — Reconciliation</h3><div class="body">';
  h += '<div class="fgrid" style="grid-template-columns:1fr 1fr 1fr">';
  h += app.fld("Scan AWB for confirmation", '<input id="sec_confirm_awb" type="text" placeholder="Paste any AWB...">');
  h += app.fld("Flow Direction", app.sel("sec_confirm_dir", ["Export", "Import"]));
  h += '<div class="f" style="display:flex;flex-direction:column;gap:4px"><span></span><button class="btn ok" id="sec_confirm_search" style="align-self:flex-start">Look up</button></div>';
  h += '</div>';
  h += '<div id="sec_confirm" style="margin-top:10px"></div>';
  h += '</div></div>';

  h += '<div class="btnbar" style="margin-top:12px;justify-content:flex-end;gap:8px">';
  h += '<button class="btn" id="sec_sample">Load Sample Reception</button>';
  h += '<button class="btn" id="sec_backupbtn">Backup This List</button>';
  h += '<button class="btn" id="sec_restorebtn">Restore From File</button>';
  h += '</div>';

  app.$("#p-security").innerHTML = h;

  app.renderSecurity();
  app.$("#sec_scan").onclick = app.scanMissing;
  app.$("#sec_add").onclick = app.addOneAwb;
  app.$("#sec_ack").onclick = app.ackSelected;
  app.$("#sec_blockadd").onclick = app.addBlock;
  app.$("#sec_confirm_search").onclick = app.confirmLookup;
  app.$("#sec_dirfilter").onchange = app.renderSecurity;
  app.$("#sec_block").addEventListener("input", function(){ /* placeholder */ });
  app.$("#sec_sample").onclick = app.loadSample;
  app.$("#sec_backupbtn").onclick = app.backupSecurity;
  app.$("#sec_restorebtn").onclick = app.restoreSecurity;
};

app.trimAwb = function trimAwb(s){ return String(s||"").trim().replace(/[^0-9-]/g,""); };

app.secAdd = function secAdd(awb, dir, by){
  try { return commitSecurity((app.DB.sec || []).concat(receptionRecord(awb, dir, by))); }
  catch (error) { app.toast(error.message, 'err'); return false; }
};

app.addOneAwb = function addOneAwb(){
  var awb=app.trimAwb(app.$("#sec_awb").value);
  var dir=app.$("#sec_dir").value;
  var by=app.$("#sec_by").value.trim();
  if(!awb){ app.toast("Paste an AWB first","err"); return; }
  if(app.secFind(awb, dir)){ app.toast(awb+" is already on the reception list","warn"); app.$("#sec_awb").value=""; app.$("#sec_awb").focus(); return; }
  if (app.secAdd(awb, dir, by) === false) return;
  app.$("#sec_awb").value=""; app.$("#sec_awb").focus();
};

app.loadSample = function loadSample(){
  if(!confirm("Fill the reception list with sample cargo so you can test the missing-invoice alerts?")) return;
  var samples = [
    {awb:"780-31000001", dir:"Export", by:"ACC"},
    {awb:"780-31000002", dir:"Export", by:"WH"},
    {awb:"780-31000003", dir:"Import", by:"ACC"},
    {awb:"780-31000004", dir:"Import", by:"ACC"},
    {awb:"780-31000005", dir:"Import", by:"WH"}
  ];
  var added = samples.filter(function(s){ return !app.secFind(s.awb, s.dir); }).map(function(s){ return receptionRecord(s.awb, s.dir, s.by); });
  if (!commitSecurity((app.DB.sec || []).concat(added))) return;
  app.toast("Sample reception loaded ("+added.length+" AWBs)","ok");
};

app.backupSecurity = function backupSecurity(){
  var data = app.DB.sec || [];
  var blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  var a = document.createElement("a");
  a.href = window.URL.createObjectURL(blob);
  a.download = "solitair-security-"+new Date().toISOString().slice(0,10)+".backup.json";
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 500);
};

app.restoreSecurity = function restoreSecurity(){
  var f = document.createElement("input");
  f.type="file"; f.accept=".json";
  f.onchange = function(){
    if(!f.files[0]) return;
    if(f.files[0].size > 8 * 1024 * 1024){ app.toast('Security backup is too large. The existing list was kept.', 'err'); return; }
    var r = new FileReader();
    r.onload = function(){
      try{
        var data = app.validateSecurityList(JSON.parse(r.result));
        if (!commitSecurity(data)) return;
        app.toast("Security list restored from file ("+data.length+" AWBs)");
      }catch(e){ app.toast(e.message || "Could not read that file", "err"); }
    };
    r.onerror = function(){ app.toast('Could not read that file. The existing list was kept.', 'err'); };
    r.readAsText(f.files[0]);
  };
  f.click();
};

app.secFind = function secFind(awb, dir){
  var list = app.DB.sec||[], k = app.awbKey(awb);
  return list.some(function(x){ return x.ack===false && app.awbKey(x.awb)===k && x.dir===dir; });
};

app.renderSecurity = function renderSecurity(){
  var secTblEl = app.$("sec_tbl"); var tbl = secTblEl ? secTblEl.querySelector("tbody") : null; if(!tbl) return;
  var selected = new Set(app.$$('[data-sec-select]:checked', tbl).map(function(input){ return input.dataset.secSelect; }));
  var fdir = app.$("#sec_dirfilter").value||"";

  var list = (app.DB.sec||[]).filter(function(x){ return x.ack===false; });
  if(fdir) list = list.filter(function(x){ return x.dir===fdir; });
  list = list.sort(function(a,b){ if(a.dir!==b.dir) return a.dir<b.dir?-1:1; return a.ts < b.ts ? 1 : (a.ts > b.ts ? -1 : 0); });

  if(!list.length){
    tbl.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--mut);padding:14px">No reception records yet. Receive cargo and add the AWB above to track it here.</td></tr>';
  } else {
    tbl.innerHTML = list.map(function(x){
      var sold = app.findInvoiceByAWB(x.awb, x.dir);
      var statusTxt, cls;
      if(sold){
        statusTxt = '<span class="tick">Invoiced</span> <span style="font-size:10px;color:var(--mut)">'+app.esc(sold.ref)+'</span>';
        cls = "paychk ok";
      } else {
        statusTxt = '<span class="cross" style="color:#dc2626;font-weight:700">NOT INVOICED</span>';
        cls = "paychk bad";
      }
      return '<tr data-id="'+app.esc(x.id)+'">'
        + '<td><input type="checkbox" data-sec-select="'+app.esc(x.id)+'" aria-label="Select '+app.esc(x.dir+' '+x.awb)+'"'+(selected.has(x.id)?' checked':'')+'></td>'
        + '<td><b>'+app.esc(x.awb)+'</b></td>'
        + '<td><span class="badge '+(x.dir==="Export"?"b-exp":"b-imp")+'">'+app.esc(x.dir)+'</span></td>'
        + '<td>'+app.esc(app.fmtDT(x.ts))+'</td>'
        + '<td>'+app.esc(x.by)+'</td>'
        + '<td><span class="'+cls+'" style="display:block;font-size:10.5px;font-weight:700">'+statusTxt+'</span></td>'
        + '<td><button class="btn sm dgr secrm" data-id="'+app.esc(x.id)+'" title="Delete this record">×</button></td>'
        + '</tr>';
    }).join("");
    app.$$("[data-id]", tbl).forEach(function(tr){
      var b = tr.querySelectorAll(".secrm");
      if(!b.length) return;
      b[0].onclick = function(){
        var rid = b[0].getAttribute("data-id");
        var row = (app.DB.sec||[]).filter(function(x){ return x.id===rid; })[0];
        if(!row) return;
        app.modal("Delete reception record?",
          "<p>Remove <b>"+app.esc(row.awb)+"</b> ("+app.esc(row.dir)+") from the reception list? This cannot be undone.</p>",
          [{label:"Cancel"},{label:"Delete", cls:"dgr", fn:function(){
            if (!commitSecurity((app.DB.sec||[]).filter(function(x){ return x.id!==rid; }))) return false;
            app.toast("Reception record deleted", "ok");
          }}]);
      };
    });
  }
  var selectAll = app.$('sec_selectall');
  var boxes = app.$$('[data-sec-select]', tbl);
  function selectionState(){
    var count = boxes.filter(function(input){ return input.checked; }).length;
    selectAll.checked = !!boxes.length && count === boxes.length;
    selectAll.indeterminate = count > 0 && count < boxes.length;
    selectAll.disabled = !boxes.length;
  }
  selectAll.onchange = function(){ boxes.forEach(function(input){ input.checked = selectAll.checked; }); selectionState(); };
  boxes.forEach(function(input){ input.onchange = selectionState; });
  selectionState();

  /* missing invoice alert */
  var missing = [];
  list.forEach(function(x){
    if(!app.findInvoiceByAWB(x.awb, x.dir)){
      missing.push({ awb:x.awb, dir:x.dir, by:x.by, ts:x.ts });
    }
  });
  if(missing.length){
    app.$("#sec_missingpanel").style.display = "";
    app.$("#sec_missing").innerHTML = '<div class="alert err" style="margin-bottom:10px">'
      + '<b>ALERT: '+missing.length+' AWB(s) received but no invoice on the register yet.</b> '
      + 'Check with cargo acceptance before closing the shift.</div>'
      + '<table class="reg"><thead><tr><th>AWB #</th><th>Flow</th><th>Received At</th><th>Status</th></tr></thead><tbody>'
      + missing.map(function(m){
        return '<tr><td><b>'+app.esc(m.awb)+'</b></td>'
          + '<td><span class="badge '+(m.dir==="Export"?"b-exp":"b-imp")+'">'+app.esc(m.dir)+'</span></td>'
          + '<td>'+app.esc(app.fmtDT(m.ts))+'</td>'
          + '<td><span class="paychk bad">NOT INVOICED</span></td>'
          + '</tr>';
      }).join("")
      + '</tbody></table>';
  } else {
    app.$("#sec_missingpanel").style.display = "none";
  }
};

app.findInvoiceByAWB = function findInvoiceByAWB(awb, direction){
  /* AWBs compare by their digits, so 780-30901001 and 78030901001 are one AWB */
  var hay = app.awbKey(awb);
  var best = null;
  app.DB.entries.forEach(function(e){
    if(e.type!=="invoice" || (direction && e.mode !== direction)) return;
    if(hay && app.awbKey(e.mawb)===hay){
      if(!best || e.ts > best.ts) best = e;
    }
  });
  return best;
};

app.scanMissing = function scanMissing(){
  var list = app.DB.sec ? app.DB.sec.filter(function(x){ return x.ack===false; }) : [];
  var byDir = { Export:[], Import:[] };
  list.forEach(function(x){ if (byDir[x.dir]) byDir[x.dir].push(x.awb); });

  var expMiss = byDir.Export.length ? byDir.Export.filter(function(a){ return !app.findInvoiceByAWB(a, 'Export'); }).length : 0;
  var impMiss = byDir.Import.length ? byDir.Import.filter(function(a){ return !app.findInvoiceByAWB(a, 'Import'); }).length : 0;

  var html = '<div class="alert info" style="margin-bottom:8px">'
    + '<b>Scan complete.</b> '+list.length+' AWBs on reception list. '
    + '<span class="tick">Invoiced:</span> '+(list.length - expMiss - impMiss)
    + ' &nbsp;&nbsp; <span class="cross" style="color:#dc2626;font-weight:700">Missing invoice:</span> '+(expMiss+impMiss)+'</div>';

  if(byDir.Export.length){
    html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px;margin-bottom:8px">'
      + '<span class="badge b-exp" style="margin-right:8px">Export</span><b>'+byDir.Export.length+' AWB(s)</b> | '
      + '<span class="tick">Invoiced</span> '+(byDir.Export.length-expMiss)+' &nbsp;|&nbsp; '
      + '<span class="cross" style="color:#dc2626;font-weight:700">Missing</span> '+expMiss+'</div>';
  }
  if(byDir.Import.length){
    html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 12px">'
      + '<span class="badge b-imp" style="margin-right:8px">Import</span><b>'+byDir.Import.length+' AWB(s)</b> | '
      + '<span class="tick">Invoiced</span> '+(byDir.Import.length-impMiss)+' &nbsp;|&nbsp; '
      + '<span class="cross" style="color:#dc2626;font-weight:700">Missing</span> '+impMiss+'</div>';
  }

  app.$("#sec_alerts").innerHTML = html;
  app.renderSecurity();
};

app.ackSelected = function ackSelected(){
  var secTblEl2 = app.$("sec_tbl"); var tbl = secTblEl2 ? secTblEl2.querySelector("tbody") : null;
  var selected = new Set(app.$$('[data-sec-select]:checked', tbl).map(function(input){ return input.dataset.secSelect; }));
  var n = 0;
  var next = (app.DB.sec || []).map(function(row){
    if(selected.has(row.id) && !row.ack){
      n++; return Object.assign({}, row, {ack: true});
    }
    return row;
  });
  if(n){ if (!commitSecurity(next)) return; app.toast(n+" record(s) cleared / acknowledged","ok"); }
  else app.toast("No records selected", "warn");
};

app.addBlock = function addBlock(){
  var text = app.$("#sec_block").value || "";
  var dir = app.$("#sec_dir").value;
  var by   = app.$("#sec_by").value.trim();
  var lines = text.split(/\r?\n/).map(function(s){ return app.trimAwb(s); }).filter(Boolean);
  if(!lines.length){ app.toast("Paste at least one AWB","err"); return; }

  var added=[], skip=0, keys = new Set((app.DB.sec || []).filter(function(row){ return !row.ack && row.dir === dir; }).map(function(row){ return app.awbKey(row.awb); }));
  try {
    lines.forEach(function(awb){
      var key = app.awbKey(awb);
      if (!validAwb(awb)) throw new Error('Every line must contain an 11-digit AWB. Nothing was added.');
      if(keys.has(key)) skip++;
      else { added.push(receptionRecord(awb, dir, by)); keys.add(key); }
    });
  } catch (error) { app.toast(error.message, 'err'); return; }
  if (!commitSecurity((app.DB.sec || []).concat(added))) return;
  app.toast(added.length+" AWB(s) added; "+skip+" already on list (skipped)","ok");
  app.$("#sec_block").value="";
};

app.confirmLookup = function confirmLookup(){
  var awb = app.trimAwb(app.$("#sec_confirm_awb").value);
  if(!awb){ app.toast("Paste an AWB first","err"); return; }
  var direction = app.$('sec_confirm_dir').value;
  var inv = app.findInvoiceByAWB(awb, direction);
  var d = app.$("#sec_confirm");
  if(!inv){
    d.innerHTML = '<div class="alert err"><b>'+app.esc(awb)+'</b> &mdash; <b>No '+app.esc(direction.toLowerCase())+' invoice found on the register.</b></div>';
    return;
  }
  var pay = inv.payMode;
  var amt = typeof app.money!=="undefined" && app.money ? app.money(inv.total) : inv.total;
  d.innerHTML = '<div class="alert ok"><b>'+app.esc(awb)+'</b> &mdash; invoiced.</div>'
    + '<div style="padding:6px 0;font-size:12px">'
    + '<b>Ref:</b> '+app.esc(inv.ref)+'<br>'
    + '<b>Mode:</b> '+app.esc(inv.mode)+' &nbsp;|&nbsp; <b>Payment:</b> '+app.esc(pay)+' &nbsp;|&nbsp; <b>Total:</b> '+app.amp(amt)
    + '<br><b>Customer:</b> '+app.esc(inv.cust)+' &nbsp;|&nbsp; <b>Staff:</b> '+app.esc(inv.staff)+' &nbsp;|&nbsp; <b>Date:</b> '+app.fmtD(inv.date)+'</div>';
};

app.amp = function amp(n){ return typeof app.money!=="undefined" && app.money ? app.money(n) : n; };
