import { app } from '../core/runtime.js';

app.LL_KEY = "solitair_lying_v1";

app.LL = { items: [], cleared: [], removed: [] };





app.buildLying = function buildLying(){
  var h = '<div class="panel"><h3>Manually Add Shipment to Lying List</h3><div class="body">';
  h += '<div class="fgrid">';
  h += app.fld("AWB # *", '<input id="ll_awb" placeholder="780-30000000">', "req");
  h += app.fld("Pieces *", '<input id="ll_pcs" type="number" step="1" min="0" placeholder="0">', "req");
  h += app.fld("Gross Weight (Kgs) *", '<input id="ll_wt" type="number" step="0.01" min="0" placeholder="0">', "req");
  h += app.fld("Direction *", app.sel("ll_dir", ["Export","Import"], ["Export - TO destination","Import - FROM origin"]), "req");
  h += app.fld(( '<span id="ll_dir_lbl">To (Destination)</span>'), '<input id="ll_loc" placeholder="e.g. NBO" style="text-transform:uppercase">');
  h += app.fld("Flight No. *", '<input id="ll_fltno" placeholder="e.g. 8G 401">', "req");
  h += app.fld("Departure Date &amp; Time (STD) *", '<input id="ll_dep" type="datetime-local">', "req");
  h += '</div>';
  h += '<div class="btnbar" style="margin-top:10px">'
     + '<button class="btn pri" id="ll_add">Add to Lying List</button>'
     + '<button class="btn dgr" id="ll_reset">Clear Entry Form</button>'
     + '<span class="hint" id="ll_msg"></span></div>';
  h += '<p class="hint" style="margin-bottom:0">Export AWBs are added to this list automatically when their invoice is saved in the register.</p>';
  h += '</div></div>';

  h += '<div id="ll_alerts" style="margin-top:10px"></div>';

  h += '<div class="panel" style="margin-top:10px"><h3>Cargo Currently Lying in Warehouse</h3><div class="body">'
     + '<div class="regwrap"><table class="reg" id="ll_tbl"><thead><tr>'
     + '<th>AWB #</th><th>Pieces</th><th style="text-align:right">Weight (kg)</th>'
     + '<th>From / To</th><th>Flight</th><th>Departure (STD)</th>'
     + '<th>Status</th><th>Time to Departure</th><th></th></tr></thead><tbody></tbody></table></div>'
     + '<p class="hint" style="margin-bottom:0">Entries are removed automatically once the current time passes the flight departure time.</p>'
     + '</div></div>';

  h += '<div class="panel" style="margin-top:10px"><h3>Cleared by Departure (kept for reference)</h3><div class="body">'
     + '<div class="btnbar" style="margin-bottom:8px"><button class="btn sm dgr" id="ll_clrhist">Clear History</button><span class="hint" id="ll_sum"></span></div>'
     + '<table class="reg" id="ll_hist"><thead><tr><th>Cleared At</th><th>AWB #</th><th>Pieces</th>'
     + '<th style="text-align:right">Weight (kg)</th><th>Flight</th><th>Scheduled Departure</th></tr></thead><tbody></tbody></table>'
     + '</div></div>';

  app.$("#p-lying").innerHTML = h;

  app.$("#ll_add").onclick = function(){
    var awb=app.$("#ll_awb").value.trim(), pcs=app.num(app.$("#ll_pcs").value), wt=app.num(app.$("#ll_wt").value);
    var fltno=app.$("#ll_fltno").value.trim(), dep=app.$("#ll_dep").value;
    var dir=app.$("#ll_dir").value, loc=app.$("#ll_loc").value.trim().toUpperCase();
    app.$$("#p-lying .f").forEach(function(f){ f.classList.remove("bad"); });
    var bad=[];
    function need(id){ var e=app.$(id); if(!e || !String(e.value).trim() || (e.type==="number" && app.num(e.value)<=0)){ bad.push(1); if(e) e.parentNode.classList.add("bad"); } }
    need("#ll_awb"); need("#ll_pcs"); need("#ll_wt"); need("#ll_fltno"); need("#ll_dep");
    if(bad.length){ app.$("#ll_msg").innerHTML='<span style="color:#c0392b;font-weight:700">Fill AWB, pieces, weight, flight and departure time.</span>'; return; }
    if(new Date(dep).getTime() <= Date.now()){
      app.modal("Flight already departed?", "<p>The departure time entered is in the past. This shipment would clear immediately. Add it anyway?</p>",
        [{label:"Cancel"},{label:"Add anyway", cls:"pri", fn:function(){ app.llCommit(awb,pcs,wt,fltno,dep,dir,loc); }}]);
      return;
    }
    app.llCommit(awb,pcs,wt,fltno,dep,dir,loc);
  };
  app.$("#ll_dir").onchange = function(){
    app.$("#ll_dir_lbl").textContent = this.value==="Export" ? "To (Destination)" : "From (Origin)";
  };
  app.$("#ll_reset").onclick = function(){ ["ll_awb","ll_pcs","ll_wt","ll_loc","ll_fltno","ll_dep"].forEach(function(i){ app.$("#"+i).value=""; }); app.$("#ll_msg").textContent=""; };
  app.$("#ll_clrhist").onclick = function(){
    app.modal("Clear cleared history?","<p>This only removes the reference log. The live lying list is not affected.</p>",
      [{label:"Cancel"},{label:"Clear", cls:"dgr", fn:function(){ app.LL.cleared=[]; if(!app.llSave()) return false; app.renderLying(); }}]);
  };

  app.llSweep();
  app.renderLying();
};

app.llCommit = function llCommit(awb,pcs,wt,fltno,dep,dir,loc){
  dir = dir || "Export"; loc = loc || "";
  app.LL.items.push({
    id:"LL"+Date.now(), awb:awb, pcs:pcs, wt:wt,
    dir:dir, loc:(dir==="Export"?"TO ":"FROM ")+loc, fltno:fltno, dep:dep,
    addedBy:app.DB.staff||app.CFG.staff[0], addedTs:new Date().toISOString(), auto:false
  });
  if(!app.llSave()) return false;
  app.llSweep(); app.renderLying();
  ["ll_awb","ll_pcs","ll_wt","ll_loc","ll_fltno","ll_dep"].forEach(function(i){ app.$("#"+i).value=""; });
  app.toast(awb+" added to lying list - clears when "+fltno+" departs","ok");
};

app.llSyncFromRegister = function llSyncFromRegister(){
  var added=0;
  app.DB.entries.forEach(function(e){
    if(e.type!=="invoice" || e.mode!=="Export") return;
    /* an entry staff removed stays removed, and an AWB already listed - however
       its dashes were typed - is not listed twice */
    if((app.LL.removed||[]).indexOf("LLA"+e.id) >= 0) return;
    var k = app.awbKey(e.mawb);
    var dup = app.LL.items.concat(app.LL.cleared).some(function(x){ return app.awbKey(x.awb)===k; });
    if(dup) return;
    /* departure = the advice's departure time if captured, otherwise flight date at 23:59 */
    var dep = e.t2 || (e.fltdate ? e.fltdate+"T23:59" : "");
    if(!dep) return;
    app.LL.items.push({
      id:"LLA"+e.id, awb:e.mawb, pcs:app.num(e.pcs), wt:app.num(e.wt),
      dir:"Export", loc:"TO "+(e.dst||""), fltno:e.fltno||"-", dep:dep,
      addedBy:e.staff||"", addedTs:e.ts||new Date().toISOString(), auto:true
    });
    added++;
  });
  if(added){ app.llSave(); }
  return added;
};

app.llSweep = function llSweep(){
  var now=Date.now(), kept=[], n=0;
  app.LL.items.forEach(function(it){
    var t=new Date(it.dep).getTime();
    if(t && t<=now){
      it.clearedAt=new Date().toISOString();
      app.LL.cleared.unshift(it); n++;
    } else kept.push(it);
  });
  if(n){ app.LL.items=kept; app.LL.cleared=app.LL.cleared.slice(0,300); app.llSave(); }
};

app.llCountdown = function llCountdown(dep){
  var ms=new Date(dep).getTime()-Date.now();
  if(ms<=0) return "departed";
  var m=Math.floor(ms/60000), hh=Math.floor(m/60), mm=m%60, dd=Math.floor(hh/24), hr=hh%24;
  if(dd>0) return dd+"d "+hr+"h";
  if(hh>0) return hh+"h "+mm+"m";
  return mm+"m";
};

app.renderLying = function renderLying(){
  var tb=app.$("ll_tbl") ? app.$("ll_tbl").querySelector("tbody") : null;
  if(tb){
    app.llSyncFromRegister();
    app.llSweep();
    tb.innerHTML = app.LL.items.length ? "" : '<tr><td colspan="9" style="text-align:center;color:var(--mut)">No cargo lying in the warehouse.</td></tr>';
    app.LL.items.forEach(function(it){
      var hrs=(new Date(it.dep).getTime()-Date.now())/3600000;
      var status = hrs<8
        ? '<span class="badge" style="background:#c0392b">'+(hrs<2?"URGENT":"DEPARTING SOON")+'</span>'
        : '<span class="badge b-exp">LYING</span>';
      var dirTag = (it.loc||"").indexOf("FROM ")===0
        ? '<span class="badge b-imp">'+app.esc(it.loc||"")+'</span>'
        : '<span class="badge b-exp">'+app.esc(it.loc||"TO")+'</span>';
      tb.insertAdjacentHTML("beforeend",
        '<tr data-id="'+it.id+'"><td>'+app.esc(it.awb)+(it.auto?' <span class="hint" title="Added automatically from the register">&#9679;</span>':"")+'</td>'
        +'<td>'+it.pcs+'</td><td class="n">'+app.money(it.wt)+'</td>'
        +'<td>'+dirTag+'</td>'
        +'<td>'+app.esc(it.fltno)+'</td><td>'+app.fmtDT(it.dep)+'</td>'
        +'<td>'+status+'</td><td><b>'+app.llCountdown(it.dep)+'</b></td>'
        +'<td><button class="btn sm dgr" data-lldel="'+it.id+'">Remove</button></td></tr>');
    });
    app.$$("#ll_tbl [data-lldel]").forEach(function(b){
      b.onclick=function(){
        var id = b.dataset.lldel;
        app.LL.items = app.LL.items.filter(function(x){ return x.id!==id; });
        /* llSyncFromRegister would add an invoice's entry straight back */
        if(id.indexOf("LLA")===0){ app.LL.removed = app.LL.removed || []; if(app.LL.removed.indexOf(id) < 0) app.LL.removed.push(id); }
        if(!app.llSave()) return false;
        app.renderLying(); app.toast("Removed from lying list");
      };
    });
  }

  var hb=app.$("ll_hist") ? app.$("ll_hist").querySelector("tbody") : null;
  if(hb){
    hb.innerHTML = app.LL.cleared.length ? "" : '<tr><td colspan="6" style="text-align:center;color:var(--mut)">Nothing cleared yet.</td></tr>';
    app.LL.cleared.slice(0,100).forEach(function(it){
      hb.insertAdjacentHTML("beforeend",
        '<tr style="color:var(--mut)"><td>'+app.fmtDT(it.clearedAt)+'</td><td>'+app.esc(it.awb)+'</td><td>'+it.pcs+'</td>'
        +'<td class="n">'+app.money(it.wt)+'</td><td>'+app.esc(it.fltno)+'</td><td>'+app.fmtDT(it.dep)+'</td></tr>');
    });
  }
  var totW=0, totP=0; app.LL.items.forEach(function(x){ totW+=app.num(x.wt); totP+=app.num(x.pcs); });
  var sumEl=app.$("ll_sum"); if(sumEl) sumEl.innerHTML = app.LL.items.length+" shipments lying &nbsp;|&nbsp; "+totP+" pcs &nbsp;|&nbsp; "+app.money(totW)+" kg";
  var alertEl=app.$("ll_alerts"); if(alertEl) alertEl.innerHTML = app.LL.items.filter(function(x){ return (new Date(x.dep).getTime()-Date.now())/3600000 < 8; })
    .map(function(x){ return '<div class="alert warn"><b>'+app.esc(x.awb)+'</b>&nbsp; departing within '+app.llCountdown(x.dep)+' ('+app.esc(x.fltno)+')</div>'; }).join("");
};
