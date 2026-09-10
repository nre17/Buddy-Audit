/* The Customer Database tab: the demo customer master that the AWB owner and
   billing party pickers use. Customer values come from the harness. */
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);

module.exports = {
  name: "Customer Database",
  tests: {
    "the Customer Database tab follows the Shipment Database and lists the master": async (h) => {
      const app = await h.openApp();
      try {
        const tabs = await app.page.$$eval(".tabs button", (b) => b.map((x) => x.textContent.trim()));
        h.eq(tabs[0], "Shipment Database", "first tab");
        h.eq(tabs[1], "Customer Database", "second tab");
        await h.tab(app.page, "Customer Database");
        const total = await app.page.evaluate(() => CUSTOMERS.length.toLocaleString("en-US"));
        h.contains(await text(app.page, "#cu_count"), "of " + total, "the count covers the whole master");
        h.eq(await app.page.$$eval("#cu_list tbody tr", (r) => r.length), 100, "the unfiltered list is capped");
        h.contains(await text(app.page, "#p-customers"), "Demo data for this prototype", "the tab says what the data is");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "searching by TRN finds the customer the billing party fills in from": async (h) => {
      const app = await h.openApp();
      try {
        const c = h.BILLING_CUSTOMER;
        await h.tab(app.page, "Customer Database");
        await app.page.fill("#cu_filter", c.trn);
        await app.page.waitForTimeout(150);
        const rows = await app.page.$$eval("#cu_list tbody tr", (r) => r.map((x) => x.textContent));
        h.eq(rows.length, 1, "a TRN identifies one customer");
        h.contains(rows[0], c.name, "the matching customer");

        await app.page.fill("#cu_filter", "no customer is called this");
        await app.page.waitForTimeout(150);
        h.contains(await text(app.page, "#cu_count"), "No customer matches", "an empty result is explained");

        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_bill", c.name);
        await app.page.waitForTimeout(150);
        h.eq(await app.page.$eval("#a_bill_trn", (e) => e.value), c.trn, "the billing party TRN comes from the same list");
      } finally { await app.close(); }
    },

    "every customer has a TRN and an address, and the billing party list is exactly the database": async (h) => {
      const app = await h.openApp();
      try {
        // An AWB owner typed by hand is remembered for the owner picker, but must
        // not find its way into the billing party list.
        await h.fillAdvice(app.page, "export", {
          cust: "an owner typed by hand", mawb: "780-30210001", wt: 100, pcs: 5, bill: h.BILLING_CUSTOMER.name });
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "saved");
        const r = await app.page.evaluate(() => {
          const names = CUSTOMERS.map((c) => c.name);
          const billing = [...document.querySelectorAll("#a_billlist option")].map((o) => o.value);
          return {
            total: CUSTOMERS.length,
            withTrn: CUSTOMERS.filter((c) => /^\d{15}$/.test(c.trn)).length,
            uniqueTrn: new Set(CUSTOMERS.map((c) => c.trn)).size,
            withAddress: CUSTOMERS.filter((c) => String(c.addr).trim() && String(c.city).trim()).length,
            billingIsDatabase: billing.length === names.length && billing.every((n, i) => n === names[i]),
            ownerRemembered: [...document.querySelectorAll("#a_custlist option")].some((o) => o.value === "an owner typed by hand"),
          };
        });
        h.eq(r.withTrn, r.total, "every customer has a 15-digit TRN");
        h.eq(r.uniqueTrn, r.total, "no two customers share a TRN");
        h.eq(r.withAddress, r.total, "every customer has an address and a city");
        h.assert(r.billingIsDatabase, "the billing party list is exactly the Customer Database, in order");
        h.assert(r.ownerRemembered, "a hand-typed AWB owner is still remembered for the owner picker");
      } finally { await app.close(); }
    },
  },
};
