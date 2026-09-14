import { app } from '../core/runtime.js';

app.buildAdvice = function buildAdvice(mode){
  var isExp = mode==="export";
  var pg = app.$("p-"+(isExp?"export":"import"));
  if(!pg) return;

  /* which rate lines / cargo fly/no-fly for this mode */
  var LINES = isExp ? app.EXPORT_LINES : app.IMPORT_LINES;

  /* generate a fresh ref no */
  var ref = app.previewRef(mode);

  var h = '<div class="panel"><h3>'+(isExp?"Acceptance Charges Advice - Export":"Delivery Order Advice - Import")+'</h3><div class="body">';

  var p = isExp ? "a" : "i";
  var IN = 'style="width:100%;border:1px solid var(--line);border-radius:5px;padding:7px 9px;font-size:12px;background:#fff;box-sizing:border-box"';
  var INU = IN.replace('box-sizing:border-box"', 'box-sizing:border-box;text-transform:uppercase"');

  /* ---- 1. AWB first: typing it fills in the shipment from the Shipment Database ---- */
  h += '<div class="fgrid" style="grid-template-columns:1fr">';
  h += app.fld("AWB # (MAWB) *", '<div class="awbwrap"><input id="'+p+'_mawb" placeholder="780-30000000" autocomplete="off" class="req" '+INU+'>'
     + '<div class="awbsuggest" id="'+p+'_awbsuggest" style="display:none"></div></div>');
  h += '</div>';
  h += '<div class="awbstatus" id="'+p+'_awbstatus"></div>';

  /* ---- 2. shipment details: filled in from the AWB, all editable ---- */
  h += '<div class="fgrid">';
  h += app.fld("AWB Owner *", '<input id="'+p+'_cust" list="'+p+'_custlist" autocomplete="off" placeholder="Filled in from the AWB, or type to search" class="req" '+IN+'>');
  h += app.fld("HAWB #", '<input id="'+p+'_hawb" placeholder="780-30000000" '+INU+'>');
  /* Export always starts at DWC (origin), Import always ends at DWC (destination) */
  h += app.fld("Origin", '<input id="'+p+'_org" value="'+(isExp?"DWC":"")+'" placeholder="'+(isExp?"DWC":"KHI")+'" '+INU+'>');
  h += app.fld("Destination", '<input id="'+p+'_dst" value="'+(isExp?"":"DWC")+'" placeholder="'+(isExp?"NBO":"DWC")+'" '+INU+'>');
  h += app.fld("Flight No.", '<input id="'+p+'_fltno" placeholder="e.g. 8G 401" '+IN+'>');
  h += app.fld("SHC Code *", app.sel(p+"_shc", app.CFG.shcCodes.map(function(s){ return s.c; }), null, "GEN"), "req");
  /* the time that comes from the manifest first (departure / RCF), then the one the counter records */
  h += app.fld(isExp?"Departure Time & Date *":"RCF Time & Date (Received at SH Facility) *", '<input id="'+p+'_'+(isExp?"t2":"t1")+'" type="datetime-local" value="'+app.nowLocalDT()+'" class="req" '+IN+'>');
  h += app.fld(isExp?"Acceptance Time & Date (RCS) *":"Delivery Time & Date *", '<input id="'+p+'_'+(isExp?"t1":"t2")+'" type="datetime-local" value="'+app.nowLocalDT()+'" class="req" '+IN+'>');
  h += app.fld("Pieces *", '<input id="'+p+'_pcs" type="number" step="1" min="0" placeholder="0" class="req" '+IN+'>');
  h += app.fld("Gross Weight (kg) *", '<input id="'+p+'_wt" type="number" step="0.01" min="0" placeholder="0.00" class="req" '+IN+'>');
  h += app.fld("Nature of Goods", '<input id="'+p+'_nog" placeholder="e.g. General Cargo / Fresh Produce / Live Animals" '+IN+'>');
  /* HAWB qty is optional - only entered when a shipment has several House AWBs under one MAWB */
  h += app.fld("HAWB Qty (if applicable)", '<input id="'+p+'_hawbqty" type="number" step="1" min="0" placeholder="0" '+IN+'>');
  h += '</div>';

  /* one list for both pickers: exactly the Customer Database */
  h += '<datalist id="'+p+'_custlist"></datalist>';

  /* staff - stands alone, full width */
  h += '<div class="fgrid" style="grid-template-columns:1fr">';
  h += app.fld("Staff", '<select id="'+p+'_staff" style="border:1px solid var(--line);border-radius:5px;padding:6px 9px;background:#fff;font-size:12px;width:100%;box-sizing:border-box">'+app.CFG.staff.map(function(s){ return '<option'+(s===app.DB.staff?" selected":"")+'>'+app.esc(s)+'</option>'; }).join("")+'</select>');
  h += '</div>';

  /* ---- 3. billing party: who this advice is invoiced to. Its TRN and address are
     the only customer TRN and address on the form, and the ones that print ---- */
  h += '<div class="billband"><div class="bandtitle">Billing Party</div><div class="billgrid">';
  h += app.fld("Billing Party *", '<div style="display:flex;gap:6px">'
     + '<input id="'+p+'_bill" list="'+p+'_custlist" autocomplete="off" placeholder="Type to search '+app.CUSTOMERS.length.toLocaleString("en-US")+' customers" class="req" '+IN+'>'
     + '<button class="btn sm" id="'+p+'_bill_same" type="button" title="Bill the company the AWB is booked under" style="white-space:nowrap">Same as AWB owner</button></div>');
  h += app.fld("Billing Party TRN", '<input id="'+p+'_bill_trn" '+IN+'>');
  h += app.fld("Billing Party Address", '<input id="'+p+'_bill_addr" '+IN+'>');
  h += '</div></div>';

  /* payment mode is chosen once, via the buttons in the Payment Breakdown
     panel below - this hidden select just keeps holding that value for
     the rest of the code (collectAdvice, dashboard filters, etc.) */
  h += app.sel((isExp?"a":"i")+"_paymode", app.CFG.payModes, null, "Cash").replace('<select ', '<select style="display:none" ');

  /* ---- charge table ---- */
  h += '<div style="margin-top:12px">';
  h += '<div style="font-size:10.5px;font-weight:700;color:var(--mut);letter-spacing:.5px;text-transform:uppercase;margin-bottom:4px">Charge Lines  (rates from tariff; VAT is per line, as set in the rate sheet)</div>';
  h += '<table class="chg" style="width:100%"><thead><tr>';
  h += '<th style="text-align:left;width:40%">Service Description</th>';
  h += '<th style="width:130px">Rate (AED)</th>';
  h += '<th style="width:80px">Qty / Basis</th>';
  h += '<th style="width:90px">Line Total</th>';
  h += '<th style="width:80px">Min Chg</th>';
  h += '<th style="width:90px">Chargeable</th>';
  h += '<th style="width:50px">VAT %</th>';
  h += '<th style="width:50px"></th>';
  h += '</tr></thead><tbody id="'+(isExp?"a":"i")+'_lines"></tbody></table>';
  h += '</div>';

  /* populate the charge table from rate lines (build rows into HTML string) */
  var rows = "";
  LINES.forEach(function(l, idx){
    if(l.g){
      /* group header */
      rows += '<tr class="g"><td colspan="8" style="padding:5px 8px;font-weight:700;font-size:11px;color:var(--mut);background:var(--line2);border-radius:3px">'+app.esc(l.d)+'</td></tr>';
      if(l.g.indexOf("B. Storage")===0){
        /* live elapsed-time / chargeable-days readout, filled in by applyAutoQty() */
        rows += '<tr><td colspan="8" style="padding:2px 8px 6px"><span id="'+(isExp?"a":"i")+'_storageinfo" style="font-size:10.5px;color:var(--mut)">'+(isExp?"Elapsed since acceptance":"Elapsed since RCF")+': – &nbsp;|&nbsp; Free period: – &nbsp;|&nbsp; Chargeable: – day(s)</span></td></tr>';
      }
      return;
    }
    if(l.kind==="days" || l.kind==="misc"){ /* non-billable line - skip in form */ return; }
    var descCell = (l.role==="dgcond")
      ? '<td class="desc" style="font-size:11.5px"><span class="descname">'+app.esc(l.d)+'</span><br><label style="font-weight:400;font-size:10.5px;color:var(--mut);cursor:pointer"><input type="checkbox" id="'+(isExp?"a":"i")+'_dgr_reject" style="vertical-align:middle;margin-right:4px">Reject / not required</label></td>'
      : '<td class="desc" style="font-size:11.5px"><span class="descname">'+app.esc(l.d)+'</span></td>';
    rows += '<tr data-lid="'+l.id+'">'
      + descCell
      + '<td><input class="qty" type="number" step="0.001" value="'+l.rate+'" data-lid="'+l.id+'" data-f="rate" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:90%;box-sizing:border-box;background:#fff"></td>'
      + '<td><input class="qty" type="number" step="0.01" value="0" data-lid="'+l.id+'" data-f="qty" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:80%;box-sizing:border-box;background:#fff"></td>'
      + '<td class="n mono" data-lid="'+l.id+'" data-f="total" style="font-size:11.5px">'+app.money(l.rate)+'</td>'
      + '<td><input class="qty" type="number" step="0.01" value="'+l.min+'" data-lid="'+l.id+'" data-f="min" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:90%;box-sizing:border-box;background:#fff"></td>'
      + '<td class="n mono" data-lid="'+l.id+'" data-f="charge" style="font-size:11.5px">'+app.money(l.min)+'</td>'
      + '<td><select data-lid="'+l.id+'" data-f="vat" style="border:1px solid var(--line);border-radius:4px;padding:3px 5px;font-size:11px;width:60px;background:#fff"><option value="0">0%</option><option value="5" '+(l.vat>=5?"selected":"")+'>5%</option></select></td>'
      + '<td><button class="btn sm dgr" data-rmline="'+l.id+'" style="padding:2px 6px;font-size:11px">×</button></td>'
      + '</tr>';
  });
  h = h.replace('</tbody></table>', rows + '</tbody></table>');

  /* optional tariff charges - add one only when it actually applies */
  var OPTIONAL = isExp ? app.EXPORT_OPTIONAL : app.IMPORT_OPTIONAL;
  h += '<div class="btnbar" style="margin-top:8px;align-items:center">';
  h += '<select id="'+(isExp?"a":"i")+'_optsel" style="border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;max-width:360px">';
  h += '<option value="">Add Tariff Charge (whenever applicable)...</option>';
  OPTIONAL.forEach(function(o){ h += '<option value="'+o.id+'">'+app.esc(o.d)+'</option>'; });
  h += '</select>';
  h += '</div>';

  /* add a manual/custom line button */
  h += '<div class="btnbar" style="margin-top:6px"><button class="btn sm" id="'+(isExp?"a":"i")+'_addline">+ Add Custom Line</button> <span class="hint">Or override any rate above directly.</span></div>';

  /* ---- totals + remarks ---- */
  h += '<div style="margin-top:10px;padding:8px 10px;background:#f8fafc;border:1px solid var(--line);border-radius:5px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  h += '<span style="font-size:11px;color:var(--mut)">TOTAL CHARGES (AED)</span>';
  h += '<span id="'+(isExp?"a":"i")+'_total" style="font-size:15px;font-weight:700;color:var(--brand);font-variant-numeric:tabular-nums">0.00</span>';
  h += '</div>';

  h += app.fld("Transaction Ref (if any)", '<input id="'+(isExp?"a":"i")+'_txn" placeholder="Optional" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box">');
  h += app.fld("Remarks", '<textarea id="'+(isExp?"a":"i")+'_rem" rows="2" placeholder="Any notes..." style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box;resize:vertical"></textarea>');
  h += '</div>';

  /* ---- pay mode breakdown (cash / card / credit / cass / bank) ---- */
  h += '<div class="panel" style="margin-top:10px"><h3>Payment Breakdown</h3><div class="body">';
  h += '<div class="pmodes" id="'+(isExp?"a":"i")+'_pmodes">';
  app.CFG.payModes.forEach(function(pm){
    h += '<button class="payopt'+(pm==="Cash"?" on":"")+'" data-pm="'+pm+'" style="border:1px solid var(--line);background:#fff;border-radius:6px;padding:7px 14px;font-weight:600;font-size:12px;color:var(--txt)">'+app.esc(pm)+'</button>';
  });
  h += '</div>';

  /* 5 payment method inputs - only the relevant one(s) show based on selected
     mode - and the reason box, shown in every mode, for an amount that differs
     from the total */
  h += '<div class="payfields" id="'+(isExp?'a':'i')+'_payfields" style="margin-top:8px">';
  h += app.fld("Cash Collected (AED)", '<input id="'+(isExp?"a":"i")+'_pay_cash" type="number" step="0.01" min="0" value="" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box;font-variant-numeric:tabular-nums">');
  h += app.fld("Card (AED)", '<input id="'+(isExp?"a":"i")+'_pay_card" type="number" step="0.01" min="0" value="" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box;font-variant-numeric:tabular-nums">');
  h += app.fld("Credit (AED)", '<input id="'+(isExp?"a":"i")+'_pay_credit" type="number" step="0.01" min="0" value="" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box;font-variant-numeric:tabular-nums">');
  h += app.fld("CASS (AED)", '<input id="'+(isExp?"a":"i")+'_pay_cass" type="number" step="0.01" min="0" value="" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box;font-variant-numeric:tabular-nums">');
  h += app.fld("Bank Transfer (AED)", '<input id="'+(isExp?"a":"i")+'_pay_bank" type="number" step="0.01" min="0" value="" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box;font-variant-numeric:tabular-nums">');
  h += app.fld("Reason the amount differs from the total", '<input id="'+(isExp?"a":"i")+'_pay_reason" type="text" placeholder="Needed only when the amount is more or less than the total" style="width:100%;border:1px solid var(--line);border-radius:5px;padding:6px 9px;font-size:12px;background:#fff;box-sizing:border-box">');
  h += '</div>';

  h += '<div style="margin-top:8px;font-size:11px;color:var(--mut)">Receiving Party: <input id="'+(isExp?"a":"i")+'_rcvby" placeholder="Name of person who received /accepted cargo" style="border:1px solid var(--line);border-radius:5px;padding:5px 8px;font-size:12px;background:#fff;box-sizing:border-box"></div>';

  h += '</div></div>';

  /* ---- button bar ---- */
  h += '<div class="btnbar" style="margin-top:10px;justify-content:space-between">';
  h += '<button class="btn dgr" id="'+(isExp?"a":"i")+'_reset">Reset Form</button>';
  h += '<div class="btnbar">';
  h += '<button class="btn" id="'+(isExp?"a":"i")+'_preview">Preview</button>';
  h += '<button class="btn" id="'+(isExp?"a":"i")+'_print">Print</button>';
  h += '<button class="btn pri" id="'+(isExp?"a":"i")+'_save">Save to Register</button>';
  h += '</div>';
  h += '</div>';

  h += '</div></div>';

  /* ---- wire up: populate datalist + attach handlers ---- */
  pg.innerHTML = h;

  /* both pickers - AWB owner and billing party - list exactly the Customer
     Database. Names held in this browser's saved data from earlier use are never
     offered, so the prototype can only ever show its demo customers. */
  var dl = app.$((isExp?"a":"i")+"_custlist");
  if(dl) dl.innerHTML = app.CUSTOMERS.map(function(c){ return '<option value="'+app.esc(c.name)+'">'; }).join("");

  /* billing party picker -> its TRN and address */
  app.wireBillingParty(mode);

  /* payment mode buttons */
  var pmodes = app.$((isExp?"a":"i")+"_pmodes");
  if(pmodes){
    pmodes.querySelectorAll(".payopt").forEach(function(btn){
      btn.onclick = function(){
        pmodes.querySelectorAll(".payopt").forEach(function(b){ b.classList.remove("on"); b.style.background="#fff"; b.style.borderColor="var(--line)"; b.style.color="var(--txt)"; });
        btn.classList.add("on");
        btn.style.background="var(--brand)"; btn.style.borderColor="var(--brand)"; btn.style.color="#fff";
        var was = app.$((isExp?"a":"i")+"_paymode").value;
        app.$((isExp?"a":"i")+"_paymode").value = btn.dataset.pm;
        /* show only the payment field(s) matching the selected mode; a hidden
           field goes back to its starting value */
        var pf = app.$((isExp?"a":"i")+"_payfields");
        if(pf){
          var pm = btn.dataset.pm;
          var allFields = pf.querySelectorAll("input");
          var visIds = {
            "Cash": "pay_cash",
            "Card": "pay_card",
            "Credit": "pay_credit",
            "CASS": "pay_cass",
            "Bank Transfer": "pay_bank",
            "Cash + Card": ["pay_cash", "pay_card"]
          }[pm];
          var p = isExp?"a":"i";
          visIds = Array.isArray(visIds) ? visIds : [visIds];
          allFields.forEach(function(f){
            var suffix = f.id.replace(p+"_","");
            var show = suffix === "pay_reason" || visIds.indexOf(suffix) >= 0;
            f.parentElement.style.display = show ? "block" : "none";
            if(!show) f.value = f.defaultValue;
          });
          /* a reason belongs to the amounts it explains, which a change of mode clears */
          if(was !== pm) app.$(p+"_pay_reason").value = "";
          app.payHint(p, pm);
        }
        /* set the matching pay field to the total and zero out others - done on save */
      };
    });
  }

  /* set default pay mode */
  app.$((isExp?"a":"i")+"_paymode").value = "Cash";
  var firstPm = pmodes ? pmodes.querySelector('.payopt') : null;
  if(firstPm){ firstPm.classList.add("on"); firstPm.style.background="var(--brand)"; firstPm.style.borderColor="var(--brand)"; firstPm.style.color="#fff"; }
  /* apply initial payment field visibility (Cash: the cash amount and the reason) */
  var pf = app.$((isExp?"a":"i")+"_payfields");
  if(pf){
    var p = isExp?"a":"i";
    ["pay_cash","pay_card","pay_credit","pay_cass","pay_bank","pay_reason"].forEach(function(s){
      var el = pf.querySelector("input[id=\""+p+"_"+s+"\"]");
      if(el) el.parentElement.style.display = s === "pay_cash" || s === "pay_reason" ? "block" : "none";
    });
    app.payHint(p, "Cash");
  }

  /* live recalc of charge table */
  var linesTbody = app.$((isExp?"a":"i")+"_lines");
  if(linesTbody){
    linesTbody.addEventListener("input", function(e){
      var t = e.target;
      if(t.dataset && t.dataset.f){
        app.recalcLine(t);
        app.recalcAll(isExp?"a":"i");
      }
    });
    linesTbody.addEventListener("change", function(e){
      var t = e.target;
      if(t.dataset && t.dataset.f === "vat"){
        app.recalcLine(t);
        app.recalcAll(isExp?"a":"i");
      }
    });
    /* initial recalc */
    Array.from(linesTbody.querySelectorAll("[data-lid]")).forEach(function(row){
      app.recalcLine(row);
    });
    app.recalcAll(isExp?"a":"i");
  }

  /* Gross Weight auto-applies to every per-kg handling line. Storage is
     billed per kg/day, only for the storage line matching the shipment's
     SHC-driven cargo class, and only for whole days beyond the free
     period (48 hrs general/special, 8 hrs perishable - configurable in
     Rates & Data), based on the acceptance/RCF time vs. the departure/
     delivery time. */
  var wtInput = app.$((isExp?"a":"i")+"_wt");
  var shcInput = app.$((isExp?"a":"i")+"_shc");
  var t1Input = app.$((isExp?"a":"i")+"_t1");
  var t2Input = app.$((isExp?"a":"i")+"_t2");
  function applyAutoQty(){
    if(!linesTbody) return;
    var wt = app.num(wtInput ? wtInput.value : 0);
    var shcVal = shcInput ? shcInput.value : "";
    var cls = app.shcClass(shcVal);
    var days = app.calcStorageDays(t1Input ? t1Input.value : "", t2Input ? t2Input.value : "", cls);
    /* hours between acceptance/RCF (t1) and departure/delivery (t2), for
       the "Late Acceptance of Cargo" auto-condition (within 5 hrs) */
    var gapHours = -1;
    if(t1Input && t2Input && t1Input.value && t2Input.value){
      var d1 = new Date(t1Input.value), d2 = new Date(t2Input.value);
      if(!isNaN(d1.getTime()) && !isNaN(d2.getTime())) gapHours = (d2.getTime()-d1.getTime())/3600000;
    }
    var dgRejectEl = app.$((isExp?"a":"i")+"_dgr_reject");
    var dgRejected = dgRejectEl ? dgRejectEl.checked : false;
    var hawbQtyEl = app.$((isExp?"a":"i")+"_hawbqty");
    var hawbQty = app.num(hawbQtyEl ? hawbQtyEl.value : 0);
    LINES.forEach(function(l){
      var row = linesTbody.querySelector('tr[data-lid="'+l.id+'"]');
      if(!row) return;
      var qtyEl = row.querySelector('[data-f="qty"]');
      var minEl = row.querySelector('[data-f="min"]');
      if(l.role==="awb"){
        if(qtyEl) qtyEl.value = 1;
      } else if(l.role==="handling"){
        if(qtyEl) qtyEl.value = (l.cls === cls) ? (wt||0) : 0;
      } else if(l.kind==="storage"){
        if(qtyEl) qtyEl.value = (l.cls === cls) ? (wt||0) * days : 0;
      } else if(l.role==="dgcond"){
        if(qtyEl) qtyEl.value = (app.shcHas(shcVal, "DGR") && !dgRejected) ? 1 : 0;
      } else if(l.role==="lateaccept"){
        if(qtyEl) qtyEl.value = (gapHours > 0 && gapHours <= 5) ? (wt||0) : 0;
      } else if(l.role==="hawb"){
        if(qtyEl) qtyEl.value = hawbQty||0;
      } else {
        return;
      }
      app.recalcLine(row);
    });
    /* live readout: how many hours have elapsed since acceptance/RCF, the
       free-period threshold for the current cargo class, and how many
       whole chargeable storage days that works out to */
    var storageInfoEl = app.$((isExp?"a":"i")+"_storageinfo");
    if(storageInfoEl){
      var freeH = (app.CFG.freeHours && app.CFG.freeHours[cls] != null) ? app.CFG.freeHours[cls] : 48;
      var clsLabel = cls.charAt(0).toUpperCase() + cls.slice(1);
      var elapsed = isExp ? "Elapsed since acceptance" : "Elapsed since RCF";
      if(gapHours < 0){
        storageInfoEl.textContent = elapsed+": – | Free period ("+clsLabel+"): "+freeH+" hrs | Chargeable: – day(s)";
      } else {
        storageInfoEl.textContent = elapsed+": "+gapHours.toFixed(1)+" hrs | Free period ("+clsLabel+"): "+freeH+" hrs | Chargeable: "+days+" day(s)";
      }
    }
    app.recalcAll(isExp?"a":"i");
  }
  if(linesTbody){
    var hawbQtyInput = app.$((isExp?"a":"i")+"_hawbqty");
    [wtInput, shcInput, t1Input, t2Input, hawbQtyInput].forEach(function(el){
      if(!el) return;
      el.addEventListener("input", applyAutoQty);
      el.addEventListener("change", applyAutoQty);
    });
    /* the DG-reject checkbox is created inside the table row above -
       wire it once the row exists */
    var dgRejectElInit = app.$((isExp?"a":"i")+"_dgr_reject");
    if(dgRejectElInit) dgRejectElInit.addEventListener("change", applyAutoQty);
    applyAutoQty();
  }

  /* AWB lookup: fills the shipment details, then re-runs the auto-charge engine */
  app.wireAwbLookup(mode, applyAutoQty);

  /* add a charge picked from the tariff dropdown - adds automatically on selection */
  var optSel = app.$((isExp?"a":"i")+"_optsel");
  if(optSel && linesTbody){
    optSel.onchange = function(){
      var oid = optSel.value;
      if(!oid) return;
      var already = linesTbody.querySelector('tr[data-catid="'+oid+'"]');
      if(already){ already.scrollIntoView({behavior:"smooth", block:"center"}); app.toast("Already added below", "info"); return; }
      var o = OPTIONAL.filter(function(x){ return x.id===oid; })[0];
      if(!o) return;
      var lid = "OPT_" + o.id + "_" + Date.now();
      var tr = document.createElement("tr");
      tr.dataset.lid = lid;
      tr.dataset.catid = o.id;
      tr.innerHTML =
        '<td class="desc" style="font-size:11.5px;background:#eef6ff">'+app.esc(o.d)+'</td>'+
        '<td><input class="qty" type="number" step="0.001" value="'+o.rate+'" data-lid="'+lid+'" data-f="rate" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:90%;box-sizing:border-box;background:#fff"></td>'+
        '<td><input class="qty" type="number" step="0.01" value="1" data-lid="'+lid+'" data-f="qty" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:80%;box-sizing:border-box;background:#fff"></td>'+
        '<td class="n mono" data-lid="'+lid+'" data-f="total" style="font-size:11.5px">'+app.money(o.rate)+'</td>'+
        '<td><input class="qty" type="number" step="0.01" value="'+o.min+'" data-lid="'+lid+'" data-f="min" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:90%;box-sizing:border-box;background:#fff"></td>'+
        '<td class="n mono" data-lid="'+lid+'" data-f="charge" style="font-size:11.5px">'+app.money(o.min)+'</td>'+
        '<td><select data-lid="'+lid+'" data-f="vat" style="border:1px solid var(--line);border-radius:4px;padding:3px 5px;font-size:11px;width:60px;background:#fff"><option value="0">0%</option><option value="5" '+(o.vat>=5?"selected":"")+'>5%</option></select></td>'+
        '<td><button class="btn sm dgr" data-rmline="'+lid+'" style="padding:2px 6px;font-size:11px">×</button></td>';
      linesTbody.appendChild(tr);
      app.recalcLine(tr);
      app.recalcAll(isExp?"a":"i");
      tr.querySelector("[data-rmline]").onclick = function(){
        tr.parentNode.removeChild(tr);
        app.recalcAll(isExp?"a":"i");
      };
      optSel.value = "";
    };
  }

  /* add custom line */
  var addBtn = app.$((isExp?"a":"i")+"_addline");
  if(addBtn){
    addBtn.onclick = function(){
      var lid = "CUSTOM_" + Date.now() + "_" + Math.floor(Math.random()*10000);
      var tr = document.createElement("tr");
      tr.dataset.lid = lid;
      tr.innerHTML =
        '<td class="desc" style="font-size:11.5px;background:#fffbeb"><input value="Custom service" data-f="desc" style="border:none;background:transparent;font-size:11.5px;width:100%;outline:none"></td>'+
        '<td><input class="qty" type="number" step="0.001" value="0" data-lid="'+lid+'" data-f="rate" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:90%;box-sizing:border-box;background:#fff"></td>'+
        '<td><input class="qty" type="number" step="0.01" value="1" data-lid="'+lid+'" data-f="qty" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:80%;box-sizing:border-box;background:#fff"></td>'+
        '<td class="n mono" data-lid="'+lid+'" data-f="total" style="font-size:11.5px">0.00</td>'+
        '<td><input class="qty" type="number" step="0.01" value="0" data-lid="'+lid+'" data-f="min" style="border:1px solid var(--line);border-radius:4px;padding:4px 6px;font-size:11.5px;width:90%;box-sizing:border-box;background:#fff"></td>'+
        '<td class="n mono" data-lid="'+lid+'" data-f="charge" style="font-size:11.5px">0.00</td>'+
        '<td><select data-lid="'+lid+'" data-f="vat" style="border:1px solid var(--line);border-radius:4px;padding:3px 5px;font-size:11px;width:60px;background:#fff"><option value="0">0%</option><option value="5">5%</option></select></td>'+
        '<td><button class="btn sm dgr" data-rmline="'+lid+'" style="padding:2px 6px;font-size:11px">×</button></td>';
      linesTbody.appendChild(tr);
      app.recalcLine(tr);
      /* wire remove */
      tr.querySelector("[data-rmline]").onclick = function(){
        tr.parentNode.removeChild(tr);
        app.recalcAll(isExp?"a":"i");
      };
      tr.querySelector('[data-f="desc"]').addEventListener("input", function(){ app.recalcLine(tr); });
    };
  }

  /* remove existing line */
  linesTbody.querySelectorAll("[data-rmline]").forEach(function(b){
    b.onclick = function(){
      var tr = b.closest("tr");
      tr.parentNode.removeChild(tr);
      app.recalcAll(isExp?"a":"i");
    };
  });

  /* reset */
  app.$((isExp?"a":"i")+"_reset").onclick = function(){
    if(!confirm("Clear the whole form?")) return;
    pg.innerHTML = "";
    app.buildAdvice(mode);
  };

  /* preview */
  app.$((isExp?"a":"i")+"_preview").onclick = function(){
    var e = app.collectAdvice(mode), problem = app.adviceProblem(e);
    if(problem){ app.toast(problem,"err"); return; }
    app.printAdvice(e, true);
  };

  /* print (direct, all copies, no preview modal) */
  app.$((isExp?"a":"i")+"_print").onclick = function(){
    var e = app.collectAdvice(mode), problem = app.adviceProblem(e);
    if(problem){ app.toast(problem,"err"); return; }
    app.printAdvice(e, false);
  };

  /* save */
  app.$((isExp?"a":"i")+"_save").onclick = function(){
    app.saveAdvice(mode);
  };
};

app.recalcLine = function recalcLine(tr){
  if(!tr) return;
  var lid = tr.dataset.lid;
  var rateEl = tr.querySelector('[data-f="rate"]');
  var qtyEl = tr.querySelector('[data-f="qty"]');
  var minEl = tr.querySelector('[data-f="min"]');
  var vatEl = tr.querySelector('[data-f="vat"]');
  var totalEl = tr.querySelector('[data-f="total"]');
  var chargeEl = tr.querySelector('[data-f="charge"]');
  if(!rateEl || !qtyEl || !minEl || !totalEl || !chargeEl) return;
  var rate = app.num(rateEl.value);
  var qty  = app.num(qtyEl.value);
  var min  = app.num(minEl.value);
  var vat  = app.num(vatEl ? vatEl.value : 0) || 0;
  var total = rate * qty;
  var charge = qty > 0 ? Math.max(total, min) : 0;
  var vatAmt = charge * (vat / 100);
  var chargeWithVat = charge + vatAmt;
  totalEl.textContent = app.money(total);
  chargeEl.textContent = app.money(chargeWithVat);
};

app.PAY_FIELD = {"Cash":"cash", "Card":"card", "Credit":"credit", "CASS":"cass", "Bank Transfer":"bank"};

app.payHint = function payHint(p, pm){
  ["cash","card","credit","cass","bank"].forEach(function(k){
    var el = app.$(p+"_pay_"+k);
    if(el) el.placeholder = app.PAY_FIELD[pm] === k ? "Blank = full total" : "0.00";
  });
};

app.recalcAll = function recalcAll(prefix){
  var tbody = prefix ? app.$(prefix+"_lines") : (app.$("a_lines") || app.$("i_lines"));
  if(!tbody) return;
  var total = 0;
  Array.from(tbody.querySelectorAll("tr[data-lid]")).forEach(function(tr){
    app.recalcLine(tr);
    var c = app.num(tr.querySelector('[data-f="charge"]').textContent);
    total += c;
  });
  var totalEl = prefix ? app.$(prefix+"_total") : (app.$("a_total") || app.$("i_total"));
  if(totalEl) totalEl.textContent = app.money(total);
};

app.collectAdvice = function collectAdvice(mode){
  var isExp = mode==="export";
  var p = (isExp?"a":"i");
  var custEl = app.$(p+"_cust");
  var cust = custEl ? custEl.value.trim() : "";
  var c = app.resolveCustomer(cust);
  var trn = c ? c.trn : "";
  var country = c ? c.country : "";
  var paymode = c ? c.pay : "";
  /* if the hidden paymode field was set by payment button, use that; else fall back to customer's */
  var payBtnVal = app.$(p+"_paymode").value;
  if(payBtnVal) paymode = payBtnVal;

  var billTo = app.$(p+"_bill").value.trim();
  var billTrn = app.$(p+"_bill_trn").value.trim();
  var billAddr = app.$(p+"_bill_addr").value.trim();

  /* gather charge lines */
  var tbody = app.$(p+"_lines");
  var items = [];
  var total = 0;
  if(tbody){
    Array.from(tbody.querySelectorAll("tr[data-lid]")).forEach(function(tr){
      var desc = tr.querySelector('[data-f="desc"]');
      var rate = app.num(tr.querySelector('[data-f="rate"]').value);
      var qty  = app.num(tr.querySelector('[data-f="qty"]').value);
      var min  = app.num(tr.querySelector('[data-f="min"]').value);
      var vat  = app.num(tr.querySelector('[data-f="vat"]').value) || 0;
      var lineTotal = rate * qty;
      var charge = qty > 0 ? Math.max(lineTotal, min) : 0;
      var vatAmt = charge * (vat / 100);
      var chargeWithVat = charge + vatAmt;
      /* only applicable (actually-charged) lines are saved to the record
         and shown on the printed invoice - a line left at quantity 0
         never appears */
      if(chargeWithVat <= 0) return;
      items.push({
        d: desc && desc.value ? desc.value.trim() : ((tr.querySelector('.descname') || tr.querySelector('.desc')).textContent || "Custom line"),
        kind: "qty",
        qty: qty,
        rate: rate,
        total: lineTotal,
        min: min,
        charge: chargeWithVat,
        minApplied: lineTotal < min,
        vat: vat,
        rem: ""
      });
      total += chargeWithVat;
    });
  }

  /* payment breakdown */
  var pay = {
    cash: app.num(app.$(p+"_pay_cash").value),
    card: app.num(app.$(p+"_pay_card").value),
    credit: app.num(app.$(p+"_pay_credit").value),
    cass: app.num(app.$(p+"_pay_cass").value),
    bank: app.num(app.$(p+"_pay_bank").value),
    prepaid: 0
  };

  if(paymode === "Cash + Card"){
    /* zero out other payment fields - cash/card values already came
       straight from the Payment Breakdown fields above */
    pay.credit = 0; pay.cass = 0; pay.bank = 0;
  } else if(app.PAY_FIELD[paymode]){
    /* a single method: the amount typed is kept as entered, 0 included; left
       blank, it is the total. Every other method is zeroed. */
    var typed = app.$(p+"_pay_"+app.PAY_FIELD[paymode]).value.trim(), amount = typed === "" ? total : app.num(typed);
    pay = {cash:0, card:0, credit:0, cass:0, bank:0, prepaid:0};
    pay[app.PAY_FIELD[paymode]] = amount;
  } else {
    /* auto-distribute: if only one payment method has value, use it */
    var nonZero = [];
    if(pay.cash > 0) nonZero.push("cash");
    if(pay.card > 0) nonZero.push("card");
    if(pay.credit > 0) nonZero.push("credit");
    if(pay.cass > 0) nonZero.push("cass");
    if(pay.bank > 0) nonZero.push("bank");
    if(nonZero.length === 0 && total > 0){
      /* default: put everything in cash */
      pay.cash = total;
    } else if(nonZero.length === 1){
      /* single payment method - set it to total */
      var k = nonZero[0];
      pay[k] = total;
    }
  }

  return {
    mode: isExp ? "Export" : "Import",
    ref: app.$(p+"_ref") ? app.$(p+"_ref").value : app.previewRef(mode),
    date: app.ymd(new Date()),
    ts: new Date().toISOString(),
    cust: cust,             /* the AWB owner - Register, Dashboard and Handover report on this */
    cust_trn: trn,
    cust_country: country,
    cust_paymode: paymode,
    billTo: billTo,         /* who the advice is invoiced to; its TRN and address print */
    billTrn: billTrn,
    billAddr: billAddr,
    /* the billing TRN and address again under their earlier names, so a backup
       taken on this version still prints correctly if restored into an earlier one */
    acct: billTrn,
    addr: billAddr,
    mawb: app.$(p+"_mawb").value.trim().toUpperCase(),
    hawb: app.$(p+"_hawb").value.trim().toUpperCase(),
    hawbqty: app.num(app.$(p+"_hawbqty") ? app.$(p+"_hawbqty").value : 0),
    /* only the DWC end has a default; a blank other end stays blank */
    org: app.$(p+"_org").value.trim().toUpperCase() || (isExp?"DWC":""),
    dst: app.$(p+"_dst").value.trim().toUpperCase() || (isExp?"":"DWC"),
    nog: app.$(p+"_nog").value.trim(),
    shc: app.$(p+"_shc").value,
    fltno: app.$(p+"_fltno").value.trim(),
    t1: app.$(p+"_t1").value,
    t2: app.$(p+"_t2").value,
    ata: "",
    wt: app.num(app.$(p+"_wt").value),
    pcs: app.num(app.$(p+"_pcs").value),
    items: items,
    total: total,
    payMode: paymode,
    pay: pay,
    txn: app.$(p+"_txn").value.trim(),
    rem: app.$(p+"_rem").value.trim(),
    /* kept only when the amounts really differ from the total */
    payReason: Math.abs(pay.cash + pay.card + pay.credit + pay.cass + pay.bank - total) > 0.01 && app.$(p+"_pay_reason")
      ? app.$(p+"_pay_reason").value.trim() : "",
    rcvby: app.$(p+"_rcvby").value.trim(),
    cls: app.shcClass(app.$(p+"_shc").value),
    storageOverride: false,
    ovReason: "",
    hardcopy: false,
    staff: (app.$(p+"_staff") && app.$(p+"_staff").value) || app.DB.staff || app.CFG.staff[0]   /* the advice's own Staff choice */
  };
};

/* Validate editable inputs before zero-charge lines are filtered out. A negative
   or unreadable line must not disappear and leave a plausible partial invoice. */
app.adviceInputProblem = function adviceInputProblem(mode){
  var p = mode === "Export" ? "a" : "i", problem = "";
  function check(el, label, positive, integer, optional){
    if(problem || !el) return;
    var raw = String(el.value).trim();
    if(raw === "" && optional && !(el.validity && el.validity.badInput)) return;
    var value = app.strictNumber(raw);
    if(value === null || (positive ? value <= 0 : value < 0) || (integer && !Number.isInteger(value)))
      problem = label + " must be a " + (positive ? "positive" : "nonnegative") + (integer ? " whole number" : " finite number");
  }
  check(app.$(p+"_wt"), "Gross weight", true, false, false);
  check(app.$(p+"_pcs"), "Pieces", true, true, false);
  check(app.$(p+"_hawbqty"), "HAWB quantity", false, true, true);
  var tbody = app.$(p+"_lines");
  if(tbody) Array.from(tbody.querySelectorAll("tr[data-lid]")).forEach(function(row){
    ["rate", "qty", "min", "vat"].forEach(function(field){
      check(row.querySelector('[data-f="'+field+'"]'), "Charge " + ({qty:"quantity", min:"minimum"}[field] || field), false, false, true);
    });
  });
  var payMode = app.$(p+"_paymode");
  var methods = payMode && payMode.value === "Cash + Card" ? ["cash", "card"] : [app.PAY_FIELD[payMode && payMode.value]];
  methods.filter(Boolean).forEach(function(method){ check(app.$(p+"_pay_"+method), "Payment amount", false, false, true); });
  return problem;
};

app.adviceProblem = function adviceProblem(e){
  if(!e.mawb) return "AWB # is required";
  var shipment = app.shFind(e.mawb, false), dir = shipment ? app.shDirection(shipment) : "";
  if(dir && dir !== e.mode)
    return "AWB " + shipment.awb + " is an " + dir.toLowerCase() + " shipment. Raise it on the " + dir + " Advice.";
  if(!e.cust) return "AWB owner is required";
  if(!e.t1) return (e.mode === "Export" ? "Acceptance time & date (RCS)" : "RCF time & date") + " is required";
  if(!e.t2) return (e.mode === "Export" ? "Departure time & date" : "Delivery time & date") + " is required";
  if(!e.billTo) return "Billing party is required";
  var first = new Date(e.t1).getTime(), last = new Date(e.t2).getTime();
  if(!Number.isFinite(first) || !Number.isFinite(last)) return "Enter valid cargo dates and times";
  if(last < first) return e.mode === "Export" ? "Departure cannot be before acceptance" : "Delivery cannot be before RCF";
  var inputProblem = app.adviceInputProblem(e.mode);
  if(inputProblem) return inputProblem;
  if(!Number.isFinite(e.wt) || e.wt <= 0) return "Gross weight must be a positive finite number";
  if(!Number.isInteger(e.pcs) || e.pcs <= 0) return "Pieces must be a positive whole number";
  if(!Number.isFinite(e.total) || e.total < 0) return "Charge total must be a nonnegative finite number";
  if(Object.keys(e.pay).some(function(k){ return !Number.isFinite(e.pay[k]) || e.pay[k] < 0; })) return "Payment amount must be a nonnegative finite number";
  if(e.items.some(function(item){ return ["rate", "qty", "min", "vat", "total", "charge"].some(function(k){ return !Number.isFinite(item[k]) || item[k] < 0; }); })) return "Charge values must be nonnegative finite numbers";
  return "";
};

app.saveAdvice = function saveAdvice(mode){
  var e = app.collectAdvice(mode), problem = app.adviceProblem(e);
  if(problem){ app.toast(problem,"err"); return; }
  if(!e.wt || !e.pcs){ app.toast("Weight and pieces are required","err"); return; }

  /* validate charge lines */
  if(e.items.length === 0){ app.toast("Add at least one charge line","err"); return; }

  /* the amounts typed are what the Invoice Register records, while the advice
     prints the full charges - so amounts that differ from the total need a reason */
  var payPrefix = mode==="export" ? "a" : "i";
  if(e.payMode === "Cash + Card" && !app.$(payPrefix+"_pay_cash").value.trim() && !app.$(payPrefix+"_pay_card").value.trim()){
    app.toast("Enter the cash and card amounts","err");
    return;
  }
  var payTotal = e.pay.cash + e.pay.card + e.pay.credit + e.pay.cass + e.pay.bank, payNote = "";
  if(Math.abs(payTotal - e.total) > 0.01){
    if(!e.payReason){
      app.toast(e.payMode+" AED "+app.money(payTotal)+" differs from the total AED "+app.money(e.total)+". Give the reason.","err");
      app.$(payPrefix+"_pay_reason").focus();
      return;
    }
    payNote = "  |  "+e.payMode+" AED "+app.money(payTotal)+" against charges AED "+app.money(e.total);
  }

  /* A failed durable write must leave both the ledger and draft untouched. */
  var previousEntries = app.DB.entries.slice();
  var previousSeq = Object.assign({}, app.DB.seq);
  /* assign ref if not set */
  if(!e.ref || e.ref === app.previewRef(mode)){
    app.DB.seq[mode] = (app.DB.seq[mode]||0) + 1;
    e.ref = app.refFor(app.DB.seq[mode]);
  }

  e.id = "INV_" + Date.now() + "_" + Math.floor(Math.random()*10000);
  e.staff = e.staff || app.DB.staff || app.CFG.staff[0];
  e.type = "invoice";

  app.DB.entries.push(e);
  if(app.save() === false){
    app.DB.entries = previousEntries;
    app.DB.seq = previousSeq;
    app.toast("Invoice was not saved. Your draft is still available; check storage and try again.", "err");
    return;
  }
  app.toast("Invoice saved: "+e.ref+"  |  "+e.cust+"  |  AED "+app.money(e.total)+payNote,"ok");

  /* refresh register + lying list (export auto-join) */
  if(typeof app.buildRegister === "function") app.buildRegister();
  if(typeof app.renderRegister === "function") app.renderRegister();
  if(typeof app.llSyncFromRegister === "function") app.llSyncFromRegister();
  if(typeof app.renderLying === "function") app.renderLying();
  if(typeof app.renderSecurity === "function") app.renderSecurity();
  if(typeof app.refreshChip === "function") app.refreshChip();

  /* reset form */
  var pg = app.$("p-"+(mode==="export"?"export":"import"));
  if(pg){
    pg.innerHTML = "";
    app.buildAdvice(mode);
  }
};
