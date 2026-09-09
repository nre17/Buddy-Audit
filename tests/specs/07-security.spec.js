/* Facility security: AWB reception vs invoice reconciliation. */
module.exports = {
  name: "Facility security",
  tests: {
    "a received AWB with an invoice shows Invoiced": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30140001", wt: 100, pcs: 5 });
        await h.saveAdvice(app.page, "export");
        await h.tab(app.page, "Facility Security");
        await app.page.fill("#sec_awb", "780-30140001");
        await app.page.selectOption("#sec_dir", "Export");
        await app.page.click("#sec_add");
        await app.page.waitForTimeout(300);
        h.contains(await app.page.evaluate(() => document.getElementById("sec_tbl").textContent),
          "Invoiced", "an invoiced AWB must be recognised");
      } finally { await app.close(); }
    },

    "a received AWB with no invoice raises the missing-invoice alert": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Facility Security");
        await app.page.fill("#sec_awb", "780-39999999");
        await app.page.selectOption("#sec_dir", "Import");
        await app.page.click("#sec_add");
        await app.page.waitForTimeout(300);
        h.contains(await app.page.evaluate(() => document.getElementById("sec_tbl").textContent),
          "NOT INVOICED", "an uninvoiced AWB must be flagged");
        h.assert(await app.page.evaluate(() =>
          getComputedStyle(document.getElementById("sec_missingpanel")).display !== "none"),
          "the missing-invoice alert panel must be visible");
      } finally { await app.close(); }
    },

    "delete removes the correct record even when the list is filtered": async (h) => {
      // Regression: rows were keyed by their index in a filtered+sorted copy, so
      // a direction filter or an acknowledged record made delete hit the wrong row.
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Facility Security");
        const add = async (awb, dir) => {
          await app.page.fill("#sec_awb", awb);
          await app.page.selectOption("#sec_dir", dir);
          await app.page.click("#sec_add");
          await app.page.waitForTimeout(200);
        };
        await add("780-30150001", "Export");
        await add("780-30150002", "Import");
        await add("780-30150003", "Export");

        // acknowledge the middle one so raw indices no longer match visible rows
        await app.page.evaluate(() => {
          DB.sec.filter((x) => x.awb === "780-30150002")[0].ack = true;
          save(); renderSecurity();
        });
        await app.page.selectOption("#sec_dirfilter", "Export");
        await app.page.waitForTimeout(250);

        await app.page.evaluate(() => {
          const row = Array.from(document.querySelectorAll("#sec_tbl tbody tr"))
            .find((r) => r.textContent.indexOf("780-30150003") >= 0);
          row.querySelector("button.secrm").click();
        });
        await app.page.waitForTimeout(250);
        await h.modalClick(app.page, "Delete");

        const sec = await app.page.evaluate(() => DB.sec.map((x) => x.awb));
        h.assert(sec.indexOf("780-30150003") < 0, "the targeted record must be deleted");
        h.assert(sec.indexOf("780-30150001") >= 0, "an untargeted record must survive");
        h.assert(sec.indexOf("780-30150002") >= 0, "the acknowledged record must survive");
      } finally { await app.close(); }
    },

    "block paste adds many AWBs and skips duplicates": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Facility Security");
        await app.page.selectOption("#sec_dir", "Import");
        await app.page.fill("#sec_block", "780-30160001\n780-30160002\n780-30160003");
        await app.page.click("#sec_blockadd");
        await app.page.waitForTimeout(400);
        h.eq(await app.page.evaluate(() => DB.sec.filter((x) => !x.ack).length), 3, "three added");
        await app.page.fill("#sec_block", "780-30160001\n780-30160004");
        await app.page.click("#sec_blockadd");
        await app.page.waitForTimeout(400);
        h.eq(await app.page.evaluate(() => DB.sec.filter((x) => !x.ack).length), 4,
          "the duplicate must be skipped, only the new AWB added");
      } finally { await app.close(); }
    },
  },
};
