/* Advice form structure and defaults. */
module.exports = {
  name: "Advice forms (Export / Import)",
  tests: {
    "export origin defaults to DWC, import destination defaults to DWC": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        h.eq(await app.page.$eval("#a_org", (e) => e.value), "DWC", "export origin");
        await h.tab(app.page, "Import Advice");
        h.eq(await app.page.$eval("#i_dst", (e) => e.value), "DWC", "import destination");
      } finally { await app.close(); }
    },

    "customer picker autofills TRN and address, never the phone number": async (h) => {
      // Regression: the account field used to be filled with the mobile number.
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_cust", h.SAMPLE_CUSTOMER.name);
        await app.page.waitForTimeout(300);
        const got = await app.page.evaluate(() => ({
          acct: document.getElementById("a_acct").value,
          trn: document.getElementById("a_cust_trn").value,
          country: document.getElementById("a_cust_country").value,
        }));
        h.eq(got.acct, h.SAMPLE_CUSTOMER.trn, "account field must carry the customer TRN");
        h.eq(got.trn, h.SAMPLE_CUSTOMER.trn, "hidden TRN field");
        h.notContains(got.acct, h.SAMPLE_CUSTOMER.phone, "the phone number must never land in the account field");
        h.eq(got.country, h.SAMPLE_CUSTOMER.country, "country should autofill too");
      } finally { await app.close(); }
    },

    "HAWB quantity field exists and is optional": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        const v = await app.page.$eval("#a_hawbqty", (e) => e.value);
        h.eq(v, "", "HAWB qty should start empty (optional)");
      } finally { await app.close(); }
    },

    "a Print button is available on the form itself": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        h.assert(await app.page.evaluate(() => !!document.getElementById("a_print")),
          "export form should expose a direct Print action");
      } finally { await app.close(); }
    },

    "preview modal can be closed": async (h) => {
      // Regression: modal buttons without an fn got no onclick at all.
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100001", wt: 100, pcs: 4 });
        await app.page.click("#a_preview");
        await app.page.waitForTimeout(300);
        h.eq(await app.page.evaluate(() => getComputedStyle(document.getElementById("modal")).display),
          "flex", "preview modal should open");
        await h.modalClick(app.page, "Close");
        h.eq(await app.page.evaluate(() => getComputedStyle(document.getElementById("modal")).display),
          "none", "preview modal should close");
        app.assertNoErrors();
      } finally { await app.close(); }
    },
  },
};
