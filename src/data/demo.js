import { app } from '../core/runtime.js';

app.seedDemo = function seedDemo(){
  app.DB.openingBalance = 200; app.DB.openingNote = "From accounts for change";
  app.DB.openingDate = app.ymd(new Date(Date.now()-6*864e5));
  var d = function(back){ return app.ymd(new Date(Date.now()-back*864e5)); };
  /* Demo records. Customer names come from the generated master; the air
     waybill numbers are reserved demo values. See docs/08-data-protection.md. */
  var samples = [
    {mode:"Export", staff:"Counter 1", mawb:"780-30900001", wt:1240, pcs:30,  shc:"GEN", pay:"Cash",         total:236.00, back:3},
    {mode:"Export", staff:"Counter 1", mawb:"780-30900002", wt:157,  pcs:8,   shc:"ELI", pay:"Credit",       total:105.00, back:3},
    {mode:"Import", staff:"Counter 2", mawb:"780-30900003", wt:4975, pcs:120, shc:"PER", pay:"Card",         total:1393.75,back:2},
    {mode:"Import", staff:"Counter 2", mawb:"780-30900004", wt:1698, pcs:124, shc:"PER", pay:"Card",         total:432.25, back:2},
    {mode:"Export", staff:"Counter 3", mawb:"780-30900005", wt:165,  pcs:1,   shc:"GEN", pay:"CASS",         total:80.00,  back:1},
    {mode:"Import", staff:"Counter 3", mawb:"780-30900006", wt:5835, pcs:137, shc:"PER", pay:"Cash",         total:1628.75,back:1},
    {mode:"Export", staff:"Counter 1", mawb:"780-30900007", wt:6661, pcs:30,  shc:"DGR", pay:"Cash + Card",  total:1049.15,back:0, cash:500, card:549.15},
    {mode:"Import", staff:"Counter 4", mawb:"780-30900008", wt:1489, pcs:160, shc:"VAL", pay:"Bank Transfer",total:522.25, back:0}
  ];
  /* sample customers come from the Customer Database, so every sample invoice
     is billed to a customer with a TRN and an address */
  samples.forEach(function(s, i){
    var c = app.CUSTOMERS[(i*211 + 13) % app.CUSTOMERS.length];
    s.cust = c.name;
    s.trn = c.trn;
    s.addr = [c.addr, c.city, c.state].filter(Boolean).join(", ");
  });
  samples.forEach(function(s,i){
    var pay={cash:0,card:0,credit:0,cass:0,bank:0,prepaid:0};
    if(s.pay==="Cash") pay.cash=s.total;
    else if(s.pay==="Card") pay.card=s.total;
    else if(s.pay==="Credit") pay.credit=s.total;
    else if(s.pay==="CASS") pay.cass=s.total;
    else if(s.pay==="Bank Transfer") pay.bank=s.total;
    else if(s.pay==="Cash + Card"){ pay.cash=s.cash; pay.card=s.card; }
    /* local times, as the advice form writes them - toISOString() gives UTC */
    var local = function(ms){ var x = new Date(ms); return app.ymd(x)+"T"+app.pad(x.getHours())+":"+app.pad(x.getMinutes()); };
    var t1 = local(Date.now()-(s.back*864e5)-9*36e5);
    var t2 = local(Date.now()-(s.back*864e5)-2*36e5);
    app.DB.entries.push({
      id:"SEED"+i+Date.now(), type:"invoice", mode:s.mode, ref:d(s.back)+"/"+app.pad(i+1),
      ts:new Date(Date.now()-s.back*864e5).toISOString(), date:d(s.back), staff:s.staff,
      cust:s.cust, billTo:s.cust, billTrn:s.trn, billAddr:s.addr, acct:s.trn, addr:s.addr, mawb:s.mawb, hawb:"", org:s.mode==="Export"?"DWC":"KHI",
      dst:s.mode==="Export"?"NBO":"DWC", nog:app.shcClass(s.shc)==="perishable"?"Fresh Produce":"General Cargo",
      shc:s.shc, fltno:"", fltdate:d(s.back), ata:"", t1:t1, t2:t2,
      cls:app.shcClass(s.shc), wt:s.wt, pcs:s.pcs,
      items:[{id:"demo", d:"Demo consolidated charge line", kind:"qty", qty:1, rate:s.total, total:s.total, min:s.total, charge:s.total, minApplied:false, rem:""}],
      total:s.total, payMode:s.pay, pay:pay, txn:"", rem:"Sample record", rcvby:"",
      storageOverride:false, ovReason:"", hardcopy:i%2===0
    });
  });
  app.DB.entries.push({id:"SEEDHO"+Date.now(), type:"handover", amount:1500, staff:"Counter 1",
    note:"Handed to accounts, sample voucher", date:d(1), ts:new Date(Date.now()-864e5).toISOString()});
  app.DB.customers = [];
  if(!app.save()) return false;
  app.boot(); app.toast("Sample data loaded","ok");
};
