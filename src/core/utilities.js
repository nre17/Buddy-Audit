import { app } from './runtime.js';

app.$ = function $(id){ return document.getElementById(String(id).replace(/^#/,"")); };

app.$$ = function $$(sel, ctx){ ctx = ctx || document; return Array.prototype.slice.call(ctx.querySelectorAll(sel)); };

app.esc = function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); };

app.num = function num(s){ var v=parseFloat(String(s==null?"":s).replace(/[^0-9.\-]/g,"")); return isNaN(v)?0:v; };

/* Input boundaries must distinguish invalid text from zero. Legacy projections
   still use num(), but new imports and advice validation use this strict reader.
   Conventional comma thousands separators are accepted; decimal commas and
   exponent notation require correction instead of silently changing meaning. */
app.strictNumber = function strictNumber(value){
  if(typeof value === "number") return Number.isFinite(value) ? value : null;
  var text = String(value == null ? "" : value).trim();
  if(!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  var number = Number(text.replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
};

app.pad = function pad(n){ n=Math.round(n); return n<10?"0"+n:""+n; };

app.ymd = function ymd(d){ return d.getFullYear()+"-"+app.pad(d.getMonth()+1)+"-"+app.pad(d.getDate()); };

app.nowLocalDT = function nowLocalDT(){ var d=new Date(); return app.ymd(d)+"T"+app.pad(d.getHours())+":"+app.pad(d.getMinutes()); };

app.money = function money(n){ if(typeof n!=="number" || isNaN(n)) return "0.00"; return n.toFixed(2); };

app.fmtD = function fmtD(iso){
  if(!iso) return "";
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);   /* a stored day, read as that local day, not UTC midnight */
  var d = m ? new Date(+m[1], m[2]-1, +m[3]) : new Date(iso);
  return isNaN(d.getTime()) ? "" : app.pad(d.getDate())+"/"+app.pad(d.getMonth()+1)+"/"+d.getFullYear();
};

app.fmtDT = function fmtDT(iso){ if(!iso) return ""; var d=new Date(iso); return isNaN(d.getTime()) ? "" : app.fmtD(app.ymd(d))+" "+app.pad(d.getHours())+":"+app.pad(d.getMinutes()); };

app.NATIVE_VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

app.dtISO = function dtISO(text, withTime){
  var s = String(text == null ? "" : text).trim(), m, y, mo, d, hh, mi;
  if(!s) return "";
  if((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(s))){
    y = +m[1]; mo = +m[2]; d = +m[3]; hh = m[4]; mi = m[5];            /* ISO, as the code writes it */
  } else if((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?$/.exec(s))){
    d = +m[1]; mo = +m[2]; y = +m[3]; hh = m[4]; mi = m[5];            /* day first, as staff type it */
  } else return null;
  var t = new Date(y, mo-1, d);
  if(t.getFullYear() !== y || t.getMonth() !== mo-1 || t.getDate() !== d) return null;
  var out = y+"-"+app.pad(mo)+"-"+app.pad(d);
  if(!withTime) return out;
  if(hh == null || +hh > 23 || +mi > 59) return null;
  return out+"T"+app.pad(+hh)+":"+mi;
};

app.dtShow = function dtShow(v, withTime){
  var iso = app.dtISO(v, withTime);
  if(!iso) return v == null ? "" : String(v);
  return iso.slice(8,10)+"/"+iso.slice(5,7)+"/"+iso.slice(0,4) + (withTime ? " "+iso.slice(11,16) : "");
};

app.dtMark = function dtMark(el){
  var raw = app.NATIVE_VALUE.get.call(el), bad = raw.trim() !== "" && !app.dtISO(raw, el.dataset.dt === "datetime");
  el.classList[bad ? "add" : "remove"]("dtbad");
  el.title = bad ? "Enter the date as " + el.placeholder : "";
};

app.uaeDateField = function uaeDateField(el){
  var withTime = el.type === "datetime-local", iso = el.value;
  var picker = document.createElement("input");
  picker.type = el.type; picker.className = "dtnative"; picker.tabIndex = -1;
  picker.setAttribute("aria-hidden", "true");
  picker.style.cssText = "position:absolute;right:0;bottom:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none";
  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "dtpick"; btn.tabIndex = -1;
  btn.title = "Pick from the calendar"; btn.innerHTML = "&#128197;";

  el.type = "text";
  el.dataset.dt = withTime ? "datetime" : "date";
  el.placeholder = withTime ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy";
  el.autocomplete = "off";
  el.style.paddingRight = "30px";
  Object.defineProperty(el, "value", {
    configurable: true,
    get: function(){ return app.dtISO(app.NATIVE_VALUE.get.call(el), withTime) || ""; },
    set: function(v){ app.NATIVE_VALUE.set.call(el, app.dtShow(v, withTime)); app.dtMark(el); }
  });
  el.value = iso;
  el.addEventListener("change", function(){
    var v = app.dtISO(app.NATIVE_VALUE.get.call(el), withTime);
    if(v) app.NATIVE_VALUE.set.call(el, app.dtShow(v, withTime));   /* tidy "1/9/2026 8:00" to 01/09/2026 08:00 */
    app.dtMark(el);
  });

  var host = el.parentNode;
  if(host){
    if(getComputedStyle(host).position === "static") host.style.position = "relative";
    host.insertBefore(picker, el.nextSibling);
    host.insertBefore(btn, picker);
  }
  btn.onclick = function(){
    if(el.disabled || el.readOnly) return;
    picker.value = el.value;
    try{ picker.showPicker(); }catch(e){ picker.focus(); }
  };
  picker.addEventListener("change", function(){
    if(!picker.value) return;
    el.value = picker.value;
    ["input", "change"].forEach(function(type){
      var ev = document.createEvent("Event"); ev.initEvent(type, true, true); el.dispatchEvent(ev);
    });
  });
};

app.uaeDateFields = function uaeDateFields(){
  var list = document.querySelectorAll('input[type="date"]:not(.dtnative), input[type="datetime-local"]:not(.dtnative)');
  for(var i = 0; i < list.length; i++) app.uaeDateField(list[i]);
};

app.toast = function toast(msg, kind){ kind = kind || "info"; var t=app.$("toast"); if(!t) return; t.textContent=msg; t.className="toast "+kind; t.style.display="block"; clearTimeout(app.toast._t); app.toast._t=setTimeout(function(){ t.style.display="none"; }, 2600); };

app.stamp = function stamp(){ var d=new Date(); return d.getFullYear()+app.pad(d.getMonth()+1)+app.pad(d.getDate())+"_"+app.pad(d.getHours())+app.pad(d.getMinutes()); };

app.refFor = function refFor(n){ return app.ymd(new Date()) + "/" + app.pad(n); };

app.previewRef = function previewRef(mode){ return app.refFor((app.DB.seq[mode]||0) + 1); };

app.shcTokens = function shcTokens(code){ return String(code || "").toUpperCase().split(/[^A-Z]+/).filter(function(t){ return t; }); };

app.shcEntry = function shcEntry(t){ return app.CFG.shcCodes.filter(function(x){ return x.c===t; })[0]; };

app.shcLabel = function shcLabel(code){ return app.shcTokens(code).map(function(t){ var s=app.shcEntry(t); return s ? s.d : t+" - not in the SHC list"; }).join(", "); };

app.shcClass = function shcClass(code){
  var ks = app.shcTokens(code).map(function(t){ var s=app.shcEntry(t); return s ? s.k : "special"; });
  if(!ks.length) return "general";
  if(ks.indexOf("perishable") >= 0) return "perishable";
  return ks.every(function(k){ return k==="general"; }) ? "general" : "special";
};

app.shcHas = function shcHas(code, c){ return app.shcTokens(code).indexOf(c) >= 0; };

app.shcCodesOf = function shcCodesOf(k){
  var c = app.CFG.shcCodes.filter(function(x){ return x.k===k; }).map(function(x){ return x.c; });
  return c.length > 1 ? c.slice(0, -1).join(", ")+" and "+c[c.length-1] : c.join("");
};

app.calcStorageDays = function calcStorageDays(t1, t2, cls){
  if(!t1 || !t2) return 0;
  var d1 = new Date(t1), d2 = new Date(t2);
  if(isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  var hours = (d2.getTime() - d1.getTime()) / 3600000;
  if(hours <= 0) return 0;
  var free = (app.CFG.freeHours && app.CFG.freeHours[cls] != null) ? app.CFG.freeHours[cls] : 48;
  var excess = hours - free;
  if(excess <= 0) return 0;
  return Math.ceil(excess / 24);
};

app.fld = function fld(label, inner, cls){ cls = cls || ""; if(label==="") return '<div class="f" style="margin-bottom:9px">'+inner+'</div>'; return '<div class="f" style="margin-bottom:9px"><label style="display:block;font-size:10.5px;font-weight:700;color:var(--mut);letter-spacing:.5px;text-transform:uppercase;margin-bottom:3px">'+label+'</label>'+inner+'</div>'; };

app.sel = function sel(id, opts, labels, selval){ var h='<select id="'+app.esc(id)+'" style="border:1px solid var(--line);border-radius:5px;padding:6px 9px;background:#fff;font-size:12px;width:100%;box-sizing:border-box">'; for(var i=0;i<opts.length;i++){ h+='<option value="'+app.esc(opts[i])+'"'+(opts[i]===selval?" selected":"")+'>'+app.esc(labels&&labels[i]?labels[i]:opts[i])+'</option>'; } h+='</select>'; return h; };
