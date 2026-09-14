import { app } from '../core/runtime.js';

app.safeLogoSource = function safeLogoSource(value){
  return typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value)
    ? value : app.LOGO_PRINT;
};

app.billingOf = function billingOf(e){
  return e.billTo !== undefined
    ? { name: e.billTo, trn: e.billTrn, addr: e.billAddr }
    : { name: e.cust, trn: e.acct, addr: e.addr };
};

app.docCopy = function docCopy(e, copyName){
  var isExp = e.mode==="Export";
  var C = app.CFG.company;
  var bill = app.billingOf(e);
  var h = '<div class="doc adv">';
  var mark = '<div class="logo"><img src="'+app.esc(app.safeLogoSource(app.DB.logo))+'" alt="SolitAir"></div>';
  h += '<div class="dh">' + mark
     + '<div style="text-align:right;font-size:8.5px;line-height:1.35">'+app.esc(C.name)+'<br>'+app.esc(C.addr)
     + '<br>Contact: '+app.esc(C.contact)+'<br>TRN: '+app.esc(C.trn)+'</div></div>';
  h += '<div class="greenrule"></div>';
  h += '<div class="copyname">'+app.esc(copyName)+'</div>';
  h += '<div class="title">'+(isExp?"Acceptance Charges Advice  -  Export":"Delivery Order Advice  -  Import")+'</div>';

  h += '<table class="meta"><tbody>'
     + app.row2("Ref No.", e.ref, "Date Issued", app.fmtDT(e.ts))
     + app.row2("Billing Party", bill.name, "Billing Party TRN", bill.trn)
     + app.row2("Billing Party Address", bill.addr, "Payment Mode", e.payMode + (e.payMode==="Cash + Card" && !e.payReason ? "  (Cash "+app.money(e.pay.cash)+" / Card "+app.money(e.pay.card)+")" : ""))
     + app.row2("MAWB #", e.mawb, "HAWB #", e.hawb + (e.hawbqty ? "  (Qty: "+e.hawbqty+")" : ""))
     + app.row2("Origin", e.org, "Destination", e.dst)
     + app.row2("Nature of Goods", e.nog, "SHC Code", (e.shc||"")+(e.shc?"  ("+app.shcLabel(e.shc)+")":""))
     + app.row2("Flight No.", e.fltno, "Gross Weight / Pieces", app.money(e.wt)+" kg  /  "+(e.pcs||0)+" pcs")
     + (isExp
        ? app.row2("Acceptance Time &amp; Date (RCS)", app.fmtDT(e.t1), "Departure Time &amp; Date", app.fmtDT(e.t2))
        : app.row2("RCF Time &amp; Date (Rcvd at SH Facility)", app.fmtDT(e.t1), "Delivery Time &amp; Date", app.fmtDT(e.t2)))
     + (isExp ? "" : app.row2("Flight ATA", app.fmtDT(e.ata), "Handling Class", (e.shc?e.shc+" - ":"")+({general:"General Cargo",special:"Special Cargo",perishable:"Perishable"}[e.cls]||"")))
     + '</tbody></table>';

  h += '<table class="items" style="margin-top:4px"><thead><tr>'
     + '<th style="text-align:left">Service Description</th><th style="width:52px">Rate</th>'
     + '<th style="width:60px">Quantity</th><th style="width:62px">Total</th>'
     + '<th style="width:52px">Min Chg</th><th style="width:72px">Total Chargeable</th></tr></thead><tbody>';
  e.items.forEach(function(i){
    if(i.kind==="days"){
      h += '<tr><td>'+app.esc(i.d)+'</td><td class="n">-</td><td class="n">'+app.esc(i.qty)+'</td>'
         + '<td class="n">days</td><td class="n">-</td><td class="n">-</td></tr>';
      return;
    }
    if(i.kind==="misc"){
      h += '<tr><td>'+app.esc(i.d)+(i.rem?' - '+app.esc(i.rem):"")+'</td><td class="n">-</td><td class="n">-</td>'
         + '<td class="n">-</td><td class="n">-</td><td class="n">'+app.money(i.charge)+'</td></tr>';
      return;
    }
    h += '<tr><td>'+app.esc(i.d)+'</td><td class="n">'+app.money(i.rate)+'</td><td class="n">'+app.money(i.qty)+'</td>'
       + '<td class="n">'+app.money(i.total)+'</td><td class="n">'+app.money(i.min)+'</td>'
       + '<td class="n"><b>'+app.money(i.charge)+'</b></td></tr>';
  });
  h += '<tr class="tot"><td colspan="5" style="text-align:right">TOTAL CHARGES (AED)</td><td class="n">'+app.money(e.total)+'</td></tr>';
  h += '</tbody></table>';

  if(e.rem) h += '<div style="font-size:9px;margin-top:3px"><b>Remarks:</b> '+app.esc(e.rem)+'</div>';
  if(e.storageOverride) h += '<div style="font-size:9px;margin-top:2px"><b>Storage manually adjusted.</b> '+app.esc(e.ovReason||"")+'</div>';
  if(e.txn) h += '<div style="font-size:9px;margin-top:2px"><b>Transaction Ref:</b> '+app.esc(e.txn)+'</div>';

  h += app.bankBlock();
  h += '<table class="sig" style="margin-top:5px"><tbody><tr>'
     + '<td style="width:50%"><b>SolitAir Authorization</b><br>Name: '+app.esc(e.staff)+'<br>Designation: Cargo Services Officer<br>Sign &amp; Stamp:</td>'
     + '<td><b>Customer Authorization</b><br>Name: '+app.esc(e.rcvby||"")+'<br>Mob No:<br>Sign:</td>'
     + '</tr></tbody></table>';

  if(e.payMode==="Card" || e.payMode==="Cash + Card"){
    h += '<div style="border:1px dashed #666;height:22mm;margin-top:4px;font-size:8.5px;padding:2px 4px">Credit Card Slip Copy</div>';
  }
  h += '<div class="foot"><span>'+(isExp?"CGS-GND-F037":"CGS-GND-F038")+' &nbsp; Rev-0</span>'
     + '<span>'+app.esc(e.ref)+'</span><span>Printed '+app.fmtDT(new Date().toISOString())+'</span></div>';
  h += '</div>';
  return h;
};

app.bankBlock = function bankBlock(){
  var B = app.CFG.bank;
  var h = '<table class="bank"><colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col style="width:28%"></colgroup><tbody>'
    + '<tr><td class="bh" colspan="4">Bank Details for Payment</td></tr>'
    + '<tr><td class="bl">Account Name (both accounts):</td><td class="bv bname" colspan="3">'+app.esc(B.name)+'</td></tr>'
    + '<tr><td class="bacc" colspan="2">AED Account</td><td class="bacc" colspan="2">USD Account</td></tr>';
  app.BANK_FIELDS.forEach(function(f){
    h += '<tr><td class="bl">'+app.esc(f[1])+':</td><td class="bv">'+app.esc(B.aed[f[0]]||"")+'</td>'
       + '<td class="bl">'+app.esc(f[1])+':</td><td class="bv">'+app.esc(B.usd[f[0]]||"")+'</td></tr>';
  });
  return h + '</tbody></table>';
};

app.row2 = function row2(l1,v1,l2,v2){
  return '<tr><td class="l">'+l1+'</td><td>'+app.esc(v1||"")+'</td><td class="l">'+l2+'</td><td>'+app.esc(v2||"")+'</td></tr>';
};

app.printAdvice = function printAdvice(e, previewOnly){
  var copies = e.mode==="Export"
    ? ["Original Copy - Customer","Operations Copy","Accounts Copy"]
    : ["Original Copy - Customer","Accounts Copy"];
  var html = copies.map(function(c,i){
    return '<div class="'+(i<copies.length-1?"pagebreak":"")+'">'+app.docCopy(e,c)+'</div>';
  }).join("");
  app.$("#printarea").innerHTML = html;
  if(previewOnly){
    app.modal("Charge Advice Preview - "+e.ref,
      '<div style="max-height:60vh;overflow:auto;background:#fff;border:1px solid #ccd5df;padding:8px">'+app.docCopy(e,"Original Copy - Customer")+'</div>',
      [{label:"Close"},{label:"Print all copies", cls:"pri", fn:function(){ setTimeout(function(){ window.print(); },120); }}]);
    var modalEl=app.$("modal"); var box = modalEl ? modalEl.querySelector(".box") : null; if(box) box.style.maxWidth="820px";
    return;
  }
  setTimeout(function(){ window.print(); }, 150);
};
