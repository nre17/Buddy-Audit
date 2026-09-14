import { app } from '../core/runtime.js';

app.regRows = function regRows(list){
  var bal = app.num(app.DB.openingBalance);
  var out = [["Date","Ref No.","AWB","HAWB","Type","Customer Name","Staff name","Cash collected",
              "Paid/Handed Over","Cash Balance","Card","Credit","CASS","Bank transfer",
              "Total Sales","Payment Mode","Weight (kg)","Pieces","Remarks","D.O Advice Hard Copy"]];
  out.push([app.DB.openingDate?app.fmtD(app.DB.openingDate):"","","","","","Opening Balance","","","",bal,"","","","","","","","",app.DB.openingNote||"",""]);
  var ids={}; list.forEach(function(e){ ids[e.id]=1; });
  app.DB.entries.forEach(function(e){
    if(e.type==="handover") bal -= app.num(e.amount); else bal += app.num(e.pay.cash);
    if(!ids[e.id]) return;
    if(e.type==="handover"){
      out.push([app.fmtD(e.date),"","","","","Cash handed to accounts",e.staff||"","",app.num(e.amount),
                Math.round(bal*100)/100,"","","","","","","","",e.note||"",""]);
    } else {
      out.push([app.fmtD(e.date), e.ref, e.mawb, e.hawb, e.mode, e.cust, e.staff,
                app.num(e.pay.cash)||"", "", Math.round(bal*100)/100,
                app.num(e.pay.card)||"", app.num(e.pay.credit)||"", app.num(e.pay.cass)||"", app.num(e.pay.bank)||"",
                app.num(e.total), e.payMode, app.num(e.wt)||"", app.num(e.pcs)||"",
                (e.rem||"")+(e.payReason?" [amount differs from total: "+e.payReason+"]":"")+(e.storageOverride?" [storage override: "+(e.ovReason||"no reason")+"]":""),
                e.hardcopy?"Received":""]);
    }
  });
  return out;
};

app.xesc = function xesc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); };

app.CRCT = (function(){
  var t=new Uint32Array(256);
  for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c = (c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; }
  return t;
})();

app.crc32 = function crc32(bytes){
  var c=0xFFFFFFFF;
  for(var i=0;i<bytes.length;i++) c = app.CRCT[(c^bytes[i])&0xFF] ^ (c>>>8);
  return (c^0xFFFFFFFF)>>>0;
};

app.zipBuild = function zipBuild(files){
  var enc = new TextEncoder(), parts=[], central=[], offset=0;
  function u16(n){ return [n&255,(n>>8)&255]; }
  function u32(n){ return [n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255]; }
  files.forEach(function(f){
    var name = enc.encode(f.name), data = enc.encode(f.data), crc = app.crc32(data);
    var lh = [].concat([0x50,0x4b,0x03,0x04], u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                       u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
    parts.push(new Uint8Array(lh), name, data);
    central.push({name:name, crc:crc, size:data.length, off:offset});
    offset += lh.length + name.length + data.length;
  });
  var cdir=[], cdirLen=0;
  central.forEach(function(c){
    var h = [].concat([0x50,0x4b,0x01,0x02], u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                      u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length),
                      u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
    cdir.push(new Uint8Array(h), c.name);
    cdirLen += h.length + c.name.length;
  });
  var end = new Uint8Array([].concat([0x50,0x4b,0x05,0x06], u16(0), u16(0),
            u16(central.length), u16(central.length), u32(cdirLen), u32(offset), u16(0)));
  var all = parts.concat(cdir, [end]);
  var total = all.reduce(function(a,x){ return a+x.length; },0);
  var out = new Uint8Array(total), p=0;
  all.forEach(function(x){ out.set(x,p); p+=x.length; });
  return out;
};

app.colName = function colName(i){ var s=""; i++; while(i>0){ var m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=(i-m-1)/26; } return s; };

app.sheetXml = function sheetXml(rows, widths, headerRow){
  var x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  if(widths && widths.length){
    x += '<cols>';
    widths.forEach(function(w,i){ x += '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>'; });
    x += '</cols>';
  }
  x += '<sheetData>';
  rows.forEach(function(r,ri){
    x += '<row r="'+(ri+1)+'">';
    r.forEach(function(c,ci){
      if(c===""||c==null) return;
      var ref = app.colName(ci)+(ri+1);
      var isHdr = headerRow!==false && ri===0;
      if(typeof c === "number"){
        x += '<c r="'+ref+'" s="'+(isHdr?1:2)+'"><v>'+c+'</v></c>';
      } else {
        x += '<c r="'+ref+'" s="'+(isHdr?1:0)+'" t="inlineStr"><is><t xml:space="preserve">'+app.xesc(c)+'</t></is></c>';
      }
    });
    x += '</row>';
  });
  return x + '</sheetData></worksheet>';
};

app.buildXlsx = function buildXlsx(sheets){
  var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheets.map(function(s,i){ return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("")
    + '</Types>';
  var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
    + sheets.map(function(s,i){ return '<sheet name="'+app.xesc(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>'; }).join("")
    + '</sheets></workbook>';
  var wbr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map(function(s,i){ return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>'; }).join("")
    + '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>';
  var st = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
    + '<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font>'
    + '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF061640"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="3">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '</styleSheet>';
  var files = [
    {name:"[Content_Types].xml", data:ct},
    {name:"_rels/.rels", data:rels},
    {name:"xl/workbook.xml", data:wb},
    {name:"xl/_rels/workbook.xml.rels", data:wbr},
    {name:"xl/styles.xml", data:st}
  ];
  sheets.forEach(function(s,i){
    files.push({name:"xl/worksheets/sheet"+(i+1)+".xml", data:app.sheetXml(s.rows, s.widths)});
  });
  return app.zipBuild(files);
};

app.runningBalances = function runningBalances(){
  var b = { cash: app.cashOnHand(), card: 0, credit: 0, cass: 0, bank: 0, handed: 0, sales: 0, count: 0 };
  app.DB.entries.forEach(function(e){
    if(e.type === "handover"){ b.handed += app.num(e.amount); return; }
    if(!e.pay) return;
    b.card += app.num(e.pay.card); b.credit += app.num(e.pay.credit); b.cass += app.num(e.pay.cass); b.bank += app.num(e.pay.bank);
    b.sales += app.num(e.total); b.count++;
  });
  ["cash","card","credit","cass","bank","handed","sales"].forEach(function(k){ b[k] = Math.round(b[k]*100)/100; });
  return b;
};

app.exportExcel = function exportExcel(list){
  var b = app.runningBalances();
  var bytes = app.buildXlsx([
    { name:"Invoice Register", rows:app.regRows(list),
      widths:[11,12,15,13,9,26,11,13,13,13,11,11,11,13,12,14,11,8,32,15] },
    { name:"Balances", rows:[
        ["Payment Method","Amount (AED)"],
        ["Cash on Hand", b.cash],
        ["Card Total", b.card],
        ["Credit Total", b.credit],
        ["CASS Total", b.cass],
        ["Bank Transfer Total", b.bank],
        ["Total Handed to Accounts", b.handed],
        ["Total Sales", b.sales],
        ["Invoice Count", b.count],
        ["Opening Float", app.num(app.DB.openingBalance)],
        ["Generated", app.fmtDT(new Date().toISOString())]
      ], widths:[28,16] }
  ]);
  var blob = new Blob([bytes], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download="SolitAir_Invoice_Register_"+app.stamp()+".xlsx";
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  app.toast("Excel register exported", "ok");
};

app.exportCsv = function exportCsv(list){
  var rows = app.regRows(list);
  var csv = rows.map(function(r){
    return r.map(function(c){
      var s=String(c==null?"":c);
      // Numeric values stay numeric; user text cannot become a spreadsheet formula.
      if (typeof c === 'string' && (/^[\s\u0000-\u001f]*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s))) s = "'" + s;
      return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
    }).join(",");
  }).join("\r\n");
  app.dl("﻿"+csv, "SolitAir_Invoice_Register_"+app.stamp()+".csv", "text/csv");
  app.toast("CSV exported", "ok");
};

app.dl = function dl(content, name, mime){
  var b = new Blob([content], {type:mime+";charset=utf-8"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
};
