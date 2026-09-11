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

    "the advice's Staff choice is the invoice's staff, and the header's staff choice carries to both advices": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100601", wt: 100, pcs: 5 });
        await app.page.selectOption("#a_staff", "Counter 4");
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "saved");
        const d = await h.db(app.page);
        h.eq(d.entries[d.entries.length - 1].staff, "Counter 4", "the staff chosen on the advice");
        await app.page.selectOption("#staff", "Counter 3");
        await app.page.waitForTimeout(150);
        h.eq(await app.page.inputValue("#a_staff") + "," + await app.page.inputValue("#i_staff"), "Counter 3,Counter 3",
          "signing in on the header sets both advices' Staff");
      } finally { await app.close(); }
    },

    "a blank origin or destination is left blank, not invented": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "import", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100602", wt: 100, pcs: 5, org: "" });
        h.eq(await app.page.evaluate(() => { const e = collectAdvice("import"); return e.org + "|" + e.dst; }), "|DWC", "import: blank origin, DWC destination");
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100603", wt: 100, pcs: 5, dst: "" });
        h.eq(await app.page.evaluate(() => { const e = collectAdvice("export"); return e.org + "|" + e.dst; }), "DWC|", "export: DWC origin, blank destination");
      } finally { await app.close(); }
    },

    "Ctrl+S saves the advice on screen": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100604", wt: 100, pcs: 5 });
        await app.page.focus("#a_wt");
        await app.page.keyboard.press("Control+s");
        await app.page.waitForTimeout(300);
        h.eq((await h.db(app.page)).entries.filter((e) => e.type === "invoice").length, 1, "saved to the register");
      } finally { await app.close(); }
    },
  },
};
