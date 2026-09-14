import { app } from '../core/runtime.js';

app.buildRegister = function buildRegister(){
  var h = '<div class="panel"><h3>Duty Shift Ledger - Invoice Register</h3><div class="body">';
  h += '<div class="filters">';
  h += app.fld("From", '<input id="rf_from" type="date">');
  h += app.fld("To", '<input id="rf_to" type="date">');
  h += app.fld("Type", '<select id="rf_type"><option value="">All</option><option>Export</option><option>Import</option></select>');
  h += app.fld("Payment", '<select id="rf_pay"><option value="">All</option>'+app.CFG.payModes.map(function(m){return '<option>'+m+'</option>';}).join("")+'</select>');
  h += app.fld("Staff", '<select id="rf_staff"><option value="">All</option>'+app.CFG.staff.map(function(s){return '<option>'+s+'</option>';}).join("")+'</select>');
  h += app.fld("Search AWB / Customer / Ref", '<input id="rf_q" placeholder="type to filter">');
  h += '<button class="btn sm" id="rf_today">Today</button>';
  h += '<button class="btn sm" id="rf_clear">Reset</button>';
  h += '</div>';
  h += '<div class="btnbar" style="margin-bottom:9px">'
     + '<button class="btn ok" id="btnHandover">Record Cash Handover to Accounts</button>'
     + '<button class="btn" id="btnOpening">Set Opening Balance</button>'
     + '<button class="btn pri" id="btnXls">Export Register to Excel</button>'
     + '<button class="btn" id="btnCsv">Export CSV</button>'
     + '<span class="hint" id="regsum"></span>'
     + '</div>';
  h += '</div>';
  h += '<div class="regwrap"><table class="reg" id="regtbl"><thead><tr>'
     + '<th>Date</th><th>Ref No.</th><th>AWB</th><th>Type</th><th>Customer</th><th>Staff</th>'
     + '<th style="text-align:right">Cash Collected</th><th style="text-align:right">Handed Over</th>'
     + '<th style="text-align:right">Cash Balance</th><th style="text-align:right">Card</th>'
     + '<th style="text-align:right">Credit</th><th style="text-align:right">CASS</th>'
     + '<th style="text-align:right">Bank Transfer</th><th style="text-align:right">Total Sale</th>'
     + '<th>Remarks</th><th>Hard Copy</th><th></th></tr></thead><tbody></tbody></table></div>';
  h += '</div>';
  app.$("#p-register").innerHTML = h;

  ["rf_from","rf_to","rf_type","rf_pay","rf_staff","rf_q"].forEach(function(id){
    app.$("#"+id).addEventListener("input", app.renderRegister);
    app.$("#"+id).addEventListener("change", app.renderRegister);
  });
  app.$("#rf_today").onclick = function(){
    var s=app.ymd(new Date());
    app.$("#rf_from").value=s; app.$("#rf_to").value=s; app.renderRegister();
  };
  app.$("#rf_clear").onclick = function(){
    ["rf_from","rf_to","rf_type","rf_pay","rf_staff","rf_q"].forEach(function(id){ app.$("#"+id).value=""; });
    app.renderRegister();
  };
  app.$("#btnHandover").onclick = app.handoverDialog;
  app.$("#btnOpening").onclick  = app.openingDialog;
  app.$("#btnXls").onclick = function(){ app.exportExcel(app.filteredEntries()); };
  app.$("#btnCsv").onclick = function(){ app.exportCsv(app.filteredEntries()); };
  app.renderRegister();
};

app.filteredEntries = function filteredEntries(){
  var f = {
    from:(app.$("#rf_from")||{}).value||"", to:(app.$("#rf_to")||{}).value||"",
    type:(app.$("#rf_type")||{}).value||"", pay:(app.$("#rf_pay")||{}).value||"",
    staff:(app.$("#rf_staff")||{}).value||"", q:((app.$("#rf_q")||{}).value||"").toLowerCase()
  };
  return app.DB.entries.filter(function(e){
    if(f.from && e.date < f.from) return false;
    if(f.to   && e.date > f.to)   return false;
    if(f.type && (e.type!=="invoice" || e.mode!==f.type)) return false;
    if(f.pay  && (e.type!=="invoice" || e.payMode!==f.pay)) return false;
    if(f.staff && e.staff!==f.staff) return false;
    if(f.q){
      var hay = [e.mawb,e.hawb,e.cust,e.ref,e.rem,e.payReason,e.note].join(" ").toLowerCase();
      var digits = app.awbKey(f.q);
      var awbMatch = /^[\d\s-]+$/.test(f.q) && digits && [e.mawb,e.hawb].some(function(value){return app.awbKey(value).indexOf(digits) >= 0;});
      if(hay.indexOf(f.q)<0 && !awbMatch) return false;
    }
    return true;
  });
};

app.renderRegister = function renderRegister(){
  var regtblEl = app.$("regtbl"); var tb = regtblEl ? regtblEl.querySelector("tbody") : null; if(!tb) return;
  var bal = app.num(app.DB.openingBalance);
  var rows = [];

  /* opening row */
  rows.push('<tr class="opening"><td>'+app.esc(app.DB.openingDate?app.fmtD(app.DB.openingDate):"")+'</td><td></td><td></td><td></td>'
    +'<td>OPENING BALANCE</td><td></td><td class="n"></td><td class="n"></td><td class="n">'+app.money(bal)+'</td>'
    +'<td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td>'
    +'<td>'+app.esc(app.DB.openingNote||"")+'</td><td></td><td></td></tr>');

  var shown = app.filteredEntries();
  var shownIds = {}; shown.forEach(function(e){ shownIds[e.id]=1; });
  var out=[], tot={cash:0,card:0,credit:0,cass:0,bank:0,sales:0,handed:0,n:0};

  app.DB.entries.forEach(function(e){
    if(e.type==="handover") bal -= app.num(e.amount);
    else bal += app.num(e.pay.cash);
    if(!shownIds[e.id]) return;

    if(e.type==="handover"){
      tot.handed += app.num(e.amount);
      out.push('<tr class="handover" data-id="'+e.id+'"><td>'+app.esc(app.fmtD(e.date))+'</td><td></td><td></td><td></td>'
        +'<td>CASH HANDED TO ACCOUNTS</td><td>'+app.esc(e.staff||"")+'</td>'
        +'<td class="n"></td><td class="n">'+app.money(e.amount)+'</td><td class="n">'+app.money(bal)+'</td>'
        +'<td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td><td class="n"></td>'
        +'<td>'+app.esc(e.note||"")+'</td><td></td>'
        +'<td><button class="btn sm dgr" data-del="'+e.id+'">Del</button></td></tr>');
      return;
    }
    tot.cash+=app.num(e.pay.cash); tot.card+=app.num(e.pay.card); tot.credit+=app.num(e.pay.credit);
    tot.cass+=app.num(e.pay.cass); tot.bank+=app.num(e.pay.bank); tot.sales+=app.num(e.total); tot.n++;
    var pb = {"Cash":"b-cash","Card":"b-card","Cash + Card":"b-mix","Credit":"b-credit","CASS":"b-cass","Bank Transfer":"b-bank","Prepaid":"b-bank"}[e.payMode]||"b-mix";
    out.push('<tr data-id="'+e.id+'"><td>'+app.esc(app.fmtD(e.date))+'</td><td>'+app.esc(e.ref)+'</td><td>'+app.esc(e.mawb)+'</td>'
      +'<td><span class="badge '+(e.mode==="Export"?"b-exp":"b-imp")+'">'+app.esc(e.mode)+'</span></td>'
      +'<td>'+app.esc(e.cust)+'</td><td>'+app.esc(e.staff)+'</td>'
      +'<td class="n">'+(e.pay.cash?app.money(e.pay.cash):"")+'</td><td class="n"></td>'
      +'<td class="n">'+app.money(bal)+'</td>'
      +'<td class="n">'+(e.pay.card?app.money(e.pay.card):"")+'</td>'
      +'<td class="n">'+(e.pay.credit?app.money(e.pay.credit):"")+'</td>'
      +'<td class="n">'+(e.pay.cass?app.money(e.pay.cass):"")+'</td>'
      +'<td class="n">'+(e.pay.bank?app.money(e.pay.bank):"")+'</td>'
      +'<td class="n"><b>'+app.money(e.total)+'</b></td>'
      /* Remarks is cut to 250px on screen; the tooltip carries it in full */
      +'<td title="'+app.esc([e.rem, e.payReason ? "Amount differs from total: "+e.payReason : ""].filter(Boolean).join("  |  "))+'"><span class="badge '+pb+'">'+app.esc(e.payMode)+'</span> '+app.esc(e.rem||"")+(e.payReason?' <i>Amount differs from total: '+app.esc(e.payReason)+'</i>':'')+(e.storageOverride?' <b style="color:#b8860b">OVR</b>':'')+'</td>'
      +'<td style="text-align:center"><span class="'+(e.hardcopy?"tick":"cross")+'" data-hc="'+e.id+'" style="cursor:pointer" title="Toggle hard copy received">'+(e.hardcopy?"&#10003;":"&#9675;")+'</span></td>'
      +'<td><button class="btn sm" data-print="'+e.id+'">Print</button> <button class="btn sm dgr" data-del="'+e.id+'">Del</button></td></tr>');
  });

  rows = rows.concat(out);
  tb.innerHTML = rows.join("");
  app.$("#regsum").innerHTML = '<b>'+tot.n+'</b> invoices shown &nbsp;|&nbsp; Sales <b>AED '+app.money(tot.sales)
    +'</b> &nbsp;|&nbsp; Cash '+app.money(tot.cash)+' &nbsp;|&nbsp; Card '+app.money(tot.card)
    +' &nbsp;|&nbsp; Credit '+app.money(tot.credit)+' &nbsp;|&nbsp; CASS '+app.money(tot.cass)
    +' &nbsp;|&nbsp; Bank '+app.money(tot.bank)+' &nbsp;|&nbsp; Handed over '+app.money(tot.handed);

  app.$$("[data-del]", tb).forEach(function(b){
    b.onclick=function(){
      var id=b.dataset.del;
      app.modal("Delete entry?","<p>This removes the entry and recalculates every balance after it. This cannot be undone.</p>",
        [{label:"Cancel"},{label:"Delete", cls:"dgr", fn:function(){
          app.DB.entries = app.DB.entries.filter(function(x){ return x.id!==id; });
          /* also drop the lying-list entry that was auto-added for this invoice
             (id "LLA"+invoiceId) - from both the live list and the cleared history -
             so deleting a mistaken invoice doesn't leave a stale/duplicate entry
             behind, and re-saving a corrected invoice for the same AWB can rejoin cleanly */
          var llId = "LLA" + id;
          if(typeof app.LL !== "undefined" && app.LL){
            var beforeItems = app.LL.items.length, beforeCleared = app.LL.cleared.length;
            app.LL.items = app.LL.items.filter(function(x){ return x.id!==llId; });
            app.LL.cleared = app.LL.cleared.filter(function(x){ return x.id!==llId; });
          }
          if(!app.save()) return false;
          app.refreshChip(); app.renderRegister(); app.renderDash();
          if(typeof app.renderLying === "function") app.renderLying();
          if(typeof app.renderSecurity === "function") app.renderSecurity();
          app.toast("Entry deleted");
        }}]);
    };
  });
  app.$$("[data-print]", tb).forEach(function(b){
    b.onclick=function(){ var e=app.DB.entries.filter(function(x){return x.id===b.dataset.print;})[0]; if(e) app.printAdvice(e,false); };
  });
  app.$$("[data-hc]", tb).forEach(function(s){
    s.onclick=function(){
      var e=app.DB.entries.filter(function(x){return x.id===s.dataset.hc;})[0];
      if(e){ e.hardcopy=!e.hardcopy; if(!app.save()) return false; app.renderRegister(); }
    };
  });
};

app.handoverDialog = function handoverDialog(){
  var b = app.cashOnHand();
  app.modal("Cash Handover to Accounts",
    '<p>Cash on hand right now: <b>AED '+app.money(b)+'</b></p>'
    +'<div class="fgrid" style="grid-template-columns:1fr 1fr">'
    + app.fld("Amount handed over (AED)", '<input id="ho_amt" type="number" step="0.01" min="0" value="'+(b>0?b:0)+'">')
    + app.fld("Handed over by", '<select id="ho_staff">'+app.CFG.staff.map(function(s){return '<option'+(s===app.DB.staff?' selected':'')+'>'+app.esc(s)+'</option>';}).join("")+'</select>')
    + app.fld("Received by / Note", '<input id="ho_note" placeholder="Accounts receiver name, voucher no.">')
    + app.fld("Date", '<input id="ho_date" type="date" value="'+app.ymd(new Date())+'">')
    +'</div><p class="hint" style="margin-bottom:0">This deducts from the cash balance in the register, exactly like the "Paid/Handed Over" column.</p>',
    [{label:"Cancel"},{label:"Record Handover", cls:"ok", fn:function(){
      var a=app.num(app.$("#ho_amt").value);
      if(a<=0){ app.toast("Enter an amount","err"); return false; }
      if(a> b+0.005){
        app.toast("Amount exceeds cash on hand ("+app.money(b)+")","err"); return false;
      }
      app.DB.entries.push({ id:"HO"+Date.now(), type:"handover", amount:a,
        staff:app.$("#ho_staff").value, note:app.$("#ho_note").value.trim(),
        date:app.$("#ho_date").value, ts:new Date().toISOString() });
      if(!app.save()) return false;
      app.refreshChip(); app.renderRegister(); app.renderDash();
      app.toast("Handover recorded: AED "+app.money(a)+". Cash on hand now "+app.money(app.cashOnHand()), "ok");
    }}]);
};

app.openingDialog = function openingDialog(){
  app.modal("Opening Cash Balance",
    '<div class="fgrid" style="grid-template-columns:1fr 1fr">'
    + app.fld("Opening balance (AED)", '<input id="ob_amt" type="number" step="0.01" value="'+app.num(app.DB.openingBalance)+'">')
    + app.fld("Date", '<input id="ob_date" type="date" value="'+app.esc(app.DB.openingDate||"")+'">')
    + app.fld("Note", '<input id="ob_note" value="'+app.esc(app.DB.openingNote||"")+'">')
    +'</div><p class="hint" style="margin-bottom:0">The float held at the counter, e.g. change received from accounts.</p>',
    [{label:"Cancel"},{label:"Save", cls:"pri", fn:function(){
      var opening = Number(app.$("#ob_amt").value);
      if(!Number.isFinite(opening) || opening < 0){ app.toast("Opening balance must be a nonnegative number", "err"); return false; }
      app.DB.openingBalance=opening;
      app.DB.openingDate=app.$("#ob_date").value;
      app.DB.openingNote=app.$("#ob_note").value.trim();
      if(!app.save()) return false;
      app.refreshChip(); app.renderRegister(); app.renderDash(); app.toast("Opening balance set");
    }}]);
};
