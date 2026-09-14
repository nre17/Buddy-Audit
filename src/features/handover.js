import { app } from '../core/runtime.js';

app.EQUIP_DEFAULT = ["OPS Mobile Phones","X-ray (Imp/Exp)","Shutter Doors","Scales",
                     "Walkie-talkies x 1","HHT x 1","IT Systems","Thermal Labels"];

app.SHIFTS = {
  morning:{l:"Morning  08:00 - 16:00", s:"08:00", e:"16:00"},
  evening:{l:"Evening  16:00 - 00:00", s:"16:00", e:"24:00"},
  night:  {l:"Night  00:00 - 08:00",   s:"00:00", e:"08:00"}
};

app.buildHandover = function buildHandover(){
  var ds = app.ymd(new Date());
  var h = '<div class="panel"><h3>Acceptance Shift Handover Report</h3><div class="body">';
  h += '<div class="fgrid">';
  h += app.fld("Date", '<input id="ho_d" type="date" value="'+ds+'">');
  h += app.fld("Shift", '<select id="ho_shift">'
      + Object.keys(app.SHIFTS).map(function(k){ return '<option value="'+k+'">'+app.SHIFTS[k].l+'</option>'; }).join("")
      + '<option value="custom">Custom window</option></select>');
  h += app.fld("From", '<input id="ho_from" type="datetime-local">');
  h += app.fld("To", '<input id="ho_to" type="datetime-local">');
  h += app.fld("Outgoing Staff", '<select id="ho_out"><option value="">All staff</option>'
      + app.CFG.staff.map(function(s){ return '<option'+(s===app.DB.staff?" selected":"")+'>'+app.esc(s)+'</option>'; }).join("")+'</select>');
  h += app.fld("Incoming Staff", '<select id="ho_in"><option value=""></option>'
      + app.CFG.staff.map(function(s){ return '<option>'+app.esc(s)+'</option>'; }).join("")+'</select>');
  h += app.fld("Hand Over Time", '<input id="ho_time" type="time">');
  h += app.fld("Shift Supervisor", '<input id="ho_sup">');
  h += '</div>';
  h += '<div class="f" style="margin-top:8px"><label>Main points / concerns to share</label>'
     + '<textarea id="ho_points" rows="2"></textarea></div>';
  h += '<div class="btnbar" style="margin-top:10px">'
     + '<button class="btn pri" id="ho_refresh">Recalculate from Register</button>'
     + '<button class="btn ok" id="ho_print">Print Handover Report</button>'
     + '<button class="btn" id="ho_save">Save Report</button>'
     + '<span class="hint" id="ho_msg"></span></div>';
  h += '</div></div>';

  h += '<div id="ho_figs" style="margin-top:10px"></div>';

  /* manual operational counts */
  h += '<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">';
  h += '<div class="panel"><h3>Delivery / Import - Pending</h3><div class="body"><div class="fgrid" style="grid-template-columns:1fr 1fr">'
     + app.fld("Customers Waiting for Physical Delivery", '<input id="ho_m1" type="number" min="0" value="0">')
     + app.fld("Customers Waiting for Delivery Order", '<input id="ho_m2" type="number" min="0" value="0">')
     + '</div></div></div>';
  h += '<div class="panel"><h3>Acceptance / Export - Pending</h3><div class="body"><div class="fgrid" style="grid-template-columns:1fr 1fr 1fr">'
     + app.fld("Pending for X-ray", '<input id="ho_m3" type="number" min="0" value="0">')
     + app.fld("Pending to Accept", '<input id="ho_m4" type="number" min="0" value="0">')
     + app.fld("Pending Doc Acceptance &amp; Invoice", '<input id="ho_m5" type="number" min="0" value="0">')
     + '</div></div></div>';
  h += '</div>';

  h += '<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">';
  h += app.heldPanel("hx","Shipments Held by Authorities - Export");
  h += app.heldPanel("hm","Shipments Held by Authorities - Delivery");
  h += '</div>';

  h += '<div class="panel" style="margin-top:10px"><h3>Handover Summary</h3><div class="body">'
     + '<textarea id="ho_sum" rows="3" style="width:100%;border:1px solid var(--line);border-radius:4px;padding:6px"></textarea></div></div>';

  h += '<div class="panel" style="margin-top:10px"><h3>Equipment</h3><div class="body">'
     + '<table class="chg" id="ho_eq"><thead><tr><th style="text-align:left">Equipment</th><th style="width:220px">Status</th><th style="width:70px"></th></tr></thead><tbody></tbody></table>'
     + '<div class="btnbar" style="margin-top:8px"><button class="btn sm" id="ho_eqadd">Add Equipment Line</button></div></div></div>';

  h += '<div class="panel" style="margin-top:10px"><h3>Saved Reports</h3><div class="body" id="ho_saved"></div></div>';

  app.$("#p-handover").innerHTML = h;

  var eq = (app.DB.equipment && app.DB.equipment.length) ? app.DB.equipment : app.EQUIP_DEFAULT.map(function(n){ return {n:n, s:"Ok"}; });
  app.eqRender(eq);
  app.$("#ho_eqadd").onclick = function(){ app.eqRender(app.eqRead().concat([{n:"",s:"Ok"}])); };

  app.$("#ho_shift").onchange = function(){ app.syncShiftWindow(); app.renderHandover(); };
  app.$("#ho_d").onchange = function(){ app.syncShiftWindow(); app.renderHandover(); };
  ["ho_from","ho_to","ho_out"].forEach(function(id){ app.$("#"+id).onchange = app.renderHandover; });
  app.$("#ho_refresh").onclick = app.renderHandover;
  app.$("#ho_print").onclick = app.printHandover;
  app.$("#ho_save").onclick = app.saveHandover;
  app.syncShiftWindow();
  app.renderHandover();
  app.renderSavedReports();
};

app.heldPanel = function heldPanel(pfx, title){
  return '<div class="panel"><h3>'+title+'</h3><div class="body">'
    + '<table class="chg" id="'+pfx+'_tbl"><thead><tr><th style="text-align:left">AWB #</th><th style="width:64px">Pcs</th>'
    + '<th style="width:74px">Weight</th><th style="text-align:left">Held Due To</th><th style="width:52px"></th></tr></thead><tbody></tbody></table>'
    + '<div class="btnbar" style="margin-top:8px"><button class="btn sm" data-add="'+pfx+'">Add Held Shipment</button></div></div></div>';
};

app.heldRows = function heldRows(pfx){
  return app.$$("#"+pfx+"_tbl tbody tr").map(function(tr){
    var i=app.$$("input",tr);
    return {awb:i[0].value.trim(), pcs:i[1].value.trim(), wt:i[2].value.trim(), due:i[3].value.trim()};
  }).filter(function(r){ return r.awb||r.due; });
};

app.heldRender = function heldRender(pfx, rows){
  var tb = app.$("#"+pfx+"_tbl tbody"); if(!tb) return;
  tb.innerHTML = rows.map(function(r){
    return '<tr><td><input class="qty" style="text-align:left" value="'+app.esc(r.awb||"")+'"></td>'
      + '<td><input class="qty" value="'+app.esc(r.pcs||"")+'"></td>'
      + '<td><input class="qty" value="'+app.esc(r.wt||"")+'"></td>'
      + '<td><input class="qty" style="text-align:left" value="'+app.esc(r.due||"")+'"></td>'
      + '<td><button class="btn sm dgr" data-rm="1">X</button></td></tr>';
  }).join("");
  app.$$("[data-rm]", tb).forEach(function(b){
    b.onclick = function(){ var tr=b.closest("tr"); tr.parentNode.removeChild(tr); };
  });
};

document.addEventListener("click", function(ev){
  var b = ev.target.closest ? ev.target.closest("[data-add]") : null;
  if(!b) return;
  var p = b.dataset.add;
  app.heldRender(p, app.heldRows(p).concat([{awb:"",pcs:"",wt:"",due:""}]));
});

app.eqRead = function eqRead(){
  return app.$$("#ho_eq tbody tr").map(function(tr){
    var i=app.$$("input",tr); return {n:i[0].value.trim(), s:i[1].value.trim()};
  }).filter(function(r){ return r.n; });
};

app.eqRender = function eqRender(list){
  var hoEqEl=app.$("ho_eq"); var tb = hoEqEl ? hoEqEl.querySelector("tbody") : null; if(!tb) return;
  tb.innerHTML = list.map(function(e){
    return '<tr><td><input class="qty" style="text-align:left" value="'+app.esc(e.n)+'"></td>'
      + '<td><input class="qty" style="text-align:left" value="'+app.esc(e.s)+'"></td>'
      + '<td><button class="btn sm dgr" data-eqrm="1">X</button></td></tr>';
  }).join("");
  app.$$("[data-eqrm]", tb).forEach(function(b){
    b.onclick=function(){ var tr=b.closest("tr"); tr.parentNode.removeChild(tr); app.DB.equipment=app.eqRead(); app.save(); };
  });
  app.$$("input", tb).forEach(function(i){ i.onchange=function(){ app.DB.equipment=app.eqRead(); app.save(); }; });
};

app.syncShiftWindow = function syncShiftWindow(){
  var k = app.$("#ho_shift").value; if(k==="custom") return;
  var d = app.$("#ho_d").value; if(!d) return;
  var s = app.SHIFTS[k];
  app.$("#ho_from").value = d+"T"+s.s;
  if(s.e==="24:00"){
    var nx=new Date(d+"T00:00"); nx.setDate(nx.getDate()+1);
    app.$("#ho_to").value = app.ymd(nx)+"T00:00";
  } else {
    app.$("#ho_to").value = d+"T"+s.e;
  }
  if(!app.$("#ho_time").value) app.$("#ho_time").value = s.e==="24:00" ? "00:00" : s.e;
};

app.handoverFigures = function handoverFigures(){
  var from = app.$("#ho_from").value, to = app.$("#ho_to").value, who = app.$("#ho_out").value;
  var a = from ? new Date(from).getTime() : -Infinity;
  var b = to   ? new Date(to).getTime()   :  Infinity;

  var openCash = app.num(app.DB.openingBalance), inWin = [];
  app.DB.entries.forEach(function(e){
    var t = new Date(e.ts).getTime();
    if(t < a){ openCash += (e.type==="handover" ? -app.num(e.amount) : app.num(e.pay.cash)); return; }
    if(t > b) return;
    inWin.push(e);
  });

  function blank(){ return {awb:0, pcs:0, wt:0}; }
  var F = {
    imp:{tot:blank(), spc:blank(), per:blank()},
    exp:{tot:blank(), spc:blank(), per:blank()},
    cash:{takeover:openCash, cash:0, card:0, cass:0, credit:0, bank:0, sales:0, onhand:openCash, handed:0},
    handovers:[], byStaff:{}, invoices:[]
  };

  inWin.forEach(function(e){
    if(e.type==="handover"){
      if(who && e.staff!==who) { F.cash.onhand -= app.num(e.amount); return; }
      F.cash.handed += app.num(e.amount); F.cash.onhand -= app.num(e.amount);
      F.handovers.push(e); return;
    }
    if(who && e.staff!==who){ F.cash.onhand += app.num(e.pay.cash); return; }

    var g = e.mode==="Export" ? F.exp : F.imp;
    var cls = e.cls || app.shcClass(e.shc);
    function add(o){ o.awb++; o.pcs += app.num(e.pcs); o.wt += app.num(e.wt); }
    add(g.tot);
    if(cls==="perishable") add(g.per);
    else if(cls==="special") add(g.spc);

    F.cash.cash += app.num(e.pay.cash); F.cash.card += app.num(e.pay.card);
    F.cash.cass += app.num(e.pay.cass); F.cash.credit += app.num(e.pay.credit);
    F.cash.bank += app.num(e.pay.bank); F.cash.sales += app.num(e.total);
    F.cash.onhand += app.num(e.pay.cash);

    var s = F.byStaff[e.staff] = F.byStaff[e.staff] || {n:0, pcs:0, wt:0, cash:0, card:0, cass:0, credit:0, bank:0, tot:0};
    s.n++; s.pcs += app.num(e.pcs); s.wt += app.num(e.wt);
    s.cash += app.num(e.pay.cash); s.card += app.num(e.pay.card); s.cass += app.num(e.pay.cass);
    s.credit += app.num(e.pay.credit); s.bank += app.num(e.pay.bank); s.tot += app.num(e.total);
    F.invoices.push(e);
  });
  return F;
};

app.renderHandover = function renderHandover(){
  if(!app.$("#ho_figs")) return;
  var F = app.handoverFigures();
  function trio(o){ return '<td class="num">'+o.awb+'</td><td class="num">'+o.pcs+'</td><td class="num">'+app.money(o.wt)+'</td>'; }
  function block(title, g){
    return '<div class="panel"><h3>'+title+'</h3>'
      + '<table class="chg"><thead><tr><th style="text-align:left">Category</th><th style="width:90px">Total AWB</th>'
      + '<th style="width:90px">Total Pcs</th><th style="width:110px">Total Weight</th></tr></thead><tbody>'
      + '<tr class="act"><td><b>Total AWB</b></td>'+trio(g.tot)+'</tr>'
      + '<tr><td>Special Cargo AWB</td>'+trio(g.spc)+'</tr>'
      + '<tr><td>Perishable AWB</td>'+trio(g.per)+'</tr>'
      + '</tbody></table></div>';
  }
  var staffRows = Object.keys(F.byStaff).sort().map(function(k){
    var s=F.byStaff[k];
    return '<tr><td><b>'+app.esc(k)+'</b></td><td class="num">'+s.n+'</td><td class="num">'+s.pcs+'</td><td class="num">'+app.money(s.wt)+'</td>'
      + '<td class="num">'+app.money(s.cash)+'</td><td class="num">'+app.money(s.card)+'</td><td class="num">'+app.money(s.cass)+'</td>'
      + '<td class="num">'+app.money(s.credit)+'</td><td class="num">'+app.money(s.bank)+'</td><td class="num"><b>'+app.money(s.tot)+'</b></td></tr>';
  }).join("");

  var h = '<div class="grid" style="grid-template-columns:1fr 1fr">'
        + block("Delivery / Import", F.imp) + block("Acceptance / Export", F.exp) + '</div>';

  h += '<div class="panel" style="margin-top:10px"><h3>Payment Methods by Staff  (pieces and weight included)</h3>'
     + '<table class="chg"><thead><tr><th style="text-align:left">Staff</th><th style="width:70px">Invoices</th>'
     + '<th style="width:70px">Pieces</th><th style="width:90px">Weight</th><th style="width:90px">Cash</th>'
     + '<th style="width:90px">Card</th><th style="width:90px">CASS</th><th style="width:90px">Credit</th>'
     + '<th style="width:90px">Bank</th><th style="width:100px">Total Sales</th></tr></thead><tbody>'
     + (staffRows || '<tr><td colspan="10" style="color:var(--mut)">No invoices in this window.</td></tr>')
     + '</tbody></table></div>';

  h += '<div class="panel" style="margin-top:10px"><h3>Cash Handling</h3>'
     + '<table class="chg"><tbody>'
     + app.cashRow("Cash Take-Over (balance at shift start)", F.cash.takeover)
     + app.cashRow("Total Cash from Shift", F.cash.cash)
     + app.cashRow("Total Credit Card from Shift", F.cash.card)
     + app.cashRow("Total CASS from Shift", F.cash.cass)
     + app.cashRow("Total Credit Billing", F.cash.credit)
     + app.cashRow("Total Bank Transfer", F.cash.bank)
     + app.cashRow("Total Sales in Shift", F.cash.sales, 1)
     + app.cashRow("Cash Handed Over to Accounts", F.cash.handed)
     + app.cashRow("Cash on Hand at Handover", F.cash.onhand, 1)
     + '</tbody></table></div>';

  if(F.handovers.length){
    h += '<div class="panel" style="margin-top:10px"><h3>Cash Handed Over to Accounts</h3>'
       + '<table class="chg"><thead><tr><th style="text-align:left">Date</th><th style="width:90px">Time</th>'
       + '<th style="width:110px">Amount</th><th style="text-align:left">Handed Over To</th></tr></thead><tbody>'
       + F.handovers.map(function(e){
           var t=new Date(e.ts);
           return '<tr><td>'+app.esc(app.fmtD(e.date))+'</td><td class="num">'+app.pad(t.getHours())+':'+app.pad(t.getMinutes())+'</td>'
             + '<td class="num"><b>'+app.money(e.amount)+'</b></td><td>'+app.esc(e.note||"")+'</td></tr>';
         }).join("")
       + '</tbody></table></div>';
  }
  h += '<div class="panel" style="margin-top:10px"><h3>Cargo Lying List - Warehouse</h3><div class="body">'
     + '<table class="chg" style="width:100%">' + app.lyingBand(false).replace(/^<table[^>]*><tbody>/,"").replace(/<\/tbody><\/table>$/,"") + '</table></div></div>';

  app.$("#ho_figs").innerHTML = h;
  app.$("#ho_msg").innerHTML = '<b>'+F.invoices.length+'</b> invoices in window'+(app.$("#ho_out").value?' for '+app.esc(app.$("#ho_out").value):'');
};

app.cashRow = function cashRow(l,v,strong){
  return '<tr'+(strong?' class="act"':'')+'><td>'+(strong?'<b>'+l+'</b>':l)+'</td>'
       + '<td class="num" style="width:150px">'+(strong?'<b>'+app.money(v)+'</b>':app.money(v))+'</td></tr>';
};

app.handoverData = function handoverData(){
  var F = app.handoverFigures();
  return {
    id:"HR"+Date.now(),
    date:app.$("#ho_d").value, shift:app.$("#ho_shift").value,
    shiftLabel: app.SHIFTS[app.$("#ho_shift").value] ? app.SHIFTS[app.$("#ho_shift").value].l : "Custom window",
    from:app.$("#ho_from").value, to:app.$("#ho_to").value,
    outgoing:app.$("#ho_out").value || "All counter staff", incoming:app.$("#ho_in").value,
    time:app.$("#ho_time").value, sup:app.$("#ho_sup").value.trim(),
    points:app.$("#ho_points").value.trim(), summary:app.$("#ho_sum").value.trim(),
    m:{d1:app.num(app.$("#ho_m1").value), d2:app.num(app.$("#ho_m2").value),
       e1:app.num(app.$("#ho_m3").value), e2:app.num(app.$("#ho_m4").value), e3:app.num(app.$("#ho_m5").value)},
    heldExp:app.heldRows("hx"), heldImp:app.heldRows("hm"),
    equipment:app.eqRead(), F:F
  };
};

app.saveHandover = function saveHandover(){
  var r = app.handoverData();
  app.DB.reports = app.DB.reports || [];
  app.DB.reports.push(r);
  app.DB.equipment = r.equipment;
  if(!app.save()) return false;
  app.renderSavedReports();
  app.toast("Handover report saved","ok");
};

app.renderSavedReports = function renderSavedReports(){
  var box=app.$("#ho_saved"); if(!box) return;
  var list=(app.DB.reports||[]).slice().reverse();
  if(!list.length){ box.innerHTML='<p class="hint" style="margin:0">No saved reports yet.</p>'; return; }
  box.innerHTML = '<table class="reg" style="white-space:normal"><thead><tr><th>Date</th><th>Shift</th>'
    + '<th>Outgoing</th><th>Incoming</th><th style="text-align:right">Sales</th><th style="text-align:right">Cash on Hand</th><th></th></tr></thead><tbody>'
    + list.map(function(r){
        return '<tr><td>'+app.esc(app.fmtD(r.date))+'</td><td>'+app.esc(r.shiftLabel)+'</td><td>'+app.esc(r.outgoing)+'</td>'
          + '<td>'+app.esc(r.incoming||"")+'</td><td class="n">'+app.money(r.F.cash.sales)+'</td>'
          + '<td class="n">'+app.money(r.F.cash.onhand)+'</td>'
          + '<td><button class="btn sm" data-rp="'+r.id+'">Print</button> '
          + '<button class="btn sm dgr" data-rd="'+r.id+'">Del</button></td></tr>';
      }).join("") + '</tbody></table>';
  app.$$("[data-rp]",box).forEach(function(b){
    b.onclick=function(){ var r=(app.DB.reports||[]).filter(function(x){return x.id===b.dataset.rp;})[0]; if(r) app.printHandover(r); };
  });
  app.$$("[data-rd]",box).forEach(function(b){
    b.onclick=function(){
      app.DB.reports=(app.DB.reports||[]).filter(function(x){ return x.id!==b.dataset.rd; });
      if(!app.save()) return false;
      app.renderSavedReports(); app.toast("Report deleted");
    };
  });
};

app.printHandover = function printHandover(saved){
  var r = (saved && saved.id) ? saved : app.handoverData();
  var F = r.F;
  function trio(o){ return '<td class="n">'+o.awb+'</td><td class="n">'+o.pcs+'</td><td class="n">'+app.money(o.wt)+'</td>'; }
  function band(t){ return '<tr><td class="band" colspan="7">'+t+'</td></tr>'; }

  var h = '<div class="doc rep">';
  h += '<div class="dh"><div class="logo"><img src="'+app.esc(app.safeLogoSource(app.DB.logo))+'" alt=""></div>'
     + '<div style="text-align:right;font-size:8.5px;line-height:1.35">'+app.esc(app.CFG.company.name)+'<br>'+app.esc(app.CFG.company.addr)
     + '<br>Contact: '+app.esc(app.CFG.company.contact)+'<br>TRN: '+app.esc(app.CFG.company.trn)+'</div></div>';
  h += '<div class="greenrule"></div>';
  h += '<div class="title">Acceptance Shift Handover Report</div>';

  h += '<table class="meta"><tbody>'
     + '<tr><td class="l">Date</td><td>'+app.esc(app.fmtD(r.date))+'</td><td class="l">Outgoing Staff</td><td>'+app.esc(r.outgoing)+'</td></tr>'
     + '<tr><td class="l">Shift Timing</td><td>'+app.esc(r.shiftLabel)+'</td><td class="l">Incoming Staff</td><td>'+app.esc(r.incoming||"")+'</td></tr>'
     + '<tr><td class="l">Hand Over Time</td><td>'+app.esc(r.time||"")+'</td><td class="l">Shift Supervisor</td><td>'+app.esc(r.sup||"")+'</td></tr>'
     + '<tr><td class="l">Main Points</td><td colspan="3">'+app.esc(r.points||"Nil")+'</td></tr>'
     + '</tbody></table>';

  h += '<table class="items" style="margin-top:4px"><tbody>';
  h += band("Delivery / Import");
  h += '<tr class="hd"><td colspan="4">Category</td><td class="n">Total AWB</td><td class="n">Total Pcs</td><td class="n">Total Weight</td></tr>';
  h += '<tr><td colspan="4">Total AWB</td>'+trio(F.imp.tot)+'</tr>';
  h += '<tr><td colspan="4">Special Cargo AWB</td>'+trio(F.imp.spc)+'</tr>';
  h += '<tr><td colspan="4">Perishable AWB</td>'+trio(F.imp.per)+'</tr>';
  h += '<tr><td colspan="6">Customers Waiting for Physical Delivery</td><td class="n">'+r.m.d1+'</td></tr>';
  h += '<tr><td colspan="6">Customers Waiting for Delivery Order</td><td class="n">'+r.m.d2+'</td></tr>';

  h += band("Acceptance / Export");
  h += '<tr class="hd"><td colspan="4">Category</td><td class="n">Total AWB</td><td class="n">Total Pcs</td><td class="n">Total Weight</td></tr>';
  h += '<tr><td colspan="4">Total AWB</td>'+trio(F.exp.tot)+'</tr>';
  h += '<tr><td colspan="4">Special Cargo AWB</td>'+trio(F.exp.spc)+'</tr>';
  h += '<tr><td colspan="4">Perishable AWB</td>'+trio(F.exp.per)+'</tr>';
  h += '<tr><td colspan="6">Shipments Pending for X-ray</td><td class="n">'+r.m.e1+'</td></tr>';
  h += '<tr><td colspan="6">Shipments Pending to Accept</td><td class="n">'+r.m.e2+'</td></tr>';
  h += '<tr><td colspan="6">Shipments Pending for Doc Acceptance &amp; Invoice</td><td class="n">'+r.m.e3+'</td></tr>';
  h += '</tbody></table>';

  function held(title, rows){
    var s = '<table class="items" style="margin-top:3px"><tbody>'
          + '<tr><td class="bandr" colspan="4">'+title+'</td></tr>'
          + '<tr class="hd"><td>AWB #</td><td class="n" style="width:60px">Pcs</td><td class="n" style="width:70px">Weight</td><td>Held Due To</td></tr>';
    if(!rows.length) s += '<tr><td colspan="4" style="text-align:center">NIL</td></tr>';
    else rows.forEach(function(x){
      s += '<tr><td>'+app.esc(x.awb)+'</td><td class="n">'+app.esc(x.pcs)+'</td><td class="n">'+app.esc(x.wt)+'</td><td>'+app.esc(x.due)+'</td></tr>';
    });
    return s + '</tbody></table>';
  }
  h += held("Shipments Held by Authorities for Export", r.heldExp);
  h += held("Shipments Held by Authorities for Delivery", r.heldImp);

  h += '<table class="items" style="margin-top:4px"><tbody>'
     + '<tr><td class="band">Handover Summary</td></tr>'
     + '<tr><td style="height:11mm;vertical-align:top">'+app.esc(r.summary||"Nil").replace(/\n/g,"<br>")+'</td></tr></tbody></table>';

  /* staff payment breakdown */
  var sk = Object.keys(F.byStaff).sort();
  h += '<table class="items" style="margin-top:4px"><tbody>'
     + '<tr><td class="band" colspan="10">Payment Methods by Staff</td></tr>'
     + '<tr class="hd"><td>Staff</td><td class="n">AWBs</td><td class="n">Pcs</td><td class="n">Weight</td>'
     + '<td class="n">Cash</td><td class="n">Card</td><td class="n">CASS</td><td class="n">Credit</td>'
     + '<td class="n">Bank</td><td class="n">Total</td></tr>';
  if(!sk.length) h += '<tr><td colspan="10" style="text-align:center">NIL</td></tr>';
  sk.forEach(function(k){
    var s=F.byStaff[k];
    h += '<tr><td>'+app.esc(k)+'</td><td class="n">'+s.n+'</td><td class="n">'+s.pcs+'</td><td class="n">'+app.money(s.wt)+'</td>'
      + '<td class="n">'+app.money(s.cash)+'</td><td class="n">'+app.money(s.card)+'</td><td class="n">'+app.money(s.cass)+'</td>'
      + '<td class="n">'+app.money(s.credit)+'</td><td class="n">'+app.money(s.bank)+'</td><td class="n"><b>'+app.money(s.tot)+'</b></td></tr>';
  });
  h += '</tbody></table>';

  /* equipment + cash side by side */
  h += '<table style="margin-top:4px;width:100%"><tr style="vertical-align:top">';
  h += '<td style="width:48%;padding-right:4px"><table class="items"><tbody>'
     + '<tr><td class="band" colspan="2">Equipment</td></tr>'
     + '<tr class="hd"><td>Item</td><td style="width:78px">Status</td></tr>'
     + r.equipment.map(function(e){ return '<tr><td>'+app.esc(e.n)+'</td><td>'+app.esc(e.s)+'</td></tr>'; }).join("")
     + '</tbody></table></td>';
  h += '<td><table class="items"><tbody>'
     + '<tr><td class="band" colspan="2">Cash Handling</td></tr>'
     + app.prow("Cash Take-Over", F.cash.takeover)
     + app.prow("Total Cash from Shift", F.cash.cash)
     + app.prow("Total Credit Card from Shift", F.cash.card)
     + app.prow("Total CASS from Shift", F.cash.cass)
     + app.prow("Total Credit Billing", F.cash.credit)
     + app.prow("Total Bank Transfer", F.cash.bank)
     + app.prow("Total Sales in Shift", F.cash.sales, 1)
     + app.prow("Cash Handed to Accounts", F.cash.handed)
     + app.prow("Cash on Hand", F.cash.onhand, 1)
     + '</tbody></table>'
     + '<table class="items" style="margin-top:3px"><tbody><tr><td class="band" colspan="2">Cash Handed Over to Accounts</td></tr>'
     + (F.handovers.length ? F.handovers.map(function(e){
          var t=new Date(e.ts);
          return '<tr><td>'+app.esc(app.fmtD(e.date))+'  '+app.pad(t.getHours())+':'+app.pad(t.getMinutes())+'  to '+app.esc(e.note||"accounts")+'</td>'
               + '<td class="n" style="width:78px"><b>'+app.money(e.amount)+'</b></td></tr>';
        }).join("") : '<tr><td colspan="2" style="text-align:center">NIL</td></tr>')
     + '</tbody></table></td>';
  h += '</tr></table>';

  /* cargo lying list at the bottom of the handover report */
  h += app.lyingBand(true);

  h += '<table class="sig" style="margin-top:5px"><tbody><tr>'
     + '<td style="width:50%"><b>Outgoing Staff</b><br>Name: '+app.esc(r.outgoing)+'<br>Sign:</td>'
     + '<td><b>Incoming Staff</b><br>Name: '+app.esc(r.incoming||"")+'<br>Sign:</td></tr></tbody></table>';
  h += '<div class="foot"><span>Acceptance Shift Handover Report</span><span>'+app.esc(app.fmtD(r.date))+'  '+app.esc(r.shiftLabel)+'</span>'
     + '<span>Printed '+app.fmtDT(new Date().toISOString())+'</span></div>';
  h += '</div>';

  app.$("#printarea").innerHTML = h;
  setTimeout(function(){ window.print(); }, 150);
};

app.prow = function prow(l,v,strong){
  return '<tr'+(strong?' class="tot2"':'')+'><td>'+l+'</td><td class="n" style="width:78px">'+(strong?'<b>'+app.money(v)+'</b>':app.money(v))+'</td></tr>';
};

app.lyingRows = function lyingRows(){
  if(typeof app.llSyncFromRegister==="function") app.llSyncFromRegister();
  app.llSweep();
  return app.LL.items.slice().sort(function(a,b){ return new Date(a.dep)-new Date(b.dep); });
};

app.lyingBand = function lyingBand(doc){
  var items = app.lyingRows();
  var s = '<table class="items" style="margin-top:3px"><tbody>'
        + '<tr><td class="band" colspan="'+(doc?3:3)+'">Cargo Lying List - Warehouse</td></tr>';
  if(doc){
    s += '<tr class="hd"><td>AWB #</td><td class="n" style="width:52px">Pieces</td><td>From / To (Origin - Destination)</td></tr>';
    if(!items.length) s += '<tr><td colspan="3" style="text-align:center">NIL</td></tr>';
    items.forEach(function(x){
      s += '<tr><td>'+app.esc(x.awb)+'</td><td class="n">'+app.num(x.pcs)+'</td><td>'+app.esc(x.loc||"TO")+'</td></tr>';
    });
  } else {
    s += '<tr class="hd"><td>AWB #</td><td class="n">Pieces</td><td>From / To</td></tr>';
    if(!items.length) s += '<tr><td colspan="3" style="text-align:center;color:var(--mut)">No cargo currently lying.</td></tr>';
    items.forEach(function(x){
      var dirTag = (x.loc||"").indexOf("FROM ")===0
        ? '<span class="badge b-imp">'+app.esc(x.loc||"")+'</span>'
        : '<span class="badge b-exp">'+app.esc(x.loc||"TO")+'</span>';
      s += '<tr><td>'+app.esc(x.awb)+'</td><td class="n">'+app.num(x.pcs)+'</td><td>'+dirTag+'</td></tr>';
    });
  }
  return s + '</tbody></table>';
};
