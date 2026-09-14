import { app } from '../core/runtime.js';

app.buildDash = function buildDash(){
  var h = '<div class="filters panel" style="padding:10px 11px;align-items:end">';
  h += app.fld("Period", '<select id="d_period"><option value="today">Today</option><option value="7">Last 7 days</option>'
        +'<option value="30">Last 30 days</option><option value="month">This month</option><option value="all" selected>All time</option>'
        +'<option value="custom">Custom range</option></select>');
  h += app.fld("From", '<input id="d_from" type="date" disabled>');
  h += app.fld("To", '<input id="d_to" type="date" disabled>');
  h += app.fld("Staff", '<select id="d_staff"><option value="">All staff</option>'+app.CFG.staff.map(function(s){return '<option>'+s+'</option>';}).join("")+'</select>');
  h += '</div>';
  h += '<div class="kpis" id="d_kpis" style="margin-top:10px"></div>';
  h += '<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">'
     + '<div class="panel"><h3>Revenue by Payment Method</h3><div class="body"><div class="bars" id="d_pay"></div></div></div>'
     + '<div class="panel"><h3>Export vs Import</h3><div class="body"><div class="bars" id="d_mode"></div></div></div>'
     + '</div>';
  h += '<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">'
     + '<div class="panel"><h3>Top Customers by Revenue</h3><div class="body"><div class="bars" id="d_cust"></div></div></div>'
     + '<div class="panel"><h3>Collections by Staff</h3><div class="body"><div class="bars" id="d_staffb"></div></div></div>'
     + '</div>';
  h += '<div class="panel" style="margin-top:10px"><h3>Cash Position &amp; Handovers</h3><div class="body" id="d_cash"></div></div>';  h += '<div class="panel" style="margin-top:10px"><h3>Outstanding - Credit &amp; CASS (not yet settled)</h3><div class="body" id="d_out"></div></div>';
  app.$("#p-dash").innerHTML = h;

  app.$("#d_period").onchange = function(){
    var c = this.value==="custom";
    app.$("#d_from").disabled=!c; app.$("#d_to").disabled=!c;
    app.renderDash();
  };
  ["d_from","d_to","d_staff"].forEach(function(id){ app.$("#"+id).onchange = app.renderDash; });
  app.renderDash();
};

app.dashRange = function dashRange(){
  var p=(app.$("#d_period")||{}).value||"all", now=new Date();
  if(p==="today") return {from:app.ymd(now), to:app.ymd(now)};
  if(p==="7"){ var a=new Date(now); a.setDate(a.getDate()-6); return {from:app.ymd(a), to:app.ymd(now)}; }
  if(p==="30"){ var b=new Date(now); b.setDate(b.getDate()-29); return {from:app.ymd(b), to:app.ymd(now)}; }
  if(p==="month") return {from:app.ymd(now).slice(0,8)+"01", to:app.ymd(now)};
  if(p==="custom") return {from:(app.$("#d_from")||{}).value||"", to:(app.$("#d_to")||{}).value||""};
  return {from:"", to:""};
};

app.renderDash = function renderDash(){
  if(!app.$("#d_kpis")) return;
  var r = app.dashRange(), st = (app.$("#d_staff")||{}).value||"";
  var sel = app.DB.entries.filter(function(e){
    if(r.from && e.date < r.from) return false;
    if(r.to   && e.date > r.to)   return false;
    if(st && e.staff!==st) return false;
    return true;
  });
  var inv = sel.filter(function(e){ return e.type==="invoice"; });
  var hos = sel.filter(function(e){ return e.type==="handover"; });

  var t={cash:0,card:0,credit:0,cass:0,bank:0,prepaid:0,sales:0,wt:0};
  inv.forEach(function(e){
    t.cash+=app.num(e.pay.cash); t.card+=app.num(e.pay.card); t.credit+=app.num(e.pay.credit);
    t.cass+=app.num(e.pay.cass); t.bank+=app.num(e.pay.bank); t.prepaid+=app.num(e.pay.prepaid);
    t.sales+=app.num(e.total); t.wt+=app.num(e.wt);
  });
  var handed = hos.reduce(function(a,e){ return a+app.num(e.amount); },0);
  var onHand = app.cashOnHand();

  app.$("#d_kpis").innerHTML =
    app.kpi("tot","Total Sales", app.money(t.sales), inv.length+" invoices  |  "+app.money(t.wt)+" kg")
  + app.kpi("cash","Cash on Hand", app.money(onHand), "Collected "+app.money(t.cash)+" | Handed "+app.money(handed))
  + app.kpi("card","Card", app.money(t.card), app.pctOf(t.card,t.sales))
  + app.kpi("credit","Credit", app.money(t.credit), app.pctOf(t.credit,t.sales))
  + app.kpi("cass","CASS", app.money(t.cass), app.pctOf(t.cass,t.sales))
  + app.kpi("bank","Bank Transfer", app.money(t.bank), app.pctOf(t.bank,t.sales));

  app.bars("#d_pay", [
    {l:"Cash", v:t.cash, c:"var(--cash)"},
    {l:"Card", v:t.card, c:"var(--card)"},
    {l:"Credit", v:t.credit, c:"var(--credit)"},
    {l:"CASS", v:t.cass, c:"var(--cass)"},
    {l:"Bank Transfer", v:t.bank, c:"var(--bank)"}
  ]);

  var ex=0, im=0, exn=0, imn=0;
  inv.forEach(function(e){ if(e.mode==="Export"){ex+=app.num(e.total);exn++;} else {im+=app.num(e.total);imn++;} });
  app.bars("#d_mode", [
    {l:"Export ("+exn+")", v:ex, c:"#1042FF"},
    {l:"Import ("+imn+")", v:im, c:"#0A2270"}
  ]);

  var byC={}; inv.forEach(function(e){ byC[e.cust]=(byC[e.cust]||0)+app.num(e.total); });
  var cl = Object.keys(byC).map(function(k){ return {l:k, v:byC[k], c:"#061640"}; })
              .sort(function(a,b){ return b.v-a.v; }).slice(0,8);
  app.bars("#d_cust", cl.length?cl:[{l:"No data",v:0,c:"#ccc"}]);

  var byS={}; inv.forEach(function(e){ byS[e.staff]=(byS[e.staff]||0)+app.num(e.total); });
  var sl = Object.keys(byS).map(function(k){ return {l:k, v:byS[k], c:"#00873A"}; })
              .sort(function(a,b){ return b.v-a.v; });
  app.bars("#d_staffb", sl.length?sl:[{l:"No data",v:0,c:"#ccc"}]);

  var hoRows = hos.slice().reverse().slice(0,12).map(function(e){
    return '<tr><td>'+app.esc(app.fmtD(e.date))+'</td><td>'+app.esc(e.staff||"")+'</td><td class="n">'+app.money(e.amount)+'</td><td>'+app.esc(e.note||"")+'</td></tr>';
  }).join("");
  app.$("#d_cash").innerHTML =
    '<div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">'
    + app.kpi("cash","Opening Float", app.money(app.DB.openingBalance), app.DB.openingNote||"")
    + app.kpi("cash","Cash Collected (period)", app.money(t.cash), inv.filter(function(e){return app.num(e.pay.cash)>0;}).length+" invoices")
    + app.kpi("cash","Handed to Accounts (period)", app.money(handed), hos.length+" handovers")
    + app.kpi("cash","Cash on Hand (live)", app.money(onHand), onHand<0?"NEGATIVE - check entries":"reconciles to register")
    + '</div>'
    + (hoRows ? '<table class="reg" style="white-space:normal"><thead><tr><th>Date</th><th>Staff</th><th style="text-align:right">Amount</th><th>Note</th></tr></thead><tbody>'+hoRows+'</tbody></table>'
              : '<p class="hint">No handovers recorded in this period.</p>');

  var outs = inv.filter(function(e){ return (app.num(e.pay.credit)+app.num(e.pay.cass))>0 && !e.settled; });
  var oc = outs.reduce(function(a,e){ return a+app.num(e.pay.credit); },0);
  var oa = outs.reduce(function(a,e){ return a+app.num(e.pay.cass); },0);
  var byCust={}; outs.forEach(function(e){ byCust[e.cust]=(byCust[e.cust]||0)+app.num(e.pay.credit)+app.num(e.pay.cass); });
  var rows = Object.keys(byCust).sort(function(a,b){ return byCust[b]-byCust[a]; }).map(function(k){
    return '<tr><td>'+app.esc(k)+'</td><td class="n">'+app.money(byCust[k])+'</td></tr>';
  }).join("");
  app.$("#d_out").innerHTML =
    '<p class="hint" style="margin-top:0">Credit total <b>AED '+app.money(oc)+'</b> &nbsp;|&nbsp; CASS total <b>AED '+app.money(oa)+'</b> across '+outs.length+' invoices.</p>'
    + (rows ? '<table class="reg" style="white-space:normal;max-width:520px"><thead><tr><th>Customer</th><th style="text-align:right">Outstanding (AED)</th></tr></thead><tbody>'+rows+'</tbody></table>'
            : '<p class="hint">Nothing outstanding.</p>');
};

app.kpi = function kpi(cls,k,v,s){
  return '<div class="kpi '+cls+'"><div class="k">'+app.esc(k)+'</div><div class="v">'+v+'</div><div class="s">'+app.esc(s||"")+'</div></div>';
};

app.pctOf = function pctOf(a,b){ return b>0 ? (a/b*100).toFixed(1)+"% of sales" : ""; };

app.bars = function bars(sel, items){
  var box=app.$(sel); if(!box) return;
  var max = Math.max.apply(null, items.map(function(i){ return i.v; }).concat([1]));
  box.innerHTML = items.map(function(i){
    var w = Math.max(2, i.v/max*100);
    return '<div class="bar"><div title="'+app.esc(i.l)+'" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+app.esc(i.l)+'</div>'
         + '<div class="t" style="width:'+w+'%;background:'+i.c+'"></div>'
         + '<div class="amt">'+app.money(i.v)+'</div></div>';
  }).join("");
};
