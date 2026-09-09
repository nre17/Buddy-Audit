/* Dashboard KPIs and shift handover figures, both derived from the register. */
module.exports = {
  name: "Dashboard & shift handover",
  tests: {
    "dashboard KPIs reflect saved invoices": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30170001", wt: 200, pcs: 10 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Dashboard");
        const kpis = await app.page.evaluate(() => document.getElementById("d_kpis").textContent);
        h.contains(kpis, "84.00", "total sales should include the invoice");
        h.contains(kpis, "1 invoices", "invoice count");
        h.contains(kpis, "200.00 kg", "weight total");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "dashboard staff filter narrows the figures": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30170002", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Dashboard");
        await app.page.selectOption("#d_staff", "Counter 2"); // the invoice was saved under Counter 1
        await app.page.waitForTimeout(300);
        h.contains(await app.page.evaluate(() => document.getElementById("d_kpis").textContent),
          "0 invoices", "filtering to another staff member should exclude it");
      } finally { await app.close(); }
    },

    "handover picks up invoices inside the shift window": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30170003", wt: 300, pcs: 12 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Shift Handover");
        const from = await h.localDT(app.page, -24);
        const to = await h.localDT(app.page, 24);
        await app.page.selectOption("#ho_shift", "custom");
        await app.page.fill("#ho_from", from);
        await app.page.fill("#ho_to", to);
        await app.page.waitForTimeout(400);
        h.contains(await app.page.evaluate(() => document.getElementById("ho_msg").textContent),
          "1", "one invoice should fall inside the window");
        h.contains(await app.page.evaluate(() => document.getElementById("ho_figs").textContent),
          "300.00", "the shift weight total should appear");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "handover equipment checklist renders its default rows": async (h) => {
      // Regression: eqRender() used $("#ho_eq tbody"), which silently returned null.
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Shift Handover");
        const rows = await app.page.evaluate(() =>
          document.querySelectorAll("#ho_eq tbody tr").length);
        h.assert(rows > 0, "the equipment table must render its default rows");
      } finally { await app.close(); }
    },
  },
};
