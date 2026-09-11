/* AWB-first entry on the advice forms: the Shipment Database tab, the AWB
   lookup, and the billing party. Customer names come from the demo master
   through the harness; no spec types one. */

/** One manifest row, in the counter sheet's column order (see MANIFEST_HEADER). */
function row(awb, org, dst, flight, departs, rcf, shc, goods, pcs, wt, customer) {
  return [awb, org, dst, flight, departs, rcf, shc, goods, pcs, wt, customer];
}
const exportRow = (h) =>
  row("780-30200001", "DWC", "ISU", "ZZ 123", "09/10/2026, 02:15 AM", "", "GEN", "Auto Spare Parts", "25", "", h.SAMPLE_CUSTOMER.name);
const importRow = (h) =>
  row("780-30200002", "KWI", "DWC", "ZZ 125", "", "09/11/2026, 12:43 AM", "PER", "Fresh Fruits and Vegetables", "220", "2640", h.OTHER_CUSTOMER.name);

/** Open the app with these rows pasted into the Shipment Database. */
async function withManifest(h, rows) {
  const app = await h.openApp();
  const toast = await h.importManifest(app.page, h.manifestText(h.MANIFEST_HEADER, rows));
  return { app, toast };
}

const val = (page, id) => page.$eval("#" + id, (e) => e.value);
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const addressOf = (c) => [c.addr, c.city, c.state].filter(Boolean).join(", ");

module.exports = {
  name: "AWB-first entry & billing party",
  tests: {
    "the Shipment Database tab comes first and both advices start with the AWB": async (h) => {
      const app = await h.openApp();
      try {
        h.eq(await app.page.$eval(".tabs button", (b) => b.textContent.trim()), "Shipment Database", "first tab");
        h.eq(await app.page.$eval(".page.on", (p) => p.id), "p-export", "the counter still opens on the Export Advice");
        h.eq(await app.page.$eval("#p-export .panel .body input", (e) => e.id), "a_mawb", "export form starts with the AWB");
        h.eq(await app.page.$eval("#p-import .panel .body input", (e) => e.id), "i_mawb", "import form starts with the AWB");
        h.contains(await text(app.page, "#a_awbstatus"), "Shipment Database is empty", "an empty database is explained");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "TRN and address appear once, in the billing party section at the bottom": async (h) => {
      const app = await h.openApp();
      try {
        const r = await app.page.evaluate(() => {
          const labels = [...document.querySelectorAll("#p-export label")].map((l) => l.textContent.toUpperCase());
          const top = (id) => document.getElementById(id).getBoundingClientRect().top;
          return {
            trn: labels.filter((t) => t.indexOf("TRN") >= 0).length,
            addr: labels.filter((t) => t.indexOf("ADDRESS") >= 0).length,
            oldFields: !!document.getElementById("a_acct") || !!document.getElementById("a_addr"),
            inBand: !!document.querySelector(".billband #a_bill_trn") && !!document.querySelector(".billband #a_bill_addr"),
            belowDetails: top("a_nog") < top("a_bill"),
            aboveCharges: top("a_bill") < top("a_lines"),
          };
        });
        h.eq(r.trn, 1, "exactly one TRN field on the form");
        h.eq(r.addr, 1, "exactly one address field on the form");
        h.assert(!r.oldFields, "the customer TRN and address fields at the top are gone");
        h.assert(r.inBand, "the TRN and address sit in the billing party section");
        h.assert(r.belowDetails && r.aboveCharges, "billing party comes after the shipment details, before the charges");
      } finally { await app.close(); }
    },

    "typing an export AWB fills the advice from the pasted manifest": async (h) => {
      const { app, toast } = await withManifest(h, [exportRow(h), importRow(h)]);
      try {
        h.contains(toast, "Imported 2 shipments", "import toast");
        await h.tab(app.page, "Export Advice");
        const acceptanceBefore = await val(app.page, "a_t1");
        await app.page.fill("#a_mawb", "780-30200001");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_cust"), h.SAMPLE_CUSTOMER.name, "AWB owner");
        h.eq(await val(app.page, "a_org"), "DWC", "origin");
        h.eq(await val(app.page, "a_dst"), "ISU", "destination");
        h.eq(await val(app.page, "a_fltno"), "ZZ 123", "flight number");
        h.eq(await val(app.page, "a_t2"), "2026-09-10T02:15", "departure time, read month-first and from 12-hour");
        h.eq(await val(app.page, "a_t1"), acceptanceBefore, "the acceptance time is the counter's own and is untouched");
        h.eq(await val(app.page, "a_shc"), "GEN", "SHC");
        h.eq(await val(app.page, "a_nog"), "Auto Spare Parts", "nature of goods");
        h.eq(await val(app.page, "a_pcs"), "25", "pieces");
        h.eq(await val(app.page, "a_wt"), "", "a weight missing from the manifest stays blank for the counter");
        h.contains(await text(app.page, "#a_awbstatus"), "gross weight is not on the manifest", "status explains the blank weight");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "typing an import AWB fills the RCF time, not the delivery time": async (h) => {
      const { app } = await withManifest(h, [exportRow(h), importRow(h)]);
      try {
        await h.tab(app.page, "Import Advice");
        const deliveryBefore = await val(app.page, "i_t2");
        await app.page.fill("#i_mawb", "780-30200002");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "i_cust"), h.OTHER_CUSTOMER.name, "AWB owner");
        h.eq(await val(app.page, "i_org"), "KWI", "origin");
        h.eq(await val(app.page, "i_dst"), "DWC", "destination");
        h.eq(await val(app.page, "i_t1"), "2026-09-11T00:43", "RCF time; 12:43 AM is 00:43");
        h.eq(await val(app.page, "i_t2"), deliveryBefore, "the delivery time is untouched");
        h.eq(await val(app.page, "i_shc"), "PER", "SHC");
        h.eq(await val(app.page, "i_pcs"), "220", "pieces");
        h.eq(await val(app.page, "i_wt"), "2640", "gross weight");
      } finally { await app.close(); }
    },

    "a CSV with shuffled columns and quoted dates imports the same way": async (h) => {
      const app = await h.openApp();
      try {
        const csv = 'Customer,Gross Weight,AWB,SHC Code,"Departure date and Time (Export)"\n'
          + '"' + h.SAMPLE_CUSTOMER.name + '",512.5,780-30200011,DGR,"09/25/2026, 06:40 PM"\n';
        await h.importManifest(app.page, csv);
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30200011");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_cust"), h.SAMPLE_CUSTOMER.name, "AWB owner");
        h.eq(await val(app.page, "a_wt"), "512.5", "gross weight");
        h.eq(await val(app.page, "a_shc"), "DGR", "SHC");
        h.eq(await val(app.page, "a_t2"), "2026-09-25T18:40", "a day above 12 settles the order as month-first");
      } finally { await app.close(); }
    },

    "day-first dates are read day-first": async (h) => {
      const { app } = await withManifest(h, [
        row("780-30200021", "DWC", "NBO", "ZZ 140", "13/09/2026 14:30", "", "GEN", "Machinery Parts", "10", "100", h.SAMPLE_CUSTOMER.name),
      ]);
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30200021");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_t2"), "2026-09-13T14:30", "13 cannot be a month, so the sheet is day-first");
      } finally { await app.close(); }
    },

    "an uncertain date order is flagged and can be set before importing": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Shipment Database");
        await app.page.fill("#sh_paste", h.manifestText(h.MANIFEST_HEADER, [
          row("780-30200031", "DWC", "MCT", "ZZ 150", "05/09/2026 08:00", "", "GEN", "Household Goods", "4", "40", h.SAMPLE_CUSTOMER.name),
        ]));
        await app.page.click("#sh_preview");
        await app.page.waitForTimeout(150);
        h.contains(await text(app.page, "#sh_result"), "does not make this certain", "an undecidable order is flagged");
        await app.page.selectOption("#sh_order", "DMY");
        await app.page.waitForTimeout(150);
        const preview = await text(app.page, "#sh_result");
        h.contains(preview, "Set by you", "the choice is acknowledged");
        h.contains(preview, "5 Sep 2026, 08:00", "the preview writes the date out in words");
        await app.page.click("#sh_import");
        await app.page.waitForTimeout(250);
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30200031");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_t2"), "2026-09-05T08:00", "the chosen order is what gets imported");
      } finally { await app.close(); }
    },

    "manifest dates: Excel serials, 12 AM and 12 PM, year-first, impossible dates": async (h) => {
      const app = await h.openApp();
      try {
        const r = await app.page.evaluate(() => ({
          serial: shDateValue(shDateParts("46275.09375"), "DMY"),
          noon: shDateValue(shDateParts("09/10/2026 12:30 PM"), "MDY"),
          midnight: shDateValue(shDateParts("09/10/2026 12:05 AM"), "MDY"),
          yearFirst: shDateValue(shDateParts("2026-09-10 02:15"), "MDY"),
          impossible: shDateValue(shDateParts("31/02/2026 10:00"), "DMY"),
        }));
        h.eq(r.serial, "2026-09-10T02:15", "Excel serial number");
        h.eq(r.noon, "2026-09-10T12:30", "12:30 PM");
        h.eq(r.midnight, "2026-09-10T00:05", "12:05 AM");
        h.eq(r.yearFirst, "2026-09-10T02:15", "year-first ignores the day/month setting");
        h.eq(r.impossible, "", "31 February is rejected, not rolled into March");
      } finally { await app.close(); }
    },

    "the AWB matches without its hyphen, and never on a prefix while typing": async (h) => {
      const { app } = await withManifest(h, [exportRow(h)]);
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "78030200001");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_cust"), h.SAMPLE_CUSTOMER.name, "digits alone find the shipment");

        const r = await app.page.evaluate(() => {
          window.SH = { items: [{ key: "7803020004" }, { key: "78030200041" }] };
          return {
            typing: shFind("780-3020004", true),
            committed: !!shFind("780-3020004", false),
            longer: !!shFind("780-30200041", true),
          };
        });
        h.eq(r.typing, null, "while typing, a key that is a prefix of another is not a match yet");
        h.assert(r.committed, "once committed, the exact key matches");
        h.assert(r.longer, "the longer key matches on its own");
      } finally { await app.close(); }
    },

    "typing part of an AWB suggests loaded shipments, and clicking one fills the advice": async (h) => {
      const third = row("780-30200003", "DWC", "NBO", "ZZ 127", "09/10/2026, 06:40 AM", "", "GEN", "Machinery Parts", "12", "300", h.OTHER_CUSTOMER.name);
      const { app } = await withManifest(h, [exportRow(h), importRow(h), third]);
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-302");
        await app.page.waitForTimeout(150);
        const shown = await app.page.$$eval("#a_awbsuggest button", (b) => b.map((x) => x.textContent));
        h.eq(shown.length, 3, "every loaded AWB starting with those digits is suggested");
        h.contains(shown.join("|"), h.SAMPLE_CUSTOMER.name, "a suggestion shows the AWB owner");
        h.eq(await val(app.page, "a_cust"), "", "nothing is filled in until one is chosen");

        await app.page.click('#a_awbsuggest button:has-text("780-30200001")');
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_mawb"), "780-30200001", "the AWB is completed");
        h.eq(await val(app.page, "a_cust"), h.SAMPLE_CUSTOMER.name, "and its shipment filled in");
        h.eq(await val(app.page, "a_pcs"), "25", "pieces too");
        h.eq(await app.page.$eval("#a_awbsuggest", (e) => getComputedStyle(e).display), "none", "the list closes");

        await app.page.fill("#a_mawb", "780-302");
        await app.page.waitForTimeout(150);
        await app.page.click('#a_awbsuggest button:has-text("780-30200002")');
        await app.page.waitForTimeout(200);
        h.contains(await text(app.page, "#a_awbstatus"), "import shipment", "an import picked on the export advice gets the wrong-direction notice");
        h.eq(await val(app.page, "a_cust"), "", "and the export details are cleared");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "suggestions match the end of an AWB, work from the keyboard, and close when done": async (h) => {
      const { app } = await withManifest(h, [exportRow(h), importRow(h)]);
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "0001");
        await app.page.waitForTimeout(150);
        const shown = await app.page.$$eval("#a_awbsuggest button", (b) => b.map((x) => x.textContent));
        h.eq(shown.length, 1, "the last digits of an AWB find it");
        h.contains(shown[0], "780-30200001", "the right one");
        await app.page.press("#a_mawb", "ArrowDown");
        await app.page.press("#a_mawb", "Enter");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_cust"), h.SAMPLE_CUSTOMER.name, "arrow down and Enter picks it");

        await app.page.fill("#a_mawb", "780-302");
        await app.page.waitForTimeout(150);
        h.eq(await app.page.$eval("#a_awbsuggest", (e) => getComputedStyle(e).display), "block", "open while typing");
        await app.page.press("#a_mawb", "Escape");
        h.eq(await app.page.$eval("#a_awbsuggest", (e) => getComputedStyle(e).display), "none", "Escape closes it");

        await app.page.fill("#a_mawb", "780-30200001");
        await app.page.waitForTimeout(150);
        h.eq(await app.page.$eval("#a_awbsuggest", (e) => getComputedStyle(e).display), "none", "an AWB typed in full closes the list");
        h.eq(await val(app.page, "a_pcs"), "25", "and fills in without a click");
      } finally { await app.close(); }
    },

    "an AWB of the other direction blocks the advice from being saved, previewed or printed": async (h) => {
      const { app } = await withManifest(h, [exportRow(h), importRow(h)]);
      try {
        const entries = async () => (await h.db(app.page)).entries.length;
        const toastAfter = async (sel) => {
          await app.page.evaluate(() => { document.getElementById("toast").textContent = ""; });
          await app.page.click(sel);
          await app.page.waitForTimeout(250);
          return text(app.page, "#toast");
        };
        // the rendered colour, not just the class: the field's inline styles once
        // hid the red even though the class was set (regression)
        const marked = (id) => app.page.$eval("#" + id, (e) =>
          e.closest(".f").classList.contains("bad") && getComputedStyle(e).borderTopColor === "rgb(220, 38, 38)");

        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30200002");
        await app.page.waitForTimeout(200);
        h.contains(await text(app.page, "#a_awbstatus"), "Blocked", "the notice says the advice is blocked");
        h.assert(await marked("a_mawb"), "the AWB field is marked");
        // details typed in by hand must not get round the block
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, wt: 100, pcs: 5 });
        h.contains(await toastAfter("#a_save"), "is an import shipment", "save is refused");
        h.contains(await toastAfter("#a_preview"), "is an import shipment", "preview is refused");
        h.contains(await toastAfter("#a_print"), "is an import shipment", "print is refused");
        h.eq(await entries(), 0, "nothing reached the register");

        await h.tab(app.page, "Import Advice");
        await app.page.fill("#i_mawb", "780-30200001");
        await app.page.waitForTimeout(200);
        await h.fillAdvice(app.page, "import", { cust: h.OTHER_CUSTOMER.name, wt: 100, pcs: 5 });
        h.contains(await toastAfter("#i_save"), "is an export shipment", "an export AWB is refused on the import advice");
        h.eq(await entries(), 0, "still nothing in the register");

        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30200001");
        await app.page.waitForTimeout(200);
        h.assert(!(await marked("a_mawb")), "a correct AWB lifts the block");
        await app.page.fill("#a_wt", "100");
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "and the advice saves");
      } finally { await app.close(); }
    },

    "dates and times are mandatory, and a time missing from the manifest is left blank": async (h) => {
      const noDeparture = row("780-30200101", "DWC", "NBO", "ZZ 180", "", "", "GEN", "Machinery Parts", "10", "100", h.SAMPLE_CUSTOMER.name);
      const { app } = await withManifest(h, [noDeparture]);
      try {
        const toastAfter = async (sel) => {
          await app.page.evaluate(() => { document.getElementById("toast").textContent = ""; });
          await app.page.click(sel);
          await app.page.waitForTimeout(250);
          return text(app.page, "#toast");
        };
        const labels = (page) => app.page.$$eval("#p-" + page + " label", (l) => l.map((x) => x.textContent));

        await h.tab(app.page, "Export Advice");
        const exportLabels = await labels("export");
        for (const name of ["Departure Time & Date *", "Acceptance Time & Date (RCS) *"])
          h.assert(exportLabels.includes(name), name + " is marked mandatory");

        await app.page.fill("#a_mawb", "780-30200101");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_t2"), "", "a departure time missing from the manifest is left blank, not set to now");
        h.contains(await text(app.page, "#a_awbstatus"), "departure time is not on the manifest", "the status says so");
        await h.fillAdvice(app.page, "export", { bill: h.SAMPLE_CUSTOMER.name });
        h.contains(await toastAfter("#a_save"), "Departure time & date is required", "save is refused without a departure time");
        h.contains(await toastAfter("#a_preview"), "Departure time & date is required", "so is preview");
        h.contains(await toastAfter("#a_print"), "Departure time & date is required", "and print");

        await app.page.fill("#a_t2", "2026-09-20T09:00");
        await app.page.fill("#a_t1", "");
        h.contains(await toastAfter("#a_save"), "Acceptance time & date (RCS) is required", "the acceptance time is mandatory too");
        h.eq((await h.db(app.page)).entries.length, 0, "nothing reached the register");

        await app.page.fill("#a_t1", "2026-09-20T06:00");
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "with both times entered it saves");

        await h.tab(app.page, "Import Advice");
        const importLabels = await labels("import");
        for (const name of ["RCF Time & Date (Received at SH Facility) *", "Delivery Time & Date *"])
          h.assert(importLabels.includes(name), name + " is marked mandatory");
        await h.fillAdvice(app.page, "import", { cust: h.OTHER_CUSTOMER.name, mawb: "780-30299901", wt: 50, pcs: 2, t2: "" });
        h.contains(await toastAfter("#i_save"), "Delivery time & date is required", "the import delivery time is mandatory");
      } finally { await app.close(); }
    },

    "an AWB that is not in the database is left for manual entry, and saves": async (h) => {
      const { app } = await withManifest(h, [exportRow(h)]);
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30299999");
        await app.page.press("#a_mawb", "Enter");
        await app.page.waitForTimeout(150);
        h.contains(await text(app.page, "#a_awbstatus"), "not in the Shipment Database", "status");
        h.eq(await val(app.page, "a_cust"), "", "nothing is filled in");
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, wt: 100, pcs: 5 });
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "a hand-entered advice still saves");
      } finally { await app.close(); }
    },

    "changing the AWB clears the details filled in for the previous shipment": async (h) => {
      const { app } = await withManifest(h, [exportRow(h)]);
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30200001");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_pcs"), "25", "filled in first");
        await app.page.fill("#a_mawb", "780-30299998");
        await app.page.press("#a_mawb", "Enter");
        await app.page.waitForTimeout(150);
        h.eq(await val(app.page, "a_cust"), "", "owner cleared");
        h.eq(await val(app.page, "a_pcs"), "", "pieces cleared");
        h.eq(await val(app.page, "a_fltno"), "", "flight cleared");
        h.eq(await val(app.page, "a_dst"), "", "destination back to its default");
        h.contains(await text(app.page, "#a_awbstatus"), "were cleared", "status says why");
      } finally { await app.close(); }
    },

    "an import AWB typed on the Export Advice clears it, is not filled in, and opens on the Import Advice": async (h) => {
      const { app } = await withManifest(h, [exportRow(h), importRow(h)]);
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30200001");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_pcs"), "25", "an export shipment is filled in first");
        await app.page.fill("#a_mawb", "780-30200002");
        await app.page.waitForTimeout(200);
        h.contains(await text(app.page, "#a_awbstatus"), "import shipment", "the mismatch is explained");
        h.eq(await val(app.page, "a_cust"), "", "the export details are cleared and the import shipment is not filled in");
        h.eq(await val(app.page, "a_pcs"), "", "pieces cleared too");
        // the click below moves focus off the AWB field first; the notice must
        // survive that blur or the click lands on nothing (regression)
        await app.page.click("#a_awbswitch");
        await app.page.waitForTimeout(250);
        h.eq(await app.page.$eval(".page.on", (p) => p.id), "p-import", "moved to the Import Advice");
        h.eq(await val(app.page, "i_mawb"), "780-30200002", "AWB carried across");
        h.eq(await val(app.page, "i_cust"), h.OTHER_CUSTOMER.name, "and filled in there");
        h.eq(await val(app.page, "a_mawb"), "", "nothing left behind on the export form");
      } finally { await app.close(); }
    },

    "picking a billing party fills its TRN and address, never its phone number": async (h) => {
      // Regression carried over from the customer picker: a phone number once
      // landed in the TRN field.
      const app = await h.openApp();
      try {
        const c = h.BILLING_CUSTOMER;
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_bill", c.name);
        await app.page.waitForTimeout(150);
        const trn = await val(app.page, "a_bill_trn");
        const addr = await val(app.page, "a_bill_addr");
        h.eq(trn, c.trn, "billing TRN");
        h.eq(addr, addressOf(c), "billing address");
        h.notContains(trn, c.phone, "the phone number must never land in the TRN field");
        h.notContains(addr, c.phone, "or in the address field");
      } finally { await app.close(); }
    },

    "a billing party changed to a name outside the master loses the previous TRN": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_bill", h.BILLING_CUSTOMER.name);
        await app.page.waitForTimeout(150);
        h.eq(await val(app.page, "a_bill_trn"), h.BILLING_CUSTOMER.trn, "filled in first");
        await app.page.fill("#a_bill", "a party not in the master");
        await app.page.waitForTimeout(150);
        h.eq(await val(app.page, "a_bill_trn"), "", "TRN cleared rather than printed under another party");
        h.eq(await val(app.page, "a_bill_addr"), "", "address cleared too");
      } finally { await app.close(); }
    },

    "Same as AWB owner bills the owner and fills its TRN": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_cust", h.SAMPLE_CUSTOMER.name);
        await app.page.click("#a_bill_same");
        await app.page.waitForTimeout(150);
        h.eq(await val(app.page, "a_bill"), h.SAMPLE_CUSTOMER.name, "billing party");
        h.eq(await val(app.page, "a_bill_trn"), h.SAMPLE_CUSTOMER.trn, "billing TRN");
      } finally { await app.close(); }
    },

    "an advice cannot be saved without a billing party": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30200041", wt: 100, pcs: 5, bill: "" });
        h.contains(await h.saveAdvice(app.page, "export"), "Billing party is required", "save is refused");
        h.eq((await h.db(app.page)).entries.length, 0, "nothing reached the register");
      } finally { await app.close(); }
    },

    "the saved advice keeps the AWB owner and billing party apart; the Register shows the owner": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30200051", wt: 100, pcs: 5, bill: h.BILLING_CUSTOMER.name });
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "saved");
        const d = await h.db(app.page);
        const e = d.entries[d.entries.length - 1];
        h.eq(e.cust, h.SAMPLE_CUSTOMER.name, "cust is the AWB owner");
        h.eq(e.billTo, h.BILLING_CUSTOMER.name, "billTo is the billing party");
        h.eq(e.billTrn, h.BILLING_CUSTOMER.trn, "billing TRN");
        h.eq(e.billAddr, addressOf(h.BILLING_CUSTOMER), "billing address");
        h.eq(e.acct, h.BILLING_CUSTOMER.trn, "acct mirrors the billing TRN for older versions");
        await h.tab(app.page, "Invoice Register");
        h.contains(await text(app.page, "#p-register"), h.SAMPLE_CUSTOMER.name, "the Register still lists the AWB owner");
      } finally { await app.close(); }
    },

    "the printed advice names only the billing party, with its TRN and address": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30200061", wt: 100, pcs: 5, bill: h.BILLING_CUSTOMER.name });
        await app.page.click("#a_preview");
        await app.page.waitForTimeout(300);
        const doc = await text(app.page, "#mBody");
        h.contains(doc, "Billing Party", "billing party row");
        h.contains(doc, h.BILLING_CUSTOMER.name, "billing party name");
        h.contains(doc, h.BILLING_CUSTOMER.trn, "billing party TRN");
        h.contains(doc, addressOf(h.BILLING_CUSTOMER), "billing party address");
        h.notContains(doc, "AWB Owner", "the AWB owner is not printed");
        h.notContains(doc, h.SAMPLE_CUSTOMER.name, "nor is its name");
        h.notContains(doc, "Customer TRN", "the old customer TRN label is gone");
      } finally { await app.close(); }
    },

    "the printed advice is white, in the company blue only": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30200091", wt: 100, pcs: 5, bill: h.BILLING_CUSTOMER.name });
        await app.page.click("#a_preview");
        await app.page.waitForTimeout(300);
        const s = await app.page.evaluate(() => {
          const doc = document.querySelector("#mBody .doc");
          const style = (sel) => getComputedStyle(doc.querySelector(sel));
          const fills = [...doc.querySelectorAll("*")].filter((el) => {
            const c = getComputedStyle(el).backgroundColor;
            return c !== "rgba(0, 0, 0, 0)" && c !== "rgb(255, 255, 255)";
          }).map((el) => getComputedStyle(el).backgroundColor + (el.matches(".bank td.bacc") ? " on the account bars" : " on " + el.tagName + "." + el.className));
          return {
            branded: doc.classList.contains("adv"),
            title: style(".title").color,
            headings: style(".items th").color,
            labels: style(".meta td.l").color,
            total: style(".items tr.tot td").color,
            totalLine: style(".items tr.tot td").borderBottomColor,
            green: [...doc.querySelectorAll("*")].some((el) => {
              const c = getComputedStyle(el), GREEN = "rgb(0, 255, 87)";
              const line = ["Top", "Right", "Bottom", "Left"].some((side) =>
                c["border" + side + "Color"] === GREEN && c["border" + side + "Width"] !== "0px" && c["border" + side + "Style"] !== "none");
              return line || c.color === GREEN || c.backgroundColor === GREEN;
            }),
            fills: [...new Set(fills)],
          };
        });
        const BLUE = "rgb(16, 66, 255)";
        h.assert(s.branded, "the advice carries the company style");
        h.eq(s.title, BLUE, "title in company blue");
        h.eq(s.headings, BLUE, "charge table headings in company blue");
        h.eq(s.labels, BLUE, "field labels in company blue");
        h.eq(s.total, BLUE, "total in company blue");
        h.eq(s.totalLine, BLUE, "the total is ruled in company blue");
        h.assert(!s.green, "no green anywhere on the advice");
        h.eq(s.fills.join(", "), "rgb(16, 66, 255) on the account bars", "white, with company blue filling only the AED and USD account bars");
      } finally { await app.close(); }
    },

    "the printed advice carries the bank details for payment, between the total charges and the authorisation": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30200092", wt: 100, pcs: 5 });
        for (const mode of ["Cash", "Card", "Credit"]) {
          await h.payMode(app.page, "export", mode);
          await app.page.click("#a_preview");
          await app.page.waitForTimeout(300);
          const r = await app.page.evaluate(() => {
            const doc = document.querySelector("#mBody .doc"), bank = doc.querySelectorAll("table.bank");
            const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
            const bars = [...doc.querySelectorAll(".bank td.bacc")], cs = bars.length ? getComputedStyle(bars[0]) : null;
            return {
              count: bank.length,
              between: bank.length === 1 && follows(doc.querySelector(".items tr.tot"), bank[0]) && follows(bank[0], doc.querySelector("table.sig")),
              text: bank.length ? bank[0].textContent.replace(/\s+/g, " ") : "",
              bars: bars.map((b) => b.textContent.trim()).join(" | "),
              fill: cs && cs.backgroundColor, ink: cs && cs.color,
              exact: cs && (cs.printColorAdjust || cs.webkitPrintColorAdjust || cs.getPropertyValue("-webkit-print-color-adjust")),
            };
          });
          h.eq(r.count, 1, mode + ": one bank details block");
          h.assert(r.between, mode + ": after the total charges and before the SolitAir authorisation");
          for (const label of ["Bank Details for Payment", "Account Name (both accounts):", "Account No.:", "IBAN:", "BIC / SWIFT:", "Bank:", "Branch:"])
            h.contains(r.text, label, mode + ": " + label);
          h.eq(r.bars, "AED Account | USD Account", mode + ": the AED and USD account bars");
          h.eq(r.fill, "rgb(16, 66, 255)", mode + ": filled company blue");
          h.eq(r.ink, "rgb(255, 255, 255)", mode + ": in white");
          h.eq(r.exact, "exact", mode + ": kept when printing without background graphics");
          h.contains(r.text, await app.page.evaluate(() => CFG_SHIPPED.bank.aed.bank), mode + ": the shipped bank details");
          h.assert(!/fake|fictional|demo|sample|not configured/i.test(r.text), mode + ": nothing on the advice says the details are invented");
          await app.page.evaluate(() => closeModal());
        }
      } finally { await app.close(); }
    },

    "bank details entered under Rates & Data print instead of the demo ones, and details saved by an earlier version still print": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Rates");
        await app.page.fill("#bk_name", "Test Account Holder");
        await app.page.fill("#bk_aed_bank", "Test Bank One");
        await app.page.fill("#bk_usd_branch", "Test Branch Two");
        await app.page.click("#saveSite");
        await app.page.waitForTimeout(200);
        h.eq(await app.page.evaluate(() => [DB.bank.name, DB.bank.aed.bank, DB.bank.usd.branch].join(" | ")),
          "Test Account Holder | Test Bank One | Test Branch Two", "saved as separate fields");
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30200093", wt: 100, pcs: 5 });
        await app.page.click("#a_preview");
        await app.page.waitForTimeout(300);
        const printed = await app.page.$eval("#mBody table.bank", (e) => e.textContent);
        for (const v of ["Test Account Holder", "Test Bank One", "Test Branch Two"]) h.contains(printed, v, "prints " + v);
      } finally { await app.close(); }

      const old = await h.openApp({ seed: { solitair_db: {
        openingBalance: 0, openingNote: "", openingDate: "", entries: [], seq: { export: 0, import: 0 },
        customers: [], staff: "Counter 1", rates: {}, logo: null,
        bank: { aed: ["Acc Name: Old Format Holder", "Acc# 111", "IBAN: TEST-IBAN-1", "BIC/SWIFT: TESTBIC1", "Bank: Old Bank", "Branch: Old Branch"],
                usd: ["Acc Name: Not configured", "Acc# Not configured", "Bank: Old USD Bank"] } } } });
      try {
        const b = await old.page.evaluate(() => [CFG.bank.name, CFG.bank.aed.acc, CFG.bank.aed.iban, CFG.bank.aed.bic, CFG.bank.aed.bank,
          CFG.bank.aed.branch, CFG.bank.usd.bank, CFG.bank.usd.acc === CFG_SHIPPED.bank.usd.acc].join(" | "));
        h.eq(b, "Old Format Holder | 111 | TEST-IBAN-1 | TESTBIC1 | Old Bank | Old Branch | Old USD Bank | true",
          "earlier free-text lines are read by their labels; a Not configured line keeps the demo value");
      } finally { await old.close(); }
    },

    "the live animals charge is named without Aviation": async (h) => {
      const app = await h.openApp();
      try {
        const labels = await app.page.$$eval("#a_optsel option, #i_optsel option", (o) => o.map((x) => x.textContent));
        h.assert(labels.includes("Live Animals (AVI) Handling"), "the export charge has its new name");
        h.eq(labels.filter((t) => /aviation/i.test(t)).join(", "), "", "no charge mentions Aviation");
      } finally { await app.close(); }
    },

    "sample shipments load from the Shipment Database tab": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Shipment Database");
        await app.page.click("#sh_demo");
        await app.page.waitForTimeout(250);
        h.contains(await text(app.page, "#sh_loadedtitle"), "(10)", "ten loaded and listed");
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30901001");
        await app.page.waitForTimeout(200);
        const owner = await val(app.page, "a_cust");
        h.assert(await app.page.evaluate((n) => !!resolveCustomer(n), owner), "the sample owner is a demo master customer");
        await app.page.fill("#a_mawb", "780-30901009");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_wt"), "410", "every sample shipment carries a gross weight");
      } finally { await app.close(); }
    },

    "on a browser's first open the sample shipments are already loaded, and clearing them sticks": async (h) => {
      const app = await h.openApp({ firstOpen: true });
      try {
        h.eq(await app.page.evaluate(() => SH.items.length), 10, "ten sample shipments on first open");
        await h.tab(app.page, "Shipment Database");
        h.contains(await text(app.page, "#sh_loadedtitle"), "(10)", "listed on the Shipment Database tab");
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30901001");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_wt"), "312.5", "an AWB fills in straight away");
        await h.tab(app.page, "Shipment Database");
        await app.page.click("#sh_clear");
        await app.page.waitForTimeout(200);
        await app.page.reload({ waitUntil: "load" });
        await app.page.waitForTimeout(400);
        h.eq(await app.page.evaluate(() => SH.items.length), 0, "cleared shipments are not loaded again on the next open");
      } finally { await app.close(); }
    },

    "loaded shipments survive a reload and can be cleared": async (h) => {
      const { app } = await withManifest(h, [exportRow(h), importRow(h)]);
      try {
        await app.page.reload({ waitUntil: "load" });
        await app.page.waitForTimeout(400);
        h.eq(await app.page.evaluate(() => SH.items.length), 2, "still loaded after a reload");
        await h.tab(app.page, "Shipment Database");
        await app.page.click("#sh_clear");
        await app.page.waitForTimeout(200);
        h.eq(await app.page.evaluate(() => SH.items.length), 0, "cleared");
        h.eq(await app.page.evaluate(() => JSON.parse(localStorage.getItem("solitair_shipments_v1")).items.length), 0, "cleared in storage");
      } finally { await app.close(); }
    },

    "weight headings are read in their usual forms, and a sheet without weights is flagged": async (h) => {
      const app = await h.openApp();
      try {
        const r = await app.page.evaluate(() => {
          const isWeight = (heading) => shMapHeader([heading]).wt === 0;
          return {
            missed: ["Gross Weight", "Gross Weight (KG)", "Gross Weight KGS", "Gross Wt", "Gross Wt (kg)", "GW", "GW (KG)",
                     "G.W.", "Weight", "Weight KGS", "Actual Weight", "KGS"].filter((x) => !isWeight(x)),
            wrongly: ["Chargeable Weight", "Weight (Chargeable)", "Volume Weight", "Dimensional Weight"].filter(isWeight),
          };
        });
        h.eq(r.missed.join(", "), "", "every usual gross weight heading is read");
        h.eq(r.wrongly.join(", "), "", "a chargeable or volume weight is never read as gross weight");

        const blank = (awb) => row(awb, "DWC", "NBO", "ZZ 170", "09/20/2026, 09:00 AM", "", "GEN", "Spare Parts", "3", "", h.SAMPLE_CUSTOMER.name);
        await h.tab(app.page, "Shipment Database");
        await app.page.fill("#sh_paste", h.manifestText(h.MANIFEST_HEADER, [blank("780-30200081"), blank("780-30200082")]));
        await app.page.click("#sh_preview");
        await app.page.waitForTimeout(150);
        h.contains(await text(app.page, "#sh_result"), "None of these shipments has a gross weight", "an empty weight column is flagged before importing");

        const keep = h.MANIFEST_HEADER.map((x) => x !== "Gross Weight");
        const header = h.MANIFEST_HEADER.filter((_, i) => keep[i]);
        const rows = [blank("780-30200083")].map((cells) => cells.filter((_, i) => keep[i]));
        await app.page.fill("#sh_paste", h.manifestText(header, rows));
        await app.page.click("#sh_preview");
        await app.page.waitForTimeout(150);
        h.contains(await text(app.page, "#sh_result"), "No gross weight column was found", "a sheet with no weight column is flagged");
      } finally { await app.close(); }
    },

    "manifest SHC codes: an unknown code is flagged and bills as special; several codes keep their class": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Shipment Database");
        await app.page.fill("#sh_paste", h.manifestText(h.MANIFEST_HEADER, [
          row("780-30200071", "DWC", "BAH", "ZZ 160", "09/20/2026, 09:00 AM", "", "XYZ", "Spare Parts", "3", "30", h.SAMPLE_CUSTOMER.name),
          row("780-30200072", "DWC", "BAH", "ZZ 161", "09/20/2026, 09:00 AM", "", "DGR ELI", "Batteries", "4", "40", h.SAMPLE_CUSTOMER.name),
          row("780-30200073", "DWC", "BAH", "ZZ 162", "09/20/2026, 09:00 AM", "", "PER COL", "Chilled Fish", "5", "50", h.SAMPLE_CUSTOMER.name),
        ]));
        await app.page.click("#sh_preview");
        await app.page.waitForTimeout(150);
        const preview = await text(app.page, "#sh_result");
        h.contains(preview, "SHC XYZ is not a known code; it bills as special cargo", "flagged in the preview");
        h.assert(preview.indexOf("SHC DGR ELI") < 0 && preview.indexOf("SHC PER COL") < 0, "listed codes together are not flagged");
        await app.page.click("#sh_import");
        await app.page.waitForTimeout(250);
        await h.tab(app.page, "Export Advice");
        const handling = async () => {
          const q = [];
          for (const k of ["gen", "spc", "per"]) q.push(k + "=" + Number((await h.chargeRow(app.page, "ex_handling_" + k)).qty));
          return q.join(" ");
        };

        await app.page.fill("#a_mawb", "780-30200071");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_shc"), "XYZ", "the code is kept on the form, not replaced by GEN");
        h.contains(await text(app.page, "#a_awbstatus"), "not a known code, so it bills as special cargo", "and the form says how it bills");
        h.eq(await handling(), "gen=0 spc=30 per=0", "billed as special cargo");

        await app.page.fill("#a_mawb", "780-30200072");
        await app.page.waitForTimeout(200);
        h.eq(await val(app.page, "a_shc"), "DGR ELI", "several codes are kept together");
        h.eq(await handling(), "gen=0 spc=40 per=0", "DGR with ELI is special cargo");
        h.eqMoney((await h.chargeRow(app.page, "ex_dgr")).charge, 350, "and DGR among the codes raises the DG inspection");

        await app.page.fill("#a_mawb", "780-30200073");
        await app.page.waitForTimeout(200);
        h.eq(await handling(), "gen=0 spc=0 per=50", "a perishable code among several makes it perishable");
        h.eq(await app.page.$$eval("#a_shc option[data-manifest]", (o) => o.map((x) => x.value).join()), "PER COL",
          "codes added for an earlier AWB are removed when the AWB changes");
      } finally { await app.close(); }
    },
  },
};
