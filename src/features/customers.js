import { app } from '../core/runtime.js';

app.seedCustomers = function seedCustomers(){
  // The generated master is a source asset, not part of the saved ledger.
  app.DB.customers = [];
};

app.refreshCustList = function refreshCustList(){
  /* refresh datalists if the forms are already built */
  ["a_custlist","i_custlist"].forEach(function(id){
    var dl = document.getElementById(id);
    if(dl){
      dl.innerHTML = app.CUSTOMERS.map(function(c){ return '<option value="'+app.esc(c.name)+'">'; }).join("");
    }
  });
};

app.resolveCustomer = function resolveCustomer(name){
  if(!name) return null;
  var hit = null;
  for(var i=0;i<app.CUSTOMERS.length;i++){
    if(app.CUSTOMERS[i].name === name){ hit = app.CUSTOMERS[i]; break; }
  }
  return hit;
};

app.CUST_SHOW = 100;

app.buildCustomers = function buildCustomers(){
  var pg = app.$("p-customers");
  if(!pg) return;
  pg.innerHTML =
      '<div class="panel"><h3>Customer Database</h3><div class="body">'
    + '<p class="hint" style="margin:0 0 8px">Demo data for this prototype: ' + app.CUSTOMERS.length.toLocaleString("en-US") + ' fictional companies. '
    + 'The AWB owner and billing party pickers on the advices use this list, and the billing party&rsquo;s TRN and address are filled in from it. '
    + 'In the ERP, the real customer master takes its place.</p>'
    + '<div class="f" style="max-width:380px;margin-bottom:9px"><input id="cu_filter" placeholder="Search name, TRN, city, country or email"></div>'
    + '<div class="hint" id="cu_count" style="margin-bottom:6px"></div>'
    + '<div id="cu_list"></div>'
    + '</div></div>';

  function render(){
    var q = app.$("cu_filter").value.toLowerCase().trim();
    var hits = !q ? app.CUSTOMERS : app.CUSTOMERS.filter(function(c){
      return [c.name, c.trn, c.addr, c.city, c.state, c.country, c.email].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var shown = hits.slice(0, app.CUST_SHOW), fmt = function(n){ return n.toLocaleString("en-US"); };
    app.$("cu_count").textContent = !hits.length ? "No customer matches that search."
      : "Showing " + fmt(shown.length) + " of " + fmt(hits.length) + (hits.length > shown.length ? ". Search to narrow the list." : ".");
    app.$("cu_list").innerHTML = !shown.length ? "" :
        '<div class="scrolltable" style="max-height:65vh"><table class="chg" style="width:100%"><thead><tr>'
      + '<th>No.</th><th style="text-align:left">Customer</th><th>TRN</th><th style="text-align:left">Address</th><th>City</th>'
      + '<th>Country</th><th>Payment</th><th>Phone</th><th>Mobile</th><th style="text-align:left">Email</th>'
      + '</tr></thead><tbody>'
      + shown.map(function(c){
          return '<tr><td class="n">' + app.esc(c.no) + '</td><td style="text-align:left">' + app.esc(c.name) + '</td><td>' + app.esc(c.trn) + '</td>'
            + '<td style="text-align:left">' + app.esc(c.addr) + '</td><td>' + app.esc(c.city) + '</td><td>' + app.esc(c.country) + '</td>'
            + '<td>' + app.esc(c.pay) + '</td><td>' + app.esc(c.phone) + '</td><td>' + app.esc(c.mobile) + '</td>'
            + '<td style="text-align:left">' + app.esc(c.email) + '</td></tr>';
        }).join("")
      + '</tbody></table></div>';
  }
  app.$("cu_filter").addEventListener("input", render);
  render();
};

app.fillBilling = function fillBilling(p, name){
  var c = app.resolveCustomer(name), bill = app.$(p+"_bill");
  if(c){
    app.$(p+"_bill_trn").value = c.trn || "";
    app.$(p+"_bill_addr").value = [c.addr, c.city, c.state].filter(Boolean).join(", ");
    bill.dataset.filledFor = c.name;
    return true;
  }
  if(bill.dataset.filledFor && bill.dataset.filledFor !== name){
    app.$(p+"_bill_trn").value = "";
    app.$(p+"_bill_addr").value = "";
    delete bill.dataset.filledFor;
  }
  return false;
};

app.wireBillingParty = function wireBillingParty(mode){
  var p = mode==="export" ? "a" : "i", bill = app.$(p+"_bill");
  if(!bill) return;
  bill.addEventListener("input", function(){ app.fillBilling(p, bill.value.trim()); });
  app.$(p+"_bill_same").onclick = function(){
    var owner = app.$(p+"_cust").value.trim();
    if(!owner){ app.toast("Enter the AWB, or the AWB owner, first","warn"); return; }
    bill.value = owner;
    if(!app.fillBilling(p, owner)){
      app.$(p+"_bill_trn").value = "";
      app.$(p+"_bill_addr").value = "";
      app.toast("The AWB owner is not in the customer master. Enter the billing TRN and address.","warn");
    }
  };
};
