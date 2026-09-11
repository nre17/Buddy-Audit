/*
 * Tariff engine. These assertions encode the signed-off rate card
 * (docs/03-business-rules.md). If one of these fails, either the rates were
 * changed without authorisation or the auto-apply logic regressed.
 */
module.exports = {
  name: "Charge engine (auto-apply, minimums, VAT)",
  tests: {
    "a fresh export advice charges only the AWB fee (50.00)": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        h.eqMoney(await app.page.$eval("#a_total", (e) => e.textContent), 50,
          "empty export advice should total the AWB fee alone");
      } finally { await app.close(); }
    },

    "a fresh import advice charges only the DO fee (50.00)": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Import Advice");
        h.eqMoney(await app.page.$eval("#i_total", (e) => e.textContent), 50,
          "empty import advice should total the DO fee alone");
      } finally { await app.close(); }
    },

    "general handling applies the 34.00 minimum below the break-even weight": async (h) => {
      // 100 kg x 0.15 = 15.00, which is under the 34.00 minimum.
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { wt: 100 });
        const row = await h.chargeRow(app.page, "ex_handling_gen");
        h.eq(row.qty, "100", "handling qty should track gross weight");
        h.eqMoney(row.charge, 34, "minimum charge should apply");
        h.eqMoney(await app.page.$eval("#a_total", (e) => e.textContent), 84, "50 AWB + 34 handling");
      } finally { await app.close(); }
    },

    "general handling bills per-kg above the break-even weight": async (h) => {
      // 500 kg x 0.15 = 75.00, above the 34.00 minimum.
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { wt: 500 });
        h.eqMoney((await h.chargeRow(app.page, "ex_handling_gen")).charge, 75, "500kg x 0.15");
      } finally { await app.close(); }
    },

    "SHC selects the cargo class and only that class is charged": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { wt: 500, shc: "PER" });
        h.eqMoney((await h.chargeRow(app.page, "ex_handling_per")).charge, 120, "perishable 500 x 0.24");
        h.eqMoney((await h.chargeRow(app.page, "ex_handling_gen")).charge, 0, "general must not also charge");
        h.eqMoney((await h.chargeRow(app.page, "ex_handling_spc")).charge, 0, "special must not also charge");
      } finally { await app.close(); }
    },

    "HAWB fee multiplies by HAWB quantity (1=50, 2=100, 3=150)": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        for (const [qty, expected] of [[1, 50], [2, 100], [3, 150], [0, 0]]) {
          await app.page.fill("#a_hawbqty", String(qty));
          await app.page.waitForTimeout(200);
          h.eqMoney((await h.chargeRow(app.page, "ex_hawb")).charge, expected,
            "HAWB qty " + qty);
        }
      } finally { await app.close(); }
    },

    "storage: 72h general = 1 chargeable day, and the readout agrees": async (h) => {
      // free period 48h; excess 24h; ceil(24/24) = 1 day; 500kg x 0.15 x 1 = 75.00
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { wt: 500, t1: "2026-09-01T08:00", t2: "2026-09-04T08:00" });
        const info = await app.page.$eval("#a_storageinfo", (e) => e.textContent);
        h.contains(info, "72.0 hrs", "elapsed hours readout");
        h.contains(info, "1 day(s)", "chargeable days readout");
        h.eqMoney((await h.chargeRow(app.page, "ex_stor_gen")).charge, 75, "500kg x 0.15 x 1 day");
      } finally { await app.close(); }
    },

    "storage: perishables get only 8 free hours, so the same gap costs more days": async (h) => {
      // 108h elapsed. General: (108-48)/24 -> 3 days. Perishable: (108-8)/24 -> 5 days.
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "import", { wt: 500, t1: "2026-09-01T08:00", t2: "2026-09-05T20:00" });
        h.contains(await app.page.$eval("#i_storageinfo", (e) => e.textContent), "3 day(s)", "general days");
        await app.page.selectOption("#i_shc", "PER");
        await app.page.waitForTimeout(300);
        const per = await app.page.$eval("#i_storageinfo", (e) => e.textContent);
        h.contains(per, "Perishable", "class label should switch");
        h.contains(per, "5 day(s)", "perishable days");
      } finally { await app.close(); }
    },

    "storage does not charge inside the free period": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { wt: 500, t1: "2026-09-01T08:00", t2: "2026-09-02T08:00" });
        h.eqMoney((await h.chargeRow(app.page, "ex_stor_gen")).charge, 0, "24h is inside the 48h free period");
      } finally { await app.close(); }
    },

    "DG inspection auto-applies on SHC=DGR and can be rejected": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { wt: 100, shc: "DGR" });
        h.eqMoney((await h.chargeRow(app.page, "ex_dgr")).charge, 350, "DGR should auto-apply");
        await app.page.check("#a_dgr_reject");
        await app.page.waitForTimeout(250);
        h.eqMoney((await h.chargeRow(app.page, "ex_dgr")).charge, 0, "reject checkbox should zero it");
      } finally { await app.close(); }
    },

    "late acceptance auto-applies within 5h of departure, with 5% VAT": async (h) => {
      // 4h gap, 500 kg. 500 x 0.53 = 265.00, over the 68.00 min. +5% VAT = 278.25
      const app = await h.openApp();
      try {
        const t1 = await h.localDT(app.page, 0);
        const t2 = await h.localDT(app.page, 4);
        await h.fillAdvice(app.page, "export", { wt: 500, t1, t2 });
        h.eqMoney((await h.chargeRow(app.page, "ex_lateaccept")).charge, 278.25,
          "265.00 + 5% VAT");
      } finally { await app.close(); }
    },

    "late acceptance does not apply outside the 5h window": async (h) => {
      const app = await h.openApp();
      try {
        const t1 = await h.localDT(app.page, 0);
        const t2 = await h.localDT(app.page, 9);
        await h.fillAdvice(app.page, "export", { wt: 500, t1, t2 });
        h.eqMoney((await h.chargeRow(app.page, "ex_lateaccept")).charge, 0, "9h gap is not late acceptance");
      } finally { await app.close(); }
    },

    "optional tariff charges add on selection, dedupe, and carry real rates": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        const before = await app.page.evaluate(() => document.querySelectorAll("#a_lines tr[data-lid]").length);
        await app.page.selectOption("#a_optsel", "ex_opt_skid");
        await app.page.waitForTimeout(300);
        const after = await app.page.evaluate(() => document.querySelectorAll("#a_lines tr[data-lid]").length);
        h.eq(after, before + 1, "selecting a tariff charge should add it immediately (no extra button)");

        const row = await app.page.evaluate(() => {
          const r = document.querySelector('tr[data-catid="ex_opt_skid"]');
          return { rate: r.querySelector('[data-f="rate"]').value, min: r.querySelector('[data-f="min"]').value };
        });
        h.eqMoney(row.rate, 197, "skid dismantling rate");
        h.eq(await app.page.$eval("#a_optsel", (e) => e.value), "", "picker should reset after adding");

        // selecting the same charge again must not duplicate the line
        await app.page.selectOption("#a_optsel", "ex_opt_skid");
        await app.page.waitForTimeout(300);
        h.eq(await app.page.evaluate(() => document.querySelectorAll('tr[data-catid="ex_opt_skid"]').length), 1,
          "the same tariff charge must not be added twice");
      } finally { await app.close(); }
    },

    "zero-quantity lines never reach the saved invoice or the print copy": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100002", wt: 100, pcs: 5, shc: "DGR",
        });
        await app.page.click("#a_preview");
        await app.page.waitForTimeout(300);
        const text = await app.page.evaluate(() => document.getElementById("mBody").textContent);
        h.contains(text, "Cargo Acceptance Handling", "AWB fee should print");
        h.contains(text, "Dangerous Goods Inspection", "DG inspection should print");
        h.notContains(text, "Perishable Cargo Handling", "an inapplicable line must not print");
        h.notContains(text, "Free Storage Period", "a zero-charge line must not print");
      } finally { await app.close(); }
    },

    "every SHC code bills handling and storage at its own cargo class, on both advices": async (h) => {
      // 108 h elapsed at 500 kg: general and special cargo get 48 h free (3 days), perishable 8 h (5 days)
      const LINES = { general: "gen", special: "spc", perishable: "per" };
      const label = { general: "General", special: "Special", perishable: "Perishable" };
      for (const [mode, p, pre] of [["export", "a", "ex"], ["import", "i", "im"]]) {
        const app = await h.openApp();
        try {
          await h.fillAdvice(app.page, mode, { wt: 500, t1: "2026-09-01T08:00", t2: "2026-09-05T20:00" });
          const codes = await app.page.evaluate(() => CFG.shcCodes.map((s) => [s.c, s.k]));
          h.eq(codes.filter(([, k]) => k === "general").map(([c]) => c).join(), "GEN,ELI", "only GEN and ELI are general");
          h.eq(codes.filter(([, k]) => k === "perishable").map(([c]) => c).join(), "PER,PEP,PEF,PEM,PES", "the perishable codes");
          for (const [code, cls] of codes) {
            await app.page.selectOption("#" + p + "_shc", code);
            await app.page.waitForTimeout(100);
            const days = cls === "perishable" ? 5 : 3;
            for (const [k, suffix] of Object.entries(LINES)) {
              const on = k === cls;
              h.eq(Number((await h.chargeRow(app.page, pre + "_handling_" + suffix)).qty), on ? 500 : 0,
                mode + " " + code + ": " + k + " handling");
              h.eq(Number((await h.chargeRow(app.page, pre + "_stor_" + suffix)).qty), on ? 500 * days : 0,
                mode + " " + code + ": " + k + " storage");
            }
            const info = await app.page.$eval("#" + p + "_storageinfo", (e) => e.textContent);
            h.contains(info, "Free period (" + label[cls] + "): " + (cls === "perishable" ? 8 : 48) + " hrs", mode + " " + code + ": free period");
            h.contains(info, days + " day(s)", mode + " " + code + ": chargeable days");
            h.contains(info, mode === "export" ? "Elapsed since acceptance" : "Elapsed since RCF", mode + ": what the time is counted from");
          }
        } finally { await app.close(); }
      }
    },

    "several SHC codes, or a code not in the list, follow the cargo class rule": async (h) => {
      const app = await h.openApp();
      try {
        const got = await app.page.evaluate(() =>
          ["GEN", "ELI", "ELI GEN", "PER", "PER COL", "COL,PEM", "AVI", "ELI DGR", "XYZ", "GEM", ""]
            .map((c) => c + "=" + shcClass(c)).join(" | "));
        h.eq(got, "GEN=general | ELI=general | ELI GEN=general | PER=perishable | PER COL=perishable | COL,PEM=perishable"
          + " | AVI=special | ELI DGR=special | XYZ=special | GEM=special | =general", "class by rule");
        h.eq(await app.page.evaluate(() => [shcHas("ELI DGR", "DGR"), shcHas("DGRX", "DGR")].join()), "true,false",
          "DGR is found among several codes, and only as a whole code");
      } finally { await app.close(); }
    },

    "free storage hours can be changed, to zero too, and the SHC reference follows": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Rates");
        await app.page.fill("#fh_gen", "24");
        await app.page.fill("#fh_per", "0");
        await app.page.click("#saveFH");
        await app.page.waitForTimeout(200);
        const hours = await app.page.evaluate(() =>
          [CFG.freeHours.general, CFG.freeHours.special, CFG.freeHours.perishable, DB.freeHours.perishable].join());
        h.eq(hours, "24,24,0,0", "general and special 24 h, perishable 0 h, saved");
        const ref = await app.page.$eval("#shcref", (e) => e.textContent);
        h.contains(ref, "GEN and ELI bill as general cargo, 24 hrs free", "the reference follows the saved hours");
        h.contains(ref, "bill as perishable cargo, 0 hrs free", "zero included");
        h.contains(ref, "including one not in this list, bills as special cargo, 24 hrs free", "and states the special rule");

        // 108 h elapsed. General at 24 h free: ceil(84/24) = 4 days. Perishable at 0 h: ceil(108/24) = 5 days.
        await h.fillAdvice(app.page, "import", { wt: 500, t1: "2026-09-01T08:00", t2: "2026-09-05T20:00" });
        h.contains(await app.page.$eval("#i_storageinfo", (e) => e.textContent), "4 day(s)", "general at 24 h free");
        await app.page.selectOption("#i_shc", "PER");
        await app.page.waitForTimeout(200);
        h.contains(await app.page.$eval("#i_storageinfo", (e) => e.textContent), "5 day(s)", "perishable at 0 h free");
      } finally { await app.close(); }
    },
  },
};
