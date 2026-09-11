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

    "both pickers list exactly the Customer Database, whatever the browser has saved": async (h) => {
      // A browser used before may hold other customer names in its saved data.
      // Placeholder names stand in for them here; they must never be offered.
      const seeded = { solitair_db: {
        openingBalance: 0, openingNote: "", openingDate: "", entries: [], seq: { export: 0, import: 0 },
        customers: ["Placeholder Saved Name One", "Placeholder Saved Name Two"], staff: "Counter 1",
        rates: {}, logo: null, sec: [] } };
      const app = await h.openApp({ seed: seeded });
      try {
        await h.fillAdvice(app.page, "export", {
          cust: "an owner typed by hand", mawb: "780-30210001", wt: 100, pcs: 5, bill: h.BILLING_CUSTOMER.name });
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "saved");
        const r = await app.page.evaluate(() => {
          const names = CUSTOMERS.map((c) => c.name);
          const opts = (id) => [...document.querySelectorAll("#" + id + " option")].map((o) => o.value);
          const isDatabase = (list) => list.length === names.length && list.every((n, i) => n === names[i]);
          return {
            total: CUSTOMERS.length,
            withTrn: CUSTOMERS.filter((c) => /^\d{15}$/.test(c.trn)).length,
            uniqueTrn: new Set(CUSTOMERS.map((c) => c.trn)).size,
            withAddress: CUSTOMERS.filter((c) => String(c.addr).trim() && String(c.city).trim()).length,
            bothAdvices: isDatabase(opts("a_custlist")) && isDatabase(opts("i_custlist")),
            shared: ["a", "i"].every((p) =>
              document.getElementById(p + "_cust").getAttribute("list") === document.getElementById(p + "_bill").getAttribute("list")),
            savedNamesOffered: ["a_custlist", "i_custlist"].some((id) => opts(id).some((n) => n.indexOf("Placeholder Saved Name") === 0)),
            typedOwnerOffered: opts("a_custlist").includes("an owner typed by hand"),
          };
        });
        h.eq(r.withTrn, r.total, "every customer has a 15-digit TRN");
        h.eq(r.uniqueTrn, r.total, "no two customers share a TRN");
        h.eq(r.withAddress, r.total, "every customer has an address and a city");
        h.assert(r.bothAdvices, "the pickers on both advices list exactly the Customer Database, in order");
        h.assert(r.shared, "the AWB owner and billing party pickers share that one list");
        h.assert(!r.savedNamesOffered, "names held in the browser's saved data are never offered");
        h.assert(!r.typedOwnerOffered, "an AWB owner typed by hand is not added to the list");
      } finally { await app.close(); }
    },
  },
};
