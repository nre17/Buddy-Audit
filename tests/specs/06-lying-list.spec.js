/* Lying list lifecycle: auto-join on export invoice, sweep on departure, cleanup on delete. */
module.exports = {
  name: "Lying list",
  tests: {
    "an export invoice auto-joins the lying list": async (h) => {
      const app = await h.openApp();
      try {
        const t2 = await h.localDT(app.page, 6);
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30130001",
          dst: "NBO", fltno: "8G 401", t2, wt: 200, pcs: 10 });
        await h.saveAdvice(app.page, "export");
        const ll = await h.lyingList(app.page);
        const item = ll.items.filter((x) => x.awb === "780-30130001")[0];
        h.assert(!!item, "export invoice should auto-join the lying list");
        h.eq(item.dir, "Export", "direction");
        h.eq(item.loc, "TO NBO", "destination tag");
        h.eq(item.fltno, "8G 401", "flight");
        h.eq(item.auto, true, "should be flagged as auto-added");
      } finally { await app.close(); }
    },

    "an import invoice does NOT join the lying list": async (h) => {
      const app = await h.openApp();
      try {
        const t2 = await h.localDT(app.page, 6);
        await h.fillAdvice(app.page, "import", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30130002",
          fltno: "8G 402", t2, wt: 200, pcs: 10 });
        await h.saveAdvice(app.page, "import");
        const ll = await h.lyingList(app.page);
        h.eq(ll.items.filter((x) => x.awb === "780-30130002").length, 0,
          "imports must never appear on the lying list");
      } finally { await app.close(); }
    },

    "manual add works and validates required fields": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Lying List");
        const dep = await h.localDT(app.page, 3);
        await app.page.fill("#ll_awb", "999-11112222");
        await app.page.fill("#ll_pcs", "3");
        await app.page.fill("#ll_wt", "77");
        await app.page.selectOption("#ll_dir", "Import");
        await app.page.fill("#ll_loc", "JFK");
        await app.page.fill("#ll_fltno", "ZZ 100");
        await app.page.fill("#ll_dep", dep);
        await app.page.click("#ll_add");
        await app.page.waitForTimeout(300);
        const ll = await h.lyingList(app.page);
        const it = ll.items.filter((x) => x.awb === "999-11112222")[0];
        h.assert(!!it, "manual entry should be added");
        h.eq(it.loc, "FROM JFK", "import entries read FROM origin");
        h.eq(it.auto, false, "manual entries are not auto");
      } finally { await app.close(); }
    },

    "entries sweep to cleared history once departure passes": async (h) => {
      const app = await h.openApp();
      try {
        const t2 = await h.localDT(app.page, 6);
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30130003",
          dst: "NBO", fltno: "8G 403", t2, wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        const res = await app.page.evaluate(() => {
          const it = LL.items.filter((x) => x.awb === "780-30130003")[0];
          it.dep = new Date(Date.now() - 3600000).toISOString().slice(0, 16); // an hour ago
          llSweep(); renderLying();
          return {
            live: LL.items.some((x) => x.awb === "780-30130003"),
            cleared: LL.cleared.some((x) => x.awb === "780-30130003"),
          };
        });
        h.eq(res.live, false, "departed cargo must leave the live list");
        h.eq(res.cleared, true, "departed cargo must land in cleared history");
      } finally { await app.close(); }
    },

    "deleting an invoice removes its lying-list entry and allows a clean re-add": async (h) => {
      // The mistaken-invoice workflow: raise, delete, re-raise the same AWB.
      const app = await h.openApp();
      try {
        const t2 = await h.localDT(app.page, 6);
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30130004",
          dst: "NBO", fltno: "8G 404", t2, wt: 150, pcs: 7 });
        await h.saveAdvice(app.page, "export");
        h.eq((await h.lyingList(app.page)).items.filter((x) => x.awb === "780-30130004").length, 1,
          "joined once");

        await h.tab(app.page, "Invoice Register");
        await app.page.evaluate(() => {
          const b = Array.from(document.querySelectorAll("#regtbl [data-del]"))
            .find((x) => x.closest("tr").textContent.indexOf("780-30130004") >= 0);
          if (b) b.click();
        });
        await app.page.waitForTimeout(250);
        await h.modalClick(app.page, "Delete");

        const after = await h.lyingList(app.page);
        h.eq(after.items.filter((x) => x.awb === "780-30130004").length, 0,
          "deleting the invoice must remove the lying-list entry");
        h.eq(after.cleared.filter((x) => x.awb === "780-30130004").length, 0,
          "and must not leave it in cleared history either");

        // corrected re-entry, same AWB, new details
        const t2b = await h.localDT(app.page, 8);
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30130004",
          dst: "MBA", fltno: "8G 405", t2: t2b, wt: 175, pcs: 8 });
        await h.saveAdvice(app.page, "export");
        const redone = (await h.lyingList(app.page)).items.filter((x) => x.awb === "780-30130004");
        h.eq(redone.length, 1, "the corrected invoice must rejoin exactly once");
        h.eq(redone[0].loc, "TO MBA", "with the corrected destination");
      } finally { await app.close(); }
    },

    "removing an automatically added export keeps it off the list": async (h) => {
      const app = await h.openApp();
      try {
        const t2 = await h.localDT(app.page, 6);
        await h.fillAdvice(app.page, "export", { cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100606",
          dst: "NBO", fltno: "8G 406", t2, wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Lying List");
        h.eq(await app.page.evaluate(() => LL.items.length), 1, "added from the invoice");
        await app.page.click("#ll_tbl [data-lldel]");
        await app.page.waitForTimeout(150);
        await app.page.evaluate(() => renderLying());
        h.eq(await app.page.evaluate(() => LL.items.length), 0, "still removed after the list refreshes");
        await app.page.reload({ waitUntil: "load" });
        await app.page.waitForTimeout(500);
        h.eq(await app.page.evaluate(() => LL.items.length), 0, "and after reopening");
      } finally { await app.close(); }
    },
  },
};
