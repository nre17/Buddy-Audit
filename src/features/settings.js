import { app } from '../core/runtime.js';
import { migrateSnapshot } from '../core/snapshot.js';

app.shcReference = function shcReference(){
  var h = '<p class="hint" style="margin-top:0">The SHC code on the advice sets the billing class and the free storage window. '
     + app.shcCodesOf("general")+' bill as general cargo, '+app.CFG.freeHours.general+' hrs free. '
     + 'Perishables ('+app.shcCodesOf("perishable")+') bill as perishable cargo, '+app.CFG.freeHours.perishable+' hrs free. '
     + 'Every other code, including one not in this list, bills as special cargo, '+app.CFG.freeHours.special+' hrs free. '
     + 'Where a shipment carries several codes, any perishable code makes it perishable, and any code other than '+app.shcCodesOf("general")+' makes it special.</p>'
     + '<table class="reg"><thead><tr><th>Code</th><th>Description</th><th>Bills As</th><th class="r">Free Storage</th></tr></thead><tbody>';
  app.CFG.shcCodes.forEach(function(s){
    var cls = s.k==="general" ? "General Cargo" : (s.k==="perishable" ? "Perishable" : "Special Cargo");
    var fr  = app.CFG.freeHours[s.k] + " hrs";
    h += '<tr><td><b>'+s.c+'</b></td><td>'+app.esc(s.d)+'</td><td>'+cls+'</td><td class="r">'
       + (s.k==="perishable" ? '<b style="color:var(--err)">'+fr+'</b>' : fr) + '</td></tr>';
  });
  return h + '</tbody></table>';
};

app.buildAdmin = function buildAdmin(){
  var h = '<div class="grid" style="grid-template-columns:1fr">';

  h += '<div class="panel"><h3>Tariff - Export (CGS-GND-F037)</h3><div class="body">'
     + app.rateTable(app.EXPORT_LINES,"ex") + '</div></div>';
  h += '<div class="panel"><h3>Tariff - Import (CGS-GND-F038)</h3><div class="body">'
     + app.rateTable(app.IMPORT_LINES,"im") + '</div></div>';

  h += '<div class="panel"><h3>Storage Free-Time Rules</h3><div class="body"><div class="fgrid">'
     + app.fld("General &amp; Special cargo - free hours", '<input id="fh_gen" type="number" step="1" value="'+app.CFG.freeHours.general+'">')
     + app.fld("Perishable cargo - free hours", '<input id="fh_per" type="number" step="1" value="'+app.CFG.freeHours.perishable+'">')
     + app.fld("", '<button class="btn pri" id="saveFH" style="margin-top:16px">Save Rules</button>')
     + '</div><p class="hint">Export: measured from Acceptance (RCS) to Departure. Import: measured from RCF to Delivery. Any part of a 24-hour period past the free window counts as one chargeable day.</p></div></div>';

  h += '<div class="panel"><h3>Special Handling Codes &mdash; Reference</h3><div class="body" id="shcref">'+app.shcReference()+'</div></div>';

  h += '<div class="panel"><h3>Company Logo</h3><div class="body">'
     + '<div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">'
     + '<div style="border:1px solid var(--line);border-radius:5px;padding:12px;background:#fff;min-width:220px;text-align:center">'
     +   '<div class="hint" style="margin-bottom:6px">Current logo</div>'
     +   '<img src="'+app.esc(app.safeLogoSource(app.DB.logo))+'" style="max-height:60px;max-width:210px">'
     +   '<div class="hint" style="margin-top:6px">'+(app.DB.logo?'Custom logo':'Built-in SolitAir mark')+'</div>'
     + '</div>'
     + '<div style="flex:1;min-width:280px">'
     +   '<input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp" style="display:none">'
     +   '<div class="btnbar"><button class="btn pri" id="btnLogo">Upload Logo</button>'
     +   (app.DB.logo ? '<button class="btn dgr" id="btnLogoRm">Remove Logo</button>' : '')
     +   '</div>'
     +   '<p class="hint">PNG with a transparent background works best. The image is resized to 400px wide and stored with your data, so it appears in the header and on every printed copy of the export and import advice. Brand colours in use: '
     +   '<span style="display:inline-block;width:11px;height:11px;background:#1042FF;border-radius:2px;vertical-align:-1px"></span> #1042FF blue and '
     +   '<span style="display:inline-block;width:11px;height:11px;background:#00FF57;border-radius:2px;vertical-align:-1px"></span> #00FF57 green.</p>'
     + '</div></div></div></div>';

  h += '<div class="panel"><h3>Company &amp; Bank Details</h3><div class="body">'
     + '<p class="hint" style="margin-top:0">These are printed on every advice and saved in this workspace. The initial bank details are fictional examples. Replace them with verified site details before operational use.</p>'
     + '<div class="fgrid">'
     + app.fld("Company name",  '<input id="co_name" value="'+app.esc(app.CFG.company.name)+'">')
     + app.fld("Company address", '<input id="co_addr" value="'+app.esc(app.CFG.company.addr)+'">')
     + app.fld("Contact",       '<input id="co_contact" value="'+app.esc(app.CFG.company.contact)+'">')
     + app.fld("Company TRN",   '<input id="co_trn" value="'+app.esc(app.CFG.company.trn)+'">')
     + app.fld("Bank account name (both accounts)", '<input id="bk_name" value="'+app.esc(app.CFG.bank.name)+'">') + app.fld("", "")
     + app.BANK_FIELDS.map(function(f){
         return app.fld("AED "+f[1], '<input id="bk_aed_'+f[0]+'" value="'+app.esc(app.CFG.bank.aed[f[0]]||"")+'">')
              + app.fld("USD "+f[1], '<input id="bk_usd_'+f[0]+'" value="'+app.esc(app.CFG.bank.usd[f[0]]||"")+'">');
       }).join("")
     + app.fld("", '<button class="btn pri" id="saveSite">Save Details</button>')
     + '</div></div></div>';

  h += '<div class="panel"><h3>Counter Staff</h3><div class="body">'
     + '<div class="fgrid"><div class="f span2"><label>Staff names (comma separated)</label>'
     + '<input id="staffList" value="'+app.esc(app.CFG.staff.join(", "))+'"></div>'
     + '<div class="f"><label>&nbsp;</label><button class="btn pri" id="saveStaff">Save</button></div></div></div></div>';

  h += '<div class="panel"><h3>Data - Backup, Restore &amp; Reset</h3><div class="body">'
     + '<div class="btnbar">'
     + '<button class="btn pri" id="btnBackup">Download Backup (JSON)</button>'
     + '<input type="file" id="fileRestore" accept=".json" style="display:none">'
     + '<button class="btn" id="btnRestore">Restore from Backup</button>'
     + '<button class="btn" id="btnSeed">Load Sample Data</button>'
     + '<button class="btn dgr" id="btnWipe">Erase All Data</button>'
     + '</div>'
     + '<p class="hint" style="margin-bottom:0">Workspace backups include bookings, invoices, manifests, warehouse history, reception records and settings. The status bar confirms disk saves; keep separate backup copies for recovery from a device failure. Ledger records held: <b id="dbcount">0</b>. Application version <b>'+app.esc(app.APP_VERSION)+'</b>.</p>'
     + '</div></div>';

  h += '</div>';
  app.$("#p-admin").innerHTML = h;

  app.$("#saveFH").onclick = function(){
    /* an empty or unreadable box keeps the standard hours; 0 is a valid rule */
    var hours = function(id, standard){ var v = app.$(id).value.trim(); return v === "" || isNaN(+v) || +v < 0 ? standard : +v; };
    app.CFG.freeHours.general = hours("#fh_gen", 48);
    app.CFG.freeHours.special = app.CFG.freeHours.general;
    app.CFG.freeHours.perishable = hours("#fh_per", 8);
    app.DB.freeHours = {general:app.CFG.freeHours.general, perishable:app.CFG.freeHours.perishable};
    app.$("#shcref").innerHTML = app.shcReference();
    if(!app.save()) return false;
    app.toast("Storage rules saved","ok");
  };
  app.$("#btnLogo").onclick = function(){ app.$("#logoFile").click(); };
  app.$("#logoFile").onchange = function(){
    var f=this.files[0]; if(!f) return;
    if(!['image/png','image/jpeg','image/webp'].includes(f.type) || f.size > 5*1024*1024){app.toast('Choose a PNG, JPEG or WebP image smaller than 5 MB','err');return;}
    var rd=new FileReader();
    rd.onload=function(){
      var img=new Image();
      img.onload=function(){
        var maxW=400, sc=Math.min(1, maxW/img.width);
        var cv=document.createElement("canvas");
        cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
        cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
        try{
          app.DB.logo = cv.toDataURL("image/png");
          if(!app.save()) return false;
          app.applyLogo(); app.buildAdmin(); app.toast("Logo saved","ok");
        }catch(e){ app.toast("Could not process that image","err"); }
      };
      img.onerror=function(){ app.toast("That file is not a readable image","err"); };
      img.src=rd.result;
    };
    rd.readAsDataURL(f); this.value="";
  };
  var rm=app.$("#btnLogoRm");
  if(rm) rm.onclick = function(){
    app.modal("Remove custom logo?","<p>The header and the advices will fall back to the built-in SolitAir mark.</p>",
      [{label:"Cancel"},{label:"Remove", cls:"dgr", fn:function(){
        app.DB.logo=null; if(!app.save()) return false;
        app.applyLogo(); app.buildAdmin(); app.toast("Logo removed");
      }}]);
  };
  app.$("#saveSite").onclick = function(){
    app.DB.company = {
      name:    app.$("#co_name").value.trim(),
      addr:    app.$("#co_addr").value.trim(),
      contact: app.$("#co_contact").value.trim(),
      trn:     app.$("#co_trn").value.trim()
    };
    var account = function(cur){ var o = {}; app.BANK_FIELDS.forEach(function(f){ o[f[0]] = app.$("#bk_"+cur+"_"+f[0]).value.trim(); }); return o; };
    app.DB.bank = { name: app.$("#bk_name").value.trim(), aed: account("aed"), usd: account("usd") };
    if(!app.save()) return false;
    app.applySiteOverrides();
    app.toast("Company and bank details saved","ok");
  };
  app.$("#saveStaff").onclick = function(){
    var l = app.$("#staffList").value.split(",").map(function(s){return s.trim();}).filter(Boolean);
    if(!l.length){ app.toast("Enter at least one name","err"); return; }
    app.DB.staffList = l; if(!app.save()) return false;
    app.CFG.staff = l; app.fillStaff(); app.toast("Staff list saved","ok");
  };
  app.$$("#p-admin input[data-r]").forEach(function(i){
    i.onchange = function(){
      var id=i.dataset.r, f=i.dataset.f, v=Number(i.value);
      if(!Number.isFinite(v) || v<0){app.toast('Rate and minimum must be nonnegative numbers','err');return;}
      app.DB.rates = app.DB.rates||{}; app.DB.rates[id]=app.DB.rates[id]||{};
      app.DB.rates[id][f]=v;
      if(!app.save()) return false;
      app.applyRateOverrides();
      app.buildAdvice("export"); app.buildAdvice("import");
      app.toast("Tariff updated","ok");
    };
  });
  app.$("#btnBackup").onclick = function(){
    app.downloadWorkspaceBackup();
    app.toast("Backup downloaded","ok");
  };
  app.$("#btnRestore").onclick = function(){ app.$("#fileRestore").click(); };
  app.$("#fileRestore").onchange = function(){
    var f=this.files[0]; if(!f) return;
    if(f.size > 16*1024*1024){app.toast('Backup exceeds the 16 MB workspace limit','err');return;}
    var r=new FileReader();
    r.onload=function(){
      try{
        var raw=JSON.parse(r.result), o=migrateSnapshot(raw);
        var original = raw.snapshot && Number.isInteger(raw.revision) ? raw.snapshot : raw;
        var hasBookings = original.db ? original.db.bookingPlanner !== undefined : original.bookingPlanner !== undefined;
        app.modal("Restore backup?","<p>This replaces this workspace with " + o.db.entries.length + " ledger records, " + o.shipments.items.length + " shipments, " + o.warehouse.items.length + " warehouse items and " + o.db.bookingPlanner.bookings.length + " bookings.</p>" + (!original.format ? "<p>This is a legacy register-only backup. It contains no shipment manifest or warehouse history.</p>" : "") + (!hasBookings ? "<p>This older backup has no booking planner. Existing bookings and booking settings will be cleared.</p>" : ""),
          [{label:"Cancel"},{label:"Restore", cls:"pri", fn:function(){
            if(!app.restoreWorkspace(o)) return false;
            app.toast("Backup restored","ok");
          }}]);
      }catch(err){ app.toast("That file is not a valid backup","err"); }
    };
    r.readAsText(f); this.value="";
  };
  app.$("#btnSeed").onclick = function(){
    app.modal("Load sample data?","<p>Adds a handful of demo invoices and a handover so you can see the register and dashboard working. Safe to erase afterwards.</p>",
      [{label:"Cancel"},{label:"Load", cls:"pri", fn:app.seedDemo}]);
  };
  app.$("#btnWipe").onclick = function(){
    app.modal("Erase all data?","<p>Every booking, invoice, handover, shipment, reception record, warehouse entry and setting will be cleared from this workspace. Download a backup first.</p>",
      [{label:"Cancel"},{label:"Erase everything", cls:"dgr", fn:function(){
        if(!app.restoreWorkspace({entries:[], seq:{export:0,import:0}, sec:[], staff:null})) return false;
        app.toast("All data erased");
      }}]);
  };
  app.$("#dbcount").textContent = app.DB.entries.length;
};

app.rateTable = function rateTable(lines, pfx){
  var h = '<table class="chg"><thead><tr><th style="text-align:left">Service Description</th>'
        + '<th style="width:110px">Rate (AED)</th><th style="width:110px">Minimum (AED)</th><th style="width:70px">Basis</th></tr></thead><tbody>';
  lines.forEach(function(l){
    if(l.g){ h += '<tr class="grp"><td colspan="4">'+app.esc(l.g)+'</td></tr>'; return; }
    if(l.kind==="days" || l.kind==="misc"){
      h += '<tr><td class="desc">'+app.esc(l.d)+'</td><td class="num">-</td><td class="num">-</td><td class="num">'+(l.kind==="days"?"days":"manual")+'</td></tr>';
      return;
    }
    var basis = l.kind==="kg" ? "per kg" : (l.kind==="storage" ? "kg/day" : (l.unit||"each"));
    h += '<tr><td class="desc">'+app.esc(l.d)+'</td>'
       + '<td><input class="qty" type="number" step="0.001" value="'+l.rate+'" data-r="'+l.id+'" data-f="rate"></td>'
       + '<td><input class="qty" type="number" step="0.01" value="'+l.min+'" data-r="'+l.id+'" data-f="min"></td>'
       + '<td class="num">'+basis+'</td></tr>';
  });
  return h+'</tbody></table>';
};

app.RATES_SHIPPED = {};

app.EXPORT_LINES.concat(app.IMPORT_LINES).forEach(function(l){ if(!l.g) app.RATES_SHIPPED[l.id] = { rate: l.rate, min: l.min }; });

app.restoreShippedSettings = function restoreShippedSettings(){
  var c = JSON.parse(JSON.stringify(app.CFG_SHIPPED));
  app.CFG.company = c.company; app.CFG.bank = c.bank; app.CFG.staff = c.staff; app.CFG.freeHours = c.freeHours;
  app.EXPORT_LINES.concat(app.IMPORT_LINES).forEach(function(l){
    var r = app.RATES_SHIPPED[l.id];
    if(r){ l.rate = r.rate; l.min = r.min; }
  });
};

app.applyRateOverrides = function applyRateOverrides(){
  if(!app.DB.rates) return;
  app.EXPORT_LINES.concat(app.IMPORT_LINES).forEach(function(l){
    if(l.g || !app.DB.rates[l.id]) return;
    if(app.DB.rates[l.id].rate!=null) l.rate = app.DB.rates[l.id].rate;
    if(app.DB.rates[l.id].min!=null)  l.min  = app.DB.rates[l.id].min;
  });
};
