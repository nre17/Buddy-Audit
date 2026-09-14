import { app } from '../core/runtime.js';

app.SH_KEY = "solitair_shipments_v1";


app.SH = { items: [] };

app.AWB_LOOKUP = {};





app.awbKey = function awbKey(v){ return String(v==null ? "" : v).replace(/\D/g, ""); };

app.shFind = function shFind(awb, unique){
  var k = app.awbKey(awb), hit = null;
  if(k.length < 8) return null;
  for(var i=0; i<app.SH.items.length; i++){
    var sk = app.SH.items[i].key;
    if(sk === k) hit = app.SH.items[i];
    else if(unique && sk.indexOf(k) === 0) return null;
  }
  return hit;
};

app.shDirection = function shDirection(x){
  if(x.dep && !x.rcf) return "Export";
  if(x.rcf && !x.dep) return "Import";
  if(x.org === "DWC" && x.dst && x.dst !== "DWC") return "Export";
  if(x.dst === "DWC" && x.org && x.org !== "DWC") return "Import";
  return "";
};

app.shMasterName = function shMasterName(name){
  var norm = function(v){ return String(v || "").toLowerCase().replace(/\s+/g, " ").trim(); };
  var k = norm(name);
  if(!k) return "";
  for(var i=0; i<app.CUSTOMERS.length; i++){ if(norm(app.CUSTOMERS[i].name) === k) return app.CUSTOMERS[i].name; }
  return String(name).trim();
};

app.shInMaster = function shInMaster(name){ return !!app.resolveCustomer(app.shMasterName(name)); };

app.shcKnown = function shcKnown(code){ var ts = app.shcTokens(code); return ts.length > 0 && ts.every(function(t){ return !!app.shcEntry(t); }); };

app.shWhen = function shWhen(v){
  var m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if(!m) return "";
  var mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m[2],10)-1];
  return parseInt(m[3],10) + " " + mon + " " + m[1] + ", " + m[4] + ":" + m[5];
};

app.parseDelimited = function parseDelimited(text, delim){
  var rows = [], row = [], cell = "", quoted = false, ch;
  text = String(text || "").replace(/\r\n?/g, "\n");
  for(var i=0; i<text.length; i++){
    ch = text.charAt(i);
    if(quoted){
      if(ch === '"'){ if(text.charAt(i+1) === '"'){ cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    }
    else if(ch === '"' && cell === "") quoted = true;
    else if(ch === delim){ row.push(cell); cell = ""; }
    else if(ch === "\n"){ row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if(cell !== "" || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(function(r){ return r.some(function(c){ return String(c).trim() !== ""; }); });
};

app.SH_COLUMNS = {
  awb:   ["awb", "awbno", "awbnumber", "mawb", "mawbno", "mawbnumber"],
  org:   ["origin", "org", "from"],
  dst:   ["destination", "dest", "dst", "to"],
  fltno: ["flightnumber", "flightno", "flight", "fltno"],
  dep:   ["departure*", "std", "etd"],
  rcf:   ["rcf*"],
  shc:   ["shccode", "shc"],
  nog:   ["natureofgoods", "nog", "commodity"],
  pcs:   ["ofpieces", "pieces", "pcs", "noofpieces", "numberofpieces"],
  wt:    ["grossweight*", "grosswt*", "gw*", "weight*", "wt", "wtkg*", "actualweight*", "kg", "kgs"],
  cust:  ["customer", "customername", "awbowner", "agent", "shipper"]
};

app.SH_NOT = { wt: /chargeable|volum|dimension/ };

app.shMapHeader = function shMapHeader(cells){
  var map = {};
  cells.forEach(function(c, idx){
    var h = String(c).toLowerCase().replace(/[^a-z0-9]/g, "");
    if(!h) return;
    Object.keys(app.SH_COLUMNS).some(function(f){
      if(map[f] !== undefined) return false;
      if(app.SH_NOT[f] && app.SH_NOT[f].test(h)) return false;
      var hit = app.SH_COLUMNS[f].some(function(a){
        return a.charAt(a.length-1) === "*" ? h.indexOf(a.slice(0, -1)) === 0 : h === a;
      });
      if(hit) map[f] = idx;
      return hit;
    });
  });
  return map;
};

app.shDateParts = function shDateParts(v){
  v = String(v == null ? "" : v).trim();
  if(!v) return null;
  var m, hh = 0, mi = 0;
  if(/^\d{5}(\.\d+)?$/.test(v)){
    var d = new Date(Math.round((parseFloat(v) - 25569) * 864e5));   /* 25569 = 1 Jan 1970 */
    return { y:d.getUTCFullYear(), a:d.getUTCMonth()+1, b:d.getUTCDate(), iso:true, h:d.getUTCHours(), mi:d.getUTCMinutes() };
  }
  var t = v.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/);
  if(t){
    hh = parseInt(t[1], 10); mi = parseInt(t[2], 10);
    var ap = t[3] ? t[3].toUpperCase() : "";
    if(ap === "PM" && hh < 12) hh += 12;
    if(ap === "AM" && hh === 12) hh = 0;
  }
  if((m = v.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)))
    return { y:parseInt(m[1],10), a:parseInt(m[2],10), b:parseInt(m[3],10), iso:true, h:hh, mi:mi };
  if((m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/)))
    return { y:(m[3].length === 2 ? 2000 : 0) + parseInt(m[3],10), a:parseInt(m[1],10), b:parseInt(m[2],10), iso:false, h:hh, mi:mi };
  return null;
};

app.shDateValue = function shDateValue(x, order){
  if(!x) return "";
  var mo = x.iso ? x.a : (order === "DMY" ? x.b : x.a);
  var da = x.iso ? x.b : (order === "DMY" ? x.a : x.b);
  if(x.h > 23 || x.mi > 59) return "";
  var d = new Date(x.y, mo-1, da);
  if(isNaN(d.getTime()) || d.getMonth() !== mo-1 || d.getDate() !== da) return "";
  return x.y + "-" + app.pad(mo) + "-" + app.pad(da) + "T" + app.pad(x.h) + ":" + app.pad(x.mi);
};

app.shLocaleDayFirst = function shLocaleDayFirst(){
  try{ return /^\D*31/.test(new Date(2026, 0, 31).toLocaleDateString()); }catch(e){ return true; }
};

app.shDateOrder = function shDateOrder(parts){
  var dayFirst = false, monthFirst = false, ambiguous = false;
  parts.forEach(function(x){
    if(!x || x.iso) return;
    ambiguous = true;
    if(x.a > 12) dayFirst = true;
    if(x.b > 12) monthFirst = true;
  });
  if(!ambiguous) return { order: app.shLocaleDayFirst() ? "DMY" : "MDY", sure: true };
  if(dayFirst && !monthFirst) return { order: "DMY", sure: true };
  if(monthFirst && !dayFirst) return { order: "MDY", sure: true };
  if(dayFirst && monthFirst) return { order: "DMY", sure: false, conflict: true };
  var span = function(order){
    var ts = parts.map(function(x){ var v = app.shDateValue(x, order); return v ? new Date(v).getTime() : NaN; })
                  .filter(function(n){ return !isNaN(n); });
    return ts.length ? Math.max.apply(null, ts) - Math.min.apply(null, ts) : 0;
  };
  var dmy = span("DMY"), mdy = span("MDY");
  if(dmy === mdy) return { order: app.shLocaleDayFirst() ? "DMY" : "MDY", sure: false };
  return { order: dmy < mdy ? "DMY" : "MDY", sure: false };
};

app.shParseManifest = function shParseManifest(text, orderOverride){
  text = String(text || "").replace(/\r\n?/g, "\n");
  /* Detect the header and delimiter together: a title above a CSV table has no
     delimiter and must not force the entire file to be interpreted as TSV. */
  var rows = [], hi = -1, map = null, bestScore = 0;
  ["\t", ",", ";"].forEach(function(delim){
    var candidate = app.parseDelimited(text, delim);
    for(var i=0; i<Math.min(candidate.length, 5); i++){
      var mp = app.shMapHeader(candidate[i]), score = Object.keys(mp).length;
      if(mp.awb !== undefined && score > bestScore){ rows = candidate; hi = i; map = mp; bestScore = score; }
    }
  });
  if(hi < 0) return { error: "No AWB column was found. Include the heading row when copying, with one column headed AWB." };

  var cell = function(r, f){ return map[f] === undefined ? "" : String(r[map[f]] == null ? "" : r[map[f]]).trim(); };
  var parts = [];
  var body = rows.slice(hi+1).map(function(r){
    var dp = app.shDateParts(cell(r, "dep")), rp = app.shDateParts(cell(r, "rcf"));
    if(dp) parts.push(dp);
    if(rp) parts.push(rp);
    return { r:r, dp:dp, rp:rp };
  });
  var detected = app.shDateOrder(parts), order = orderOverride || detected.order;

  var items = [], seen = {}, skipped = 0, dupes = 0;
  body.forEach(function(x, rowIndex){
    var r = x.r, awb = cell(r, "awb").toUpperCase(), key = app.awbKey(awb), warn = [], errors = [];
    if(key.length < 8){ skipped++; return; }
    var shc = cell(r, "shc").toUpperCase();
    if(shc && !app.shcKnown(shc)) warn.push("SHC " + shc + " is not a known code; it bills as special cargo");
    var dep = app.shDateValue(x.dp, order), rcf = app.shDateValue(x.rp, order);
    if(cell(r, "dep") && !dep) errors.push("departure time not readable");
    if(cell(r, "rcf") && !rcf) errors.push("RCF time not readable");
    var wt = cell(r, "wt"), pcs = cell(r, "pcs");
    function quantity(raw, label, integer){
      if(raw === ""){ warn.push("no " + label); return null; }
      var n = app.strictNumber(raw);
      if(n === null || n <= 0 || (integer && !Number.isInteger(n))){
        errors.push(label + " must be a positive " + (integer ? "whole number" : "number") + "; correct the source value");
        return null;
      }
      return n;
    }
    var item = {
      awb: awb, key: key,
      org: cell(r, "org").toUpperCase(), dst: cell(r, "dst").toUpperCase(),
      fltno: cell(r, "fltno").toUpperCase(),
      dep: dep, rcf: rcf, shc: shc, nog: cell(r, "nog"),
      pcs: quantity(pcs, "pieces", true),
      wt: quantity(wt, "gross weight", false),
      cust: cell(r, "cust"),
      warn: warn, errors: errors, sourceRow: hi + rowIndex + 2, source: "manifest"
    };
    if(!dep && !rcf) warn.push("no departure or RCF time");
    if(!item.cust) warn.push("no AWB owner");
    if(seen[key] !== undefined){ items[seen[key]] = item; dupes++; }
    else { seen[key] = items.length; items.push(item); }
  });
  return { items:items, skipped:skipped, dupes:dupes, order:order, detected:detected,
           invalid: items.filter(function(x){ return x.errors.length; }).length,
           weightColumn: map.wt !== undefined,
           dated: parts.some(function(x){ return !x.iso; }) };
};

app.shImport = function shImport(items){
  if(!Array.isArray(items) || items.some(function(x){
    return !x || (x.errors && x.errors.length) || !x.key || x.key !== app.awbKey(x.awb)
      || (x.wt != null && (!Number.isFinite(x.wt) || x.wt <= 0))
      || (x.pcs != null && (!Number.isInteger(x.pcs) || x.pcs <= 0));
  })){
    app.toast("Shipments were not imported. Correct the invalid rows and preview again.", "err");
    return null;
  }
  var now = Date.now(), byKey = {}, order = [];
  var added = 0, updated = 0, dropped = 0;
  app.SH.items.forEach(function(x){
    byKey[x.key] = x; order.push(x.key);
  });
  items.forEach(function(x){
    if(byKey[x.key]) updated++; else { added++; order.push(x.key); }
    byKey[x.key] = { awb:x.awb, key:x.key, org:x.org, dst:x.dst, fltno:x.fltno, dep:x.dep, rcf:x.rcf,
                     shc:x.shc, nog:x.nog, pcs:x.pcs, wt:x.wt, cust:x.cust, importedAt:now,
                     warn:x.warn || [], sourceRow:x.sourceRow || null, source:x.source || "manifest" };
  });
  var previous = app.SH;
  app.SH = { items: order.map(function(k){ return byKey[k]; }) };
  if(!app.shSave()){ app.SH = previous; return null; }
  return { added:added, updated:updated, dropped:dropped };
};

app.shDemoItems = function shDemoItems(){
  var now = Date.now();
  var at = function(hours){ var d = new Date(now + hours*36e5); return app.ymd(d) + "T" + app.pad(d.getHours()) + ":" + app.pad(d.getMinutes()); };
  var owner = function(i){ return app.CUSTOMERS.length ? app.CUSTOMERS[(i*181 + 7) % app.CUSTOMERS.length].name : ""; };
  /* awb, origin, destination, flight, departs in (h), RCF (h ago), SHC, nature of goods, pieces, weight */
  return [
    ["780-30901001", "DWC", "ISU", "ZZ 901",  3, null, "GEN", "Auto Spare Parts",              24,  312.5],
    ["780-30901002", "DWC", "EVN", "ZZ 902",  6, null, "DGR", "Lithium Ion Batteries UN3480", 140, 1480],
    ["780-30901003", "KWI", "DWC", "ZZ 903", null, 2,  "PER", "Fresh Fruits and Vegetables",  210, 2640],
    ["780-30901004", "DWC", "BAH", "ZZ 904", 10, null, "PEM", "Frozen Meat",                  230, 3120],
    ["780-30901005", "DWC", "BEY", "ZZ 905", 14, null, "AVI", "Live Sheep",                   760, 5890],
    ["780-30901006", "BEY", "DWC", "ZZ 906", null, 60, "GEN", "Garments and Textiles",        450, 1995],
    ["780-30901007", "DWC", "NBO", "ZZ 907", 21, null, "VAL", "Gold Bars",                    220, 88.4],
    ["780-30901008", "NBO", "DWC", "ZZ 908", null, 9,  "VUN", "Mobile Phones",                610, 1210],
    ["780-30901009", "DWC", "DAM", "ZZ 909", 26, null, "GEN", "Household Goods",               80, 410],
    ["780-30901010", "DWC", "MCT", "ZZ 910", 31, null, "GEN", "Machinery Parts",               45, 940]
  ].map(function(r, i){
    return { awb:r[0], key:app.awbKey(r[0]), org:r[1], dst:r[2], fltno:r[3],
             dep: r[4] == null ? "" : at(r[4]), rcf: r[5] == null ? "" : at(-r[5]),
             shc:r[6], nog:r[7], pcs:r[8], wt:r[9], cust:owner(i), warn:[], source:"synthetic-demo" };
  });
};

app.shCountText = function shCountText(){
  var n = app.SH.items.length;
  return n ? n + " shipment" + (n === 1 ? "" : "s") + " in the Shipment Database. Type an AWB, or pick one from the suggestions, to fill in its details."
           : "The Shipment Database is empty. Paste today's manifest there, or enter the details by hand.";
};

app.shStatus = function shStatus(p, cls, html){
  var el = app.$(p+"_awbstatus");
  if(!el) return;
  el.className = "awbstatus" + (cls ? " " + cls : "");
  el.innerHTML = html;
};

app.shRefreshForms = function shRefreshForms(){
  ["export", "import"].forEach(function(m){ if(app.AWB_LOOKUP[m]) app.AWB_LOOKUP[m](true, true); });
};

app.AWB_SUGGEST_MIN = 3;
app.AWB_SUGGEST_MAX = 8;

app.wireAwbLookup = function wireAwbLookup(mode, recalc){
  var isExp = mode === "export", p = isExp ? "a" : "i", here = isExp ? "Export" : "Import";
  var TIME = isExp ? "t2" : "t1";   /* departure on an export, RCF on an import */
  var awbEl = app.$(p+"_mawb"), filled = null, wrongKey = null;
  var filledValues = {}, sourceValues = "";
  var sourceFields = ["cust", "org", "dst", "fltno", TIME, "shc", "nog", "pcs", "wt"];
  if(!awbEl) return;
  var sugEl = app.$(p+"_awbsuggest"), sugKeys = [], sugIndex = -1;

  function set(id, v){ var el = app.$(p+"_"+id); if(el) el.value = (v == null ? "" : v); }
  /* The SHC list holds the single listed codes. A manifest code outside it -
     several codes together, or one not in the list - is added for this shipment,
     so it bills by its own class instead of silently as the form's GEN. */
  function setShc(v){
    var el = app.$(p+"_shc"), has = false;
    if(!el) return;
    for(var i = 0; i < el.options.length; i++) if(el.options[i].value === v) has = true;
    if(!has){
      var o = document.createElement("option");
      o.value = v; o.textContent = v; o.setAttribute("data-manifest", "1");
      el.appendChild(o);
    }
    el.value = v;
  }
  function dropManifestShc(){
    var el = app.$(p+"_shc");
    if(el) Array.prototype.slice.call(el.querySelectorAll("option[data-manifest]")).forEach(function(o){ el.removeChild(o); });
  }
  function markAwb(blocked){
    var f = awbEl.closest ? awbEl.closest(".f") : null;
    if(f) f.classList[blocked ? "add" : "remove"]("bad");
    /* the field carries inline styles (audit A-15), which beat the .f.bad rule,
       so the red has to be set inline as well */
    awbEl.style.borderColor = blocked ? "var(--err)" : "var(--line)";
    awbEl.style.background = blocked ? "#fef2f2" : "#fff";
  }
  function clearFilled(){
    set("cust", ""); set("org", isExp ? "DWC" : ""); set("dst", isExp ? "" : "DWC");
    set("fltno", ""); set(TIME, app.nowLocalDT()); dropManifestShc(); set("shc", "GEN"); set("nog", "");
    set("pcs", ""); set("wt", "");
    filled = null; filledValues = {}; sourceValues = "";
  }
  function valuesOf(x){
    var values = {cust:app.shMasterName(x.cust), org:x.org || (isExp ? "DWC" : ""), dst:x.dst || (isExp ? "" : "DWC"),
      fltno:x.fltno || "", shc:x.shc || "GEN", nog:x.nog || "", pcs:x.pcs == null ? "" : String(x.pcs), wt:x.wt == null ? "" : String(x.wt)};
    values[TIME] = (isExp ? x.dep : x.rcf) || "";
    return values;
  }
  function refreshFilled(x){
    var values = valuesOf(x), signature = JSON.stringify(values), retained = [];
    if(signature === sourceValues) return;
    sourceFields.forEach(function(field){
      var el = app.$(p+"_"+field);
      if(String(el.value) === filledValues[field]){
        if(field === "shc") setShc(values[field]); else set(field, values[field]);
      } else if(String(el.value) !== String(values[field])) retained.push(field);
      filledValues[field] = String(values[field]);
    });
    sourceValues = signature;
    recalc();
    app.shStatus(p, "warn", "Shipment source updated. Unedited fields and charges refreshed. "
      + (retained.length ? "Your manual edits were kept; review this advice before saving." : "Review the updated advice before saving."));
  }
  function fill(x){
    if(filled) clearFilled();
    var when = isExp ? x.dep : x.rcf;
    set("cust", app.shMasterName(x.cust));
    if(x.org) set("org", x.org);
    if(x.dst) set("dst", x.dst);
    set("fltno", x.fltno);
    /* a departure or RCF time missing from the manifest is left blank to be
       entered - never left at the form's default of now, which storage charges
       would then be calculated from */
    set(TIME, when || "");
    if(x.shc) setShc(x.shc);
    set("nog", x.nog); set("pcs", x.pcs); set("wt", x.wt);
    filled = x.key;
    sourceFields.forEach(function(field){ filledValues[field] = String(app.$(p+"_"+field).value); });
    sourceValues = JSON.stringify(valuesOf(x));
    recalc();

    var notes = [];
    if(x.cust && !app.shInMaster(x.cust)) notes.push("the AWB owner is not in the customer master");
    if(x.wt == null) notes.push("gross weight is not on the manifest, enter it below");
    if(x.shc && !app.shcKnown(x.shc)) notes.push("SHC " + app.esc(x.shc) + " is not a known code, so it bills as special cargo. Choose another below if that is wrong");
    if(!when) notes.push((isExp ? "departure" : "RCF") + " time is not on the manifest, enter it below");
    app.shStatus(p, notes.length ? "warn" : "ok",
      "Shipment found" + (x.fltno ? " &middot; " + app.esc(x.fltno) : "")
      + (when ? " &middot; " + (isExp ? "departs " : "RCF ") + app.esc(app.shWhen(when)) : "")
      + (notes.length ? ". Note: " + notes.join("; ") + "." : "."));
  }
  function wrongWay(x, dir){
    wrongKey = x.key;
    markAwb(true);
    app.shStatus(p, "err", "<b>Blocked.</b> AWB " + app.esc(x.awb) + " is an " + dir.toLowerCase() + " shipment, so it cannot be invoiced on the " + here + " Advice."
      + '<button class="btn sm" type="button" id="' + p + '_awbswitch">Open in ' + dir + ' Advice</button>');
    app.$(p+"_awbswitch").onclick = function(){
      var other = dir === "Export" ? "export" : "import", op = other === "export" ? "a" : "i";
      var tabBtn = document.querySelector('.tabs button[data-p="' + other + '"]');
      if(tabBtn) tabBtn.click();
      awbEl.value = "";
      lookup(true);
      app.$(op+"_mawb").value = x.awb;
      if(app.AWB_LOOKUP[other]) app.AWB_LOOKUP[other](true);
      app.$(op+"_mawb").focus();
    };
  }
  function lookup(committing, sourceChanged){
    var key = app.awbKey(awbEl.value);
    if(filled && key === filled && !sourceChanged) return;
    var x = app.shFind(awbEl.value, !committing);
    if(x){
      var dir = app.shDirection(x);
      if(dir && dir !== here){
        /* a different shipment matched, so this form's shipment details go. The
           notice is not redrawn when the AWB field then loses focus: redrawing it
           at that moment would swallow a click on its own button. */
        if(filled){ clearFilled(); recalc(); }
        if(wrongKey !== x.key) wrongWay(x, dir);
        return;
      }
      wrongKey = null;
      markAwb(false);
      if(filled && key === filled){ refreshFilled(x); return; }
      fill(x);
      return;
    }
    if(!committing){
      /* typing away from a blocked AWB lifts the block straight away */
      if(wrongKey && key !== wrongKey){ wrongKey = null; markAwb(false); app.shStatus(p, "", app.shCountText()); }
      return;
    }
    wrongKey = null;
    markAwb(false);
    if(filled && key === filled && sourceChanged){
      app.shStatus(p, "warn", "This shipment was removed from the loaded manifest. Your draft was kept; verify its details before saving.");
      return;
    }
    if(filled){
      clearFilled(); recalc();
      app.shStatus(p, "warn", "The AWB changed, so the details filled in for the previous shipment were cleared.");
      return;
    }
    app.shStatus(p, "", !key ? app.shCountText()
      : app.SH.items.length ? "This AWB is not in the Shipment Database. Enter the details below."
      : "The Shipment Database is empty. Enter the details below, or paste today's manifest there.");
  }

  function closeSuggest(){
    sugEl.style.display = "none";
    sugEl.innerHTML = "";
    sugKeys = [];
    sugIndex = -1;
  }
  function showSuggest(){
    var k = app.awbKey(awbEl.value), starts = [], within = [];
    if(k.length >= app.AWB_SUGGEST_MIN){
      app.SH.items.forEach(function(x){
        var at = x.key.indexOf(k);
        if(at === 0) (x.key === k ? starts.unshift(x) : starts.push(x));
        else if(at > 0) within.push(x);
      });
    }
    var all = starts.concat(within);
    /* nothing to offer, or the one match is the AWB already typed in full */
    if(!all.length || (all.length === 1 && all[0].key === k)){ closeSuggest(); return; }
    var shown = all.slice(0, app.AWB_SUGGEST_MAX);
    sugKeys = shown.map(function(x){ return x.key; });
    sugIndex = -1;
    sugEl.innerHTML = shown.map(function(x, i){
      var dir = app.shDirection(x), when = dir === "Import" ? x.rcf : (x.dep || x.rcf);
      var meta = [app.shMasterName(x.cust), [x.org, x.dst].filter(Boolean).join(" / "), x.fltno, app.shWhen(when)].filter(Boolean).join("  ·  ");
      return '<button type="button" data-i="' + i + '"><span class="awb">' + app.esc(x.awb) + '</span>'
        + '<span class="dir">' + app.esc(dir) + '</span><span class="meta">' + app.esc(meta) + '</span></button>';
    }).join("")
      + (all.length > shown.length ? '<div class="more">' + (all.length - shown.length) + ' more. Keep typing to narrow the list.</div>' : '');
    sugEl.style.display = "block";
  }
  function highlight(){
    var buttons = sugEl.querySelectorAll("button");
    for(var i=0; i<buttons.length; i++){
      buttons[i].className = i === sugIndex ? "on" : "";
      if(i === sugIndex && buttons[i].scrollIntoView) buttons[i].scrollIntoView({ block: "nearest" });
    }
  }
  function pick(i){
    var key = sugKeys[i], x = app.SH.items.filter(function(item){ return item.key === key; })[0];
    closeSuggest();
    if(!x) return;
    awbEl.value = x.awb;
    lookup(true);
  }

  awbEl.addEventListener("input", function(){ lookup(false); showSuggest(); });
  awbEl.addEventListener("focus", showSuggest);
  awbEl.addEventListener("blur", closeSuggest);
  awbEl.addEventListener("change", function(){ lookup(true); });
  awbEl.addEventListener("keydown", function(ev){
    var open = sugKeys.length > 0;
    if(ev.key === "ArrowDown" || ev.key === "ArrowUp"){
      if(!open){ showSuggest(); open = sugKeys.length > 0; }
      if(!open) return;
      ev.preventDefault();
      sugIndex = (sugIndex + (ev.key === "ArrowDown" ? 1 : -1) + sugKeys.length) % sugKeys.length;
      highlight();
    } else if(ev.key === "Escape" && open){
      ev.preventDefault();
      ev.stopPropagation();
      closeSuggest();
    } else if(ev.key === "Enter"){
      ev.preventDefault();
      if(open && sugIndex >= 0){ pick(sugIndex); return; }
      closeSuggest();
      lookup(true);
    }
  });
  /* mousedown, not click, and no default: the field keeps focus, so its blur
     cannot close the list before the choice registers */
  sugEl.addEventListener("mousedown", function(ev){
    ev.preventDefault();
    var b = ev.target.closest ? ev.target.closest("button[data-i]") : null;
    if(b) pick(parseInt(b.getAttribute("data-i"), 10));
  });
  app.AWB_LOOKUP[mode] = lookup;
  app.shStatus(p, "", app.shCountText());
};

app.buildShipments = function buildShipments(){
  var pg = app.$("p-shipments");
  if(!pg) return;
  pg.innerHTML =
      '<div class="panel"><h3>Shipment Database</h3><div class="body">'
    + '<p class="hint" style="margin:0 0 8px">In Excel, select the manifest <b>including its heading row</b>, copy, and paste it below, or choose a CSV file. '
    + 'Columns are matched by their headings, in any order. The Export and Import Advice tabs look each AWB up here. '
    + 'Shipments are saved with this workspace and included in its backups. Importing a new manifest retains older records until you explicitly clear them.</p>'
    + '<div class="f"><textarea id="sh_paste" rows="6" placeholder="Paste from Excel here"></textarea></div>'
    + '<div class="btnbar" style="margin-top:8px;align-items:center">'
    +   '<button class="btn pri" id="sh_preview" type="button">Preview</button>'
    +   '<button class="btn" id="sh_filebtn" type="button">Choose CSV File</button>'
    +   '<input type="file" id="sh_file" accept=".csv,.tsv,.txt" style="display:none">'
    +   '<button class="btn" id="sh_demo" type="button">Load Sample Shipments</button>'
    +   '<button class="btn dgr" id="sh_clear" type="button" style="margin-left:auto">Clear Loaded Shipments</button>'
    + '</div>'
    + '<div id="sh_result" style="margin-top:10px"></div>'
    + '</div></div>'
    + '<div class="panel" style="margin-top:12px"><h3 id="sh_loadedtitle">Loaded Shipments</h3><div class="body">'
    + '<div class="f" style="max-width:380px;margin-bottom:9px"><input id="sh_filter" placeholder="Search AWB, owner, flight, route or goods"></div>'
    + '<div id="sh_loaded"></div>'
    + '</div></div>';

  var HEAD = '<th>AWB</th><th>Dir.</th><th style="text-align:left">AWB Owner</th><th>Route</th><th>Flight</th>'
           + '<th>Departure / RCF</th><th>SHC</th><th style="text-align:left">Nature of Goods</th><th>Pcs</th><th>Weight</th>';
  var plural = function(n, word){ return n + " " + word + (n === 1 ? "" : "s"); };

  function cells(x){
    var dir = app.shDirection(x);
    return '<td>' + app.esc(x.awb) + '</td><td>' + app.esc(dir || "?") + '</td><td style="text-align:left">' + app.esc(app.shMasterName(x.cust)) + '</td>'
      + '<td>' + app.esc([x.org, x.dst].filter(Boolean).join(" / ")) + '</td><td>' + app.esc(x.fltno) + '</td>'
      + '<td>' + app.esc(app.shWhen(dir === "Import" ? x.rcf : (x.dep || x.rcf))) + '</td><td>' + app.esc(x.shc) + '</td>'
      + '<td style="text-align:left">' + app.esc(x.nog) + '</td>'
      + '<td class="n">' + (x.pcs == null ? "" : app.esc(x.pcs)) + '</td><td class="n">' + (x.wt == null ? "" : app.esc(app.money(x.wt))) + '</td>';
  }

  function renderLoaded(){
    var q = app.$("sh_filter").value.toLowerCase().trim(), out = app.$("sh_loaded");
    app.$("sh_loadedtitle").textContent = "Loaded Shipments (" + app.SH.items.length + ")";
    if(!app.SH.items.length){ out.innerHTML = '<p class="hint" style="margin:0">Nothing is loaded yet. Paste the manifest above.</p>'; return; }
    var shown = app.SH.items.filter(function(x){
      return !q || [x.awb, app.shMasterName(x.cust), x.fltno, x.org, x.dst, x.nog, x.shc].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    if(!shown.length){ out.innerHTML = '<p class="hint" style="margin:0">No loaded shipment matches that search.</p>'; return; }
    out.innerHTML = '<div class="scrolltable" style="max-height:60vh"><table class="chg" style="width:100%"><thead><tr>' + HEAD
      + '<th>Loaded</th></tr></thead><tbody>'
      + shown.map(function(x){
          return '<tr>' + cells(x) + '<td>' + (x.importedAt ? app.esc(app.fmtDT(new Date(x.importedAt).toISOString())) : "") + '</td></tr>';
        }).join("")
      + '</tbody></table></div>';
  }

  function afterChange(message){
    renderLoaded();
    app.shRefreshForms();
    app.toast(message, "ok");
  }

  function render(orderOverride){
    var out = app.$("sh_result"), text = app.$("sh_paste").value;
    if(!text.trim()){ out.innerHTML = '<p class="hint">Paste the manifest first.</p>'; return; }
    var r = app.shParseManifest(text, orderOverride);
    if(r.error){ out.innerHTML = '<div class="awbstatus warn">' + app.esc(r.error) + '</div>'; return; }
    if(!r.items.length){ out.innerHTML = '<div class="awbstatus warn">No rows with an AWB were found under the headings.</div>'; return; }

    var exp = 0, imp = 0, noted = 0;
    var rows = r.items.map(function(x){
      var dir = app.shDirection(x), notes = x.errors.concat(x.warn);
      if(dir === "Export") exp++; else if(dir === "Import") imp++;
      if(x.cust && !app.shInMaster(x.cust)) notes.push("owner not in customer master");
      if(!dir) notes.push("direction unclear");
      if(notes.length) noted++;
      return '<tr>' + cells(x) + '<td style="text-align:left;color:var(--warn)">' + app.esc(notes.join("; ")) + '</td></tr>';
    }).join("");

    var h = '<div class="awbstatus ' + (noted || r.detected.conflict ? "warn" : "ok") + '" style="margin:0 0 6px">'
      + plural(r.items.length, "shipment") + (r.invalid ? " in preview: " : " ready to import: ") + exp + " export, " + imp + " import"
      + (r.invalid ? ". " + r.invalid + " invalid row(s); correct the source and preview again" : "")
      + (r.skipped ? ". " + plural(r.skipped, "row") + " without an AWB skipped" : "")
      + (r.dupes ? ". " + plural(r.dupes, "repeated AWB") + ", the last row kept" : "")
      + (noted ? ". " + noted + " with notes in the last column" : "") + ".</div>";
    var weightless = r.items.filter(function(x){ return x.wt == null; }).length;
    if(!r.weightColumn || weightless === r.items.length){
      h += '<div class="awbstatus warn" style="margin:0 0 6px"><b>'
        + (r.weightColumn ? "None of these shipments has a gross weight on the sheet." : "No gross weight column was found in this sheet.")
        + '</b> Gross weight will need entering on each advice'
        + (r.weightColumn ? "." : ". A column headed Gross Weight, Gross Wt, GW or Weight is read automatically.") + '</div>';
    }
    if(r.dated){
      h += '<div class="btnbar" style="align-items:center;margin-bottom:6px">'
        + '<label class="hint" for="sh_order">Dates in this sheet are written</label>'
        + '<select id="sh_order" style="border:1px solid var(--line);border-radius:5px;padding:4px 8px;font-size:12px;background:#fff">'
        + '<option value="DMY"' + (r.order === "DMY" ? " selected" : "") + '>day / month / year</option>'
        + '<option value="MDY"' + (r.order === "MDY" ? " selected" : "") + '>month / day / year</option></select>'
        + '<span class="hint">' + (orderOverride ? "Set by you."
            : r.detected.conflict ? '<b style="color:var(--warn)">The sheet writes dates both ways. Check every time below.</b>'
            : r.detected.sure ? "Read from the sheet."
            : '<b style="color:var(--warn)">The sheet does not make this certain. Check the times below before importing.</b>') + '</span></div>';
    }
    h += '<div class="scrolltable"><table class="chg" style="width:100%"><thead><tr>' + HEAD
      + '<th style="text-align:left">Notes</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="btnbar" style="margin-top:8px;justify-content:flex-end">'
      + '<button class="btn pri" id="sh_import" type="button"' + (r.invalid ? ' disabled' : '') + '>Import ' + plural(r.items.length, "Shipment") + '</button></div>';
    out.innerHTML = h;

    var orderSel = app.$("sh_order");
    if(orderSel) orderSel.onchange = function(){ render(orderSel.value); };
    app.$("sh_import").onclick = function(){
      var res = app.shImport(r.items);
      if(!res) return;
      app.$("sh_paste").value = "";
      out.innerHTML = "";
      afterChange("Imported " + plural(r.items.length, "shipment") + " (" + res.added + " new, " + res.updated + " updated)"
        );
    };
  }

  app.$("sh_preview").onclick = function(){ render(); };
  app.$("sh_paste").addEventListener("paste", function(){ setTimeout(function(){ render(); }, 0); });
  app.$("sh_filebtn").onclick = function(){ app.$("sh_file").click(); };
  app.$("sh_file").onchange = function(){
    var f = this.files[0];
    if(!f) return;
    var rd = new FileReader();
    rd.onload = function(){ app.$("sh_paste").value = String(rd.result || ""); render(); };
    rd.onerror = function(){ app.toast("The shipment file could not be read. Choose it again.", "err"); };
    rd.readAsText(f);
    this.value = "";
  };
  app.$("sh_demo").onclick = function(){
    var items = app.shDemoItems(), res = app.shImport(items);
    if(!res) return;
    afterChange("Loaded " + items.length + " sample shipments. Try AWB " + items[0].awb + " on the Export Advice.");
  };
  app.$("sh_clear").onclick = function(){
    if(!app.SH.items.length){ app.toast("No shipments are loaded"); return; }
    if(!confirm("Remove all " + app.SH.items.length + " loaded shipments from this workspace? Saved advices are not affected. A workspace backup preserves the records.")) return;
    var previous = app.SH;
    app.SH = { items: [] };
    if(!app.shSave()){ app.SH = previous; return; }
    afterChange("Loaded shipments cleared");
  };
  app.$("sh_filter").addEventListener("input", renderLoaded);
  renderLoaded();
};
