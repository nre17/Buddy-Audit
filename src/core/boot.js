import { app } from './runtime.js';

app.fillStaff = function fillStaff(){
  var s=app.$("staff");
  if(!s) return;
  s.innerHTML = app.CFG.staff.map(function(x){ return '<option'+(x===app.DB.staff?' selected':'')+'>'+app.esc(x)+'</option>'; }).join("");
  if(!app.DB.staff){ app.DB.staff = app.CFG.staff[0]; }
  s.value = app.DB.staff;
  s.onchange = function(){
    app.DB.staff = s.value;
    if(!app.save()){ s.value = app.DB.staff; return; }
    ["a_staff","i_staff"].forEach(function(id){ var el = app.$(id); if(el) el.value = app.DB.staff; });
    app.toast("Counter staff set to "+app.DB.staff);
  };
};

app.applyLogo = function applyLogo(){
  var img=app.$("brandLogo"), txt=app.$("brandText");
  if(img){
    img.src = app.DB.logo || app.LOGO_LIGHT;
    img.style.display = "block";
  }
  if(txt){
    txt.innerHTML = '<span>Imports/Exports</span>';
    txt.style.display = "block";
  }
};

app.applySiteOverrides = function applySiteOverrides(){
  if(app.DB.company){
    if(app.DB.company.trn)     app.CFG.company.trn     = app.DB.company.trn;
    if(app.DB.company.contact) app.CFG.company.contact = app.DB.company.contact;
    if(app.DB.company.name)    app.CFG.company.name    = app.DB.company.name;
    if(app.DB.company.addr)    app.CFG.company.addr    = app.DB.company.addr;
  }
  /* bank details: the shipped demo values, with whatever this machine has saved
     laid over them field by field */
  app.CFG.bank = JSON.parse(JSON.stringify(app.CFG_SHIPPED.bank));
  if(app.DB.bank){
    var b = app.bankFields(app.DB.bank);
    if(b.name) app.CFG.bank.name = b.name;
    ["aed","usd"].forEach(function(cur){
      app.BANK_FIELDS.forEach(function(f){ if(b[cur][f[0]]) app.CFG.bank[cur][f[0]] = b[cur][f[0]]; });
    });
  }
};

app.BANK_FIELDS = [["acc","Account No."], ["iban","IBAN"], ["bic","BIC / SWIFT"], ["bank","Bank"], ["branch","Branch"]];

app.bankFields = function bankFields(saved){
  var out = { name: "", aed: {}, usd: {} };
  var clean = function(v){ v = String(v == null ? "" : v).trim(); return /^not configured$/i.test(v) ? "" : v; };
  out.name = clean(saved.name);
  ["aed","usd"].forEach(function(cur){
    var side = saved[cur];
    if(Array.isArray(side)){
      side.forEach(function(line){
        var t = String(line), v = clean(t.replace(/^[^:#]*[:#]\s*/, ""));
        if(/^\s*acc(ount)?\s*name/i.test(t)){ if(!out.name) out.name = v; }
        else if(/^\s*acc(ount)?\s*(#|no|num)/i.test(t)) out[cur].acc = v;
        else if(/^\s*iban/i.test(t)) out[cur].iban = v;
        else if(/^\s*(bic|swift)/i.test(t)) out[cur].bic = v;
        else if(/^\s*branch/i.test(t)) out[cur].branch = v;
        else if(/^\s*bank/i.test(t)) out[cur].bank = v;
      });
    } else if(side){
      app.BANK_FIELDS.forEach(function(f){ out[cur][f[0]] = clean(side[f[0]]); });
    }
  });
  return out;
};

app.boot = function boot(){
  app.applySiteOverrides();
  if(app.DB.staffList && app.DB.staffList.length) app.CFG.staff = app.DB.staffList;
  if(app.DB.freeHours){ app.CFG.freeHours.general = app.DB.freeHours.general; app.CFG.freeHours.special = app.DB.freeHours.general; app.CFG.freeHours.perishable = app.DB.freeHours.perishable; }
  app.applyRateOverrides();
  app.applyLogo();
  app.seedCustomers();          // keep the generated master outside saved workspace data
  app.refreshCustList();
  app.fillStaff();
  app.shLoad();
  app.buildShipments();
  app.buildCustomers();
  app.buildAdvice("export");
  app.buildAdvice("import");
  app.llLoad();
  app.buildLying();
  app.buildRegister();
  app.buildHandover();
  app.buildDash();
  app.buildAdmin();
  app.buildSecurity();
  app.refreshChip();
};

export function startApplication() {
app.$$(".tabs button").forEach(function(b){
  b.onclick = function(){
    app.$$(".tabs button").forEach(function(x){ x.classList.remove("on"); });
    b.classList.add("on");
    app.$$(".page").forEach(function(p){ p.classList.remove("on"); });
    app.$("#p-"+b.dataset.p).classList.add("on");
    if(b.dataset.p==="dash") app.renderDash();
    if(b.dataset.p==="handover") app.renderHandover();
    if(b.dataset.p==="register") app.renderRegister();
    if(b.dataset.p==="lying") app.renderLying();
    if(b.dataset.p==="security") app.renderSecurity();
  };
});

setInterval(function(){
  if(app.$("#ll_tbl")) app.renderLying();
}, 30000);

document.addEventListener("keydown", function(ev){
  if((ev.ctrlKey||ev.metaKey) && ev.key.toLowerCase()==="s"){
    var pg = document.querySelector(".page.on");   /* $() looks up ids only (audit A-06) */
    if(pg && (pg.id==="p-export"||pg.id==="p-import")){
      ev.preventDefault(); app.saveAdvice(pg.id==="p-export"?"export":"import");
    }
  }
  if(ev.key==="Escape") app.closeModal();
});

app.load();

new MutationObserver(app.uaeDateFields).observe(document.body, {childList:true, subtree:true});

app.boot();

app.uaeDateFields();

}
