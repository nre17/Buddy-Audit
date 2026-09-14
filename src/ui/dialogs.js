import { app } from '../core/runtime.js';

app.modal = function modal(title, bodyHTML, buttons){
  var m=app.$("modal"); if(!m) return;
  app.$("mTitle").textContent = title || "";
  app.$("mBody").innerHTML = bodyHTML || "";
  var foot = app.$("mFoot"); foot.innerHTML = "";
  if(buttons && buttons.length){
    buttons.forEach(function(b){
      var el=document.createElement("button");
      el.textContent=b.label||""; el.className="btn"+(b.cls?" "+b.cls:"");
      /* an action that returns false (a validation error) keeps the dialog open */
      el.onclick=function(){ if(b.fn && b.fn() === false) return; app.closeModal(); };
      foot.appendChild(el);
    });
  }
  m.style.display="flex";
};

app.closeModal = function closeModal(){ var m=app.$("modal"); if(m) m.style.display="none"; };

app.refreshChip = function refreshChip(){ var c=app.$("cashchip"); if(!c) return; c.textContent=app.money(app.cashOnHand()); };

app.cashOnHand = function cashOnHand(){
  /* mirrors the running balance shown in the Invoice Register:
     opening float + cash actually collected on invoices - cash handed over to accounts */
  var t = app.num(app.DB.openingBalance);
  app.DB.entries.forEach(function(e){
    if(e.type==="handover") t -= app.num(e.amount);
    else if(e.pay) t += app.num(e.pay.cash);
  });
  return t;
};
