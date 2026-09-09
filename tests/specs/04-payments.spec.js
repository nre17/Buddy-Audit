/* Payment breakdown rules. */
module.exports = {
  name: "Payment modes & breakdown",
  tests: {
    "Cash shows no amount field: the invoice total is the amount": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        const visible = await app.page.evaluate(() =>
          Array.from(document.getElementById("a_payfields").children)
            .filter((c) => getComputedStyle(c).display !== "none").length);
        h.eq(visible, 0, "Cash (the default) should not ask for an amount");
      } finally { await app.close(); }
    },

    "Cash still saves the full total against cash": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100010", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        const d = await h.db(app.page);
        const e = d.entries[d.entries.length - 1];
        h.eq(e.payMode, "Cash", "pay mode");
        h.eqMoney(e.pay.cash, e.total, "cash should equal the invoice total");
        h.eqMoney(e.total, 84, "50 AWB + 34 handling minimum");
      } finally { await app.close(); }
    },

    "single-method modes show exactly one field": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        for (const [mode, label] of [["Card","Card (AED)"],["Credit","Credit (AED)"],
                                     ["CASS","CASS (AED)"],["Bank Transfer","Bank Transfer (AED)"]]) {
          await h.payMode(app.page, "export", mode);
          const vis = await app.page.evaluate(() =>
            Array.from(document.getElementById("a_payfields").children)
              .filter((c) => getComputedStyle(c).display !== "none")
              .map((c) => c.textContent.trim()));
          h.eq(vis.length, 1, mode + " should show exactly one field");
          h.contains(vis[0], label, mode + " field label");
        }
      } finally { await app.close(); }
    },

    "Cash + Card shows both fields so the split can be entered": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        await h.payMode(app.page, "export", "Cash + Card");
        const vis = await app.page.evaluate(() =>
          Array.from(document.getElementById("a_payfields").children)
            .filter((c) => getComputedStyle(c).display !== "none")
            .map((c) => c.textContent.trim()));
        h.eq(vis.length, 2, "Cash + Card should show two fields");
        h.contains(vis.join("|"), "Cash Collected", "cash field");
        h.contains(vis.join("|"), "Card (AED)", "card field");
      } finally { await app.close(); }
    },

    "Cash + Card saves the entered split verbatim": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100011", wt: 100, pcs: 5 });
        await h.payMode(app.page, "export", "Cash + Card");
        await app.page.fill("#a_pay_cash", "50");
        await app.page.fill("#a_pay_card", "34");
        await h.saveAdvice(app.page, "export");
        const d = await h.db(app.page);
        const e = d.entries[d.entries.length - 1];
        h.eq(e.payMode, "Cash + Card", "pay mode");
        h.eqMoney(e.pay.cash, 50, "cash portion");
        h.eqMoney(e.pay.card, 34, "card portion");
        h.eqMoney(e.pay.credit + e.pay.cass + e.pay.bank, 0, "other methods must be zeroed");
      } finally { await app.close(); }
    },

    "deselecting a payment mode leaves its button readable": async (h) => {
      // Regression: deselect reset background but not colour, giving white-on-white.
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        await h.payMode(app.page, "export", "Card");
        await h.payMode(app.page, "export", "Credit");
        const cardBtn = await app.page.evaluate(() => {
          const b = Array.from(document.querySelectorAll("#a_pmodes .payopt"))
            .find((x) => x.dataset.pm === "Card");
          const cs = getComputedStyle(b);
          return { bg: cs.backgroundColor, fg: cs.color };
        });
        h.assert(cardBtn.bg !== cardBtn.fg,
          "deselected button text must not match its background (" + JSON.stringify(cardBtn) + ")");
      } finally { await app.close(); }
    },
  },
};
