/* Invoice register, cash reconciliation, handover to accounts. */
module.exports = {
  name: "Invoice register & cash position",
  tests: {
    "a saved invoice appears in the register": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30120001", wt: 150, pcs: 8 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Invoice Register");
        const txt = await app.page.evaluate(() => document.getElementById("regtbl").textContent);
        h.contains(txt, "780-30120001", "AWB should be listed in the register");
        h.contains(txt, h.SAMPLE_CUSTOMER.name, "customer should be listed");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "saved invoices are tagged type=invoice": async (h) => {
      // Regression: saveAdvice never set `type`, so dashboard, lying list and
      // facility security all silently ignored every invoice.
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30120002", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        const d = await h.db(app.page);
        h.eq(d.entries[d.entries.length - 1].type, "invoice", "entry type");
      } finally { await app.close(); }
    },

    "register search filters by AWB": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30120003", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Invoice Register");
        await app.page.fill("#rf_q", "780-30120003");
        await app.page.waitForTimeout(300);
        h.contains(await app.page.evaluate(() => document.getElementById("regtbl").textContent),
          "780-30120003", "matching search should show the row");
        await app.page.fill("#rf_q", "no-such-awb");
        await app.page.waitForTimeout(300);
        h.notContains(await app.page.evaluate(() => document.getElementById("regtbl").textContent),
          "780-30120003", "non-matching search should hide the row");
      } finally { await app.close(); }
    },

    "cash on hand tracks collected cash": async (h) => {
      // Regression: cashOnHand() read a dead schema (e.pm / e.cashAmt) and always
      // returned just the opening balance, which broke the handover validation.
      const app = await h.openApp();
      try {
        h.eqMoney(await app.page.$eval("#cashchip", (e) => e.textContent), 0, "starts at zero");
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30120004", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        h.eqMoney(await app.page.$eval("#cashchip", (e) => e.textContent), 84,
          "cash on hand should rise by the cash collected");
      } finally { await app.close(); }
    },

    "handover to accounts is accepted and deducts from cash on hand": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30120005", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Invoice Register");
        await app.page.click("#btnHandover");
        await app.page.waitForTimeout(300);
        h.contains(await app.page.evaluate(() => document.getElementById("mBody").textContent),
          "84.00", "dialog should show the real cash on hand");
        h.eqMoney(await app.page.$eval("#ho_amt", (e) => e.value), 84, "amount should prefill to cash on hand");
        await h.modalClick(app.page, "Record Handover");
        h.eqMoney(await app.page.$eval("#cashchip", (e) => e.textContent), 0,
          "cash on hand should return to zero after handing over");
        const d = await h.db(app.page);
        h.eq(d.entries.filter((e) => e.type === "handover").length, 1, "handover entry recorded");
      } finally { await app.close(); }
    },

    "deleting an invoice removes it and recalculates cash": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30120006", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Invoice Register");
        await app.page.evaluate(() => {
          const b = Array.from(document.querySelectorAll("#regtbl [data-del]"))
            .find((x) => x.closest("tr").textContent.indexOf("780-30120006") >= 0);
          if (b) b.click();
        });
        await app.page.waitForTimeout(250);
        await h.modalClick(app.page, "Delete");
        const d = await h.db(app.page);
        h.eq(d.entries.filter((e) => e.mawb === "780-30120006").length, 0, "invoice removed");
        h.eqMoney(await app.page.$eval("#cashchip", (e) => e.textContent), 0, "cash recalculated");
      } finally { await app.close(); }
    },

    "a handover with an invalid amount keeps the dialog open to correct it": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Invoice Register");
        await app.page.click("#btnHandover");
        await app.page.waitForTimeout(150);
        await app.page.fill("#ho_amt", "0");
        await h.modalClick(app.page, "Record Handover");
        h.eq(await app.page.evaluate(() => document.getElementById("modal").style.display), "flex", "the dialog stays open");
        h.contains(await app.page.evaluate(() => document.getElementById("toast").textContent), "Enter an amount", "and says why");
        h.eq((await h.db(app.page)).entries.length, 0, "nothing recorded");
      } finally { await app.close(); }
    },

    "Export Register to Excel downloads the workbook with its balances": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100605", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        const b = await app.page.evaluate(() => runningBalances());
        h.eqMoney(b.cash, 84, "cash on hand");
        h.eqMoney(b.sales, 84, "sales");
        h.eq(b.count, 1, "invoice count");
        await h.tab(app.page, "Invoice Register");
        const [download] = await Promise.all([app.page.waitForEvent("download"), app.page.click("#btnXls")]);
        h.assert(/^SolitAir_Invoice_Register_\d{8}_\d{4}\.xlsx$/.test(download.suggestedFilename()), "an .xlsx file (" + download.suggestedFilename() + ")");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "sample data carries local times": async (h) => {
      const app = await h.openApp();
      try {
        const gap = await app.page.evaluate(() => {
          seedDemo();
          const e = DB.entries.find((x) => x.id.indexOf("SEED0") === 0);
          return Math.round((new Date(e.ts) - new Date(e.t2)) / 36e5 * 10) / 10;
        });
        h.eq(gap, 2, "departure two hours before the record, in local time");
      } finally { await app.close(); }
    },
  },
};
