/* Boot integrity: the app must build all ten tabs with no errors. */
module.exports = {
  name: "Boot & shell",
  tests: {
    "loads with no console or page errors": async (h) => {
      const app = await h.openApp();
      try { app.assertNoErrors(); } finally { await app.close(); }
    },

    "builds all ten tab panels": async (h) => {
      const app = await h.openApp();
      try {
        const ids = ["p-shipments","p-customers","p-export","p-import","p-lying","p-register",
                     "p-handover","p-dash","p-admin","p-security"];
        for (const id of ids) {
          const filled = await app.page.evaluate((id) => {
            const el = document.getElementById(id);
            return !!el && el.innerHTML.trim().length > 200;
          }, id);
          h.assert(filled, "tab panel #" + id + " did not build");
        }
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "embedded logo renders in the header": async (h) => {
      const app = await h.openApp();
      try {
        const logo = await app.page.evaluate(() => {
          const img = document.getElementById("brandLogo");
          return { display: img.style.display, isData: img.src.indexOf("data:image/") === 0 };
        });
        h.eq(logo.display, "block", "header logo should be visible");
        h.assert(logo.isData, "logo must be an embedded data: URI (single-file constraint)");
      } finally { await app.close(); }
    },

    "acceptance time defaults to local time, not UTC": async (h) => {
      // Regression: the field used toISOString() and showed Dubai time minus 4h.
      const app = await h.openApp({ timezoneId: "Asia/Dubai" });
      try {
        await h.tab(app.page, "Export Advice");
        const t1 = await app.page.$eval("#a_t1", (el) => el.value);
        const now = await h.localDT(app.page, 0);
        h.eq(t1.slice(0, 16), now.slice(0, 16), "acceptance time should default to local now");
      } finally { await app.close(); }
    },

    "a first open has an empty register, lying list and security portal, and the first invoice fills only the register and lying list": async (h) => {
      const app = await h.openApp({ firstOpen: true });
      try {
        const state = () => app.page.evaluate(() => ({
          saved: [DB.entries.length, LL.items.length, (DB.sec || []).length].join(),
          regRows: document.querySelectorAll("#regtbl tbody tr[data-id]").length,
          lying: document.querySelector("#ll_tbl tbody").textContent,
          security: document.querySelector("#sec_tbl tbody").textContent,
        }));
        let s = await state();
        h.eq(s.saved, "0,0,0", "no invoices, lying cargo or reception records on a first open");
        h.eq(s.regRows, 0, "the register lists no invoices");
        h.contains(s.lying, "No cargo lying in the warehouse", "the lying list is empty");
        h.contains(s.security, "No reception records yet", "the security portal is empty");

        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_mawb", "780-30901001");
        await app.page.waitForTimeout(250);
        await app.page.click("#a_bill_same");
        await app.page.waitForTimeout(150);
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "the first invoice");
        s = await state();
        h.eq(s.saved, "1,1,0", "the invoice is registered and its export cargo is lying; no reception record");
        h.eq(s.regRows, 1, "the register lists the invoice");
        h.contains(s.lying, "780-30901001", "the lying list shows its AWB");
        h.contains(s.security, "No reception records yet", "the security portal stays empty until cargo is received");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "Erase All Data empties the register, lying list and security portal": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100095", wt: 100, pcs: 5, t2: await h.localDT(app.page, 6) });
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "an export invoice");
        await app.page.evaluate(() => {
          DB.sec = [{ id: "SEC_TEST_1", awb: "780-30100095", dir: "Export", by: "Gate", ts: new Date().toISOString(), ack: false }];
          DB.rates = { ex_accept: { rate: 99 } }; applyRateOverrides();
          DB.freeHours = { general: 12, perishable: 3 }; CFG.freeHours.general = 12; CFG.freeHours.special = 12; CFG.freeHours.perishable = 3;
          DB.bank = { name: "Test Account Holder", aed: { bank: "Test Bank" }, usd: {} }; applySiteOverrides();
          save();
        });
        h.eq(await app.page.evaluate(() => [DB.entries.length, LL.items.length, DB.sec.length].join()), "1,1,1",
          "the register, lying list and security portal hold data");

        await h.tab(app.page, "Rates");
        await app.page.click("#btnWipe");
        await app.page.waitForTimeout(200);
        await h.modalClick(app.page, "Erase everything");
        await app.page.waitForTimeout(300);
        const after = () => app.page.evaluate(() => ({
          saved: [DB.entries.length, LL.items.length, (DB.sec || []).length].join(),
          regRows: document.querySelectorAll("#regtbl tbody tr[data-id]").length,
          lying: document.querySelector("#ll_tbl tbody").textContent,
          security: document.querySelector("#sec_tbl tbody").textContent,
        }));
        let s = await after();
        h.eq(s.saved, "0,0,0", "all three are empty after erasing");
        h.eq(s.regRows, 0, "the register lists nothing");
        h.contains(s.lying, "No cargo lying in the warehouse", "the lying list is empty");
        h.contains(s.security, "No reception records yet", "the security portal is empty");
        const settings = await app.page.evaluate(() => [
          EXPORT_LINES.find((l) => l.id === "ex_accept").rate === RATES_SHIPPED.ex_accept.rate,
          CFG.freeHours.general === CFG_SHIPPED.freeHours.general && CFG.freeHours.perishable === CFG_SHIPPED.freeHours.perishable,
          CFG.bank.name === CFG_SHIPPED.bank.name && CFG.bank.aed.bank === CFG_SHIPPED.bank.aed.bank].join());
        h.eq(settings, "true,true,true", "the shipped tariff, free hours and bank details are back straight away, not only after reopening");

        await app.page.reload({ waitUntil: "load" });
        await app.page.waitForTimeout(500);
        s = await after();
        h.eq(s.saved, "0,0,0", "and they stay empty after reopening");
        app.assertNoErrors();
      } finally { await app.close(); }
    },
  },
};
