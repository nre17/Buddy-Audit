/* Boundary validation, source updates, and failure-safe domain commands. */
module.exports = {
  name: "Domain integrity",
  tests: {
    "new imports retain older manifest records until explicitly cleared": async (h) => {
      const app = await h.openApp();
      try {
        const result = await app.page.evaluate(() => {
          const rows = shDemoItems();
          shImport([rows[0]]);
          SH.items[0].importedAt = Date.now() - 60 * 864e5;
          shSave();
          shImport([rows[1]]);
          return {count: SH.items.length, originalPresent: !!shFind(rows[0].awb)};
        });
        h.eq(result.count, 2); h.assert(result.originalPresent, "old manifest row remains available");
        app.assertNoErrors();
      } finally { await app.close(); }
    },
    "preview, print and save reject impossible shipment quantities and chronology": async (h) => {
      const app = await h.openApp();
      try {
        for (const mode of ["export", "import"]) {
          await h.fillAdvice(app.page, mode, { mawb: "780-30909801", cust: h.SAMPLE_CUSTOMER.name,
            wt: 100, pcs: 2, t1: "2026-09-15T08:00", t2: "2026-09-15T12:00" });
          const results = await app.page.evaluate((mode) => {
            const p = mode === "export" ? "a" : "i", output = [];
            const originalPrint = printAdvice;
            let printed = 0;
            window.printAdvice = () => { printed++; };
            try {
              for (const [field, value, message] of [["wt", "-5", "Gross weight"], ["pcs", "-2", "Pieces"],
                ["pcs", "2.5", "Pieces"], ["t2", "2026-09-14T12:00", "cannot be before"]]) {
                document.getElementById(p + "_wt").value = "100";
                document.getElementById(p + "_pcs").value = "2";
                document.getElementById(p + "_t2").value = "2026-09-15T12:00";
                document.getElementById(p + "_" + field).value = value;
                for (const action of ["preview", "print", "save"]) {
                  document.getElementById(p + "_" + action).click();
                  output.push({ action, message, toast: document.getElementById("toast").textContent });
                }
              }
              return { output, printed, invoices: DB.entries.length };
            } finally { window.printAdvice = originalPrint; }
          }, mode);
          for (const result of results.output) h.contains(result.toast, result.message, mode + " " + result.action);
          h.eq(results.printed, 0, "invalid advice never reaches printing");
          h.eq(results.invoices, 0, "invalid advice never reaches ledger");
        }
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "negative payments and charge inputs cannot become issued invoices": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { mawb: "780-30909802", cust: h.SAMPLE_CUSTOMER.name, wt: 100, pcs: 2 });
        await app.page.fill("#a_pay_cash", "-1");
        await app.page.fill("#a_pay_reason", "Demo correction");
        h.contains(await h.saveAdvice(app.page, "export"), "Payment amount must be", "a reason does not authorize negative cash");
        await app.page.fill("#a_pay_cash", "");
        const errors = await app.page.evaluate(() => {
          const row = document.querySelector("#a_lines tr[data-lid]"), output = [];
          for (const field of ["rate", "qty", "min"]) {
            const input = row.querySelector('[data-f="' + field + '"]'), original = input.value;
            input.value = "-1";
            document.getElementById("a_save").click();
            output.push(document.getElementById("toast").textContent);
            input.value = original;
          }
          return output;
        });
        for (const error of errors) h.contains(error, "must be a nonnegative", "invalid charge input refused");
        h.eq((await h.db(app.page)).entries.length, 0);
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "failed ledger persistence preserves draft, sequence, ledger and warehouse": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", { mawb: "780-30909803", cust: h.SAMPLE_CUSTOMER.name, wt: 100, pcs: 2 });
        const result = await app.page.evaluate(() => {
          const original = Storage.prototype.setItem;
          const seq = JSON.stringify(DB.seq), entries = JSON.stringify(DB.entries), warehouse = JSON.stringify(LL);
          Storage.prototype.setItem = function (key, value) {
            if (key === SolitAir.storageKey) throw new DOMException("Simulated full storage", "QuotaExceededError");
            return original.call(this, key, value);
          };
          try {
            saveAdvice("export");
            return { unchanged: entries === JSON.stringify(DB.entries), sequence: seq === JSON.stringify(DB.seq),
              warehouse: warehouse === JSON.stringify(LL), draft: document.getElementById("a_mawb").value,
              toast: document.getElementById("toast").textContent };
          } finally { Storage.prototype.setItem = original; }
        });
        h.assert(result.unchanged && result.sequence && result.warehouse, "failed transaction has no domain side effects");
        h.eq(result.draft, "780-30909803", "draft retained for retry");
        h.contains(result.toast, "not saved", "failure is visible");
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "retry works");
        h.eq((await h.db(app.page)).entries.length, 1, "retry creates one invoice");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "manifest numeric errors stay visible and block the whole import": async (h) => {
      const app = await h.openApp();
      try {
        const result = await app.page.evaluate(() => {
          const rejected = ["1,25", "1e3", "unknown", "-2", "0"].map((value) => {
            const parsed = shParseManifest("AWB\tGross Weight\tPieces\n780-30909804\t" + value + "\t2");
            return { value, invalid: parsed.invalid, weight: parsed.items[0].wt, result: shImport(parsed.items) };
          });
          const fractional = shParseManifest("AWB\tGross Weight\tPieces\n780-30909804\t100\t2.5");
          return { rejected, fractional: fractional.invalid, count: SH.items.length, thousands: strictNumber("1,000.25") };
        });
        for (const item of result.rejected) {
          h.eq(item.invalid, 1, item.value + " invalid row"); h.eq(item.weight, null, "never invent a weight");
          h.eq(item.result, null, "invalid batch does not commit");
        }
        h.eq(result.fractional, 1, "pieces must be an integer");
        h.eq(result.count, 0); h.eq(result.thousands, 1000.25, "unambiguous thousands format supported");
        await h.tab(app.page, "Shipment Database");
        await app.page.fill("#sh_paste", "AWB\tGross Weight\tPieces\n780-30909804\tunknown\t2");
        await app.page.click("#sh_preview");
        h.assert(await app.page.isDisabled("#sh_import"), "invalid preview cannot import");
        h.contains(await app.page.textContent("#sh_result"), "invalid row", "correction is explained");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "manifest titles are accepted and missing values differ from invalid dates": async (h) => {
      const app = await h.openApp();
      try {
        const result = await app.page.evaluate(() => {
          const titles = [",", ";", "\t"].map((delimiter) => {
            const parsed = shParseManifest("Daily manifest\n" + ["AWB", "Gross Weight", "Pieces"].join(delimiter)
              + "\n" + ["780-30909805", "100", "2"].join(delimiter));
            return { count: parsed.items.length, weight: parsed.items[0].wt };
          });
          const missing = shParseManifest("AWB\tGross Weight\tPieces\n780-30909805\t\t");
          const invalid = shParseManifest("AWB\tDeparture\n780-30909805\t31/02/2026 10:00");
          return { titles, missing: missing.items[0], invalid: invalid.invalid };
        });
        for (const item of result.titles) { h.eq(item.count, 1); h.eq(item.weight, 100); }
        h.eq(result.missing.wt, null); h.eq(result.missing.pcs, null);
        h.contains(result.missing.warn.join(","), "no gross weight");
        h.eq(result.missing.errors.length, 0, "a missing field can be entered on the advice");
        h.eq(result.invalid, 1, "invalid dates require correction before import");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "reimport refreshes unedited shipment fields and preserves manual draft edits": async (h) => {
      const app = await h.openApp();
      try {
        const manifest = (weight, flight) => h.manifestText(h.MANIFEST_HEADER, [["780-30909806", "DWC", "ISU", flight,
          "2026-09-20T12:00", "", "GEN", "Demo goods", 2, weight, h.SAMPLE_CUSTOMER.name]]);
        await h.importManifest(app.page, manifest(100, "ZZ 901"));
        await h.fillAdvice(app.page, "export", { mawb: "780-30909806", bill: h.OTHER_CUSTOMER.name });
        await h.importManifest(app.page, manifest(900, "ZZ 902"));
        h.eq(await app.page.inputValue("#a_wt"), "900", "source-derived weight refreshed");
        h.eq(await app.page.inputValue("#a_fltno"), "ZZ 902", "source-derived flight refreshed");
        await h.fillAdvice(app.page, "export", { wt: 750 });
        await h.importManifest(app.page, manifest(950, "ZZ 903"));
        h.eq(await app.page.inputValue("#a_wt"), "750", "manual weight kept");
        h.eq(await app.page.inputValue("#a_fltno"), "ZZ 903", "unedited flight still follows source");
        h.eq(await app.page.inputValue("#a_bill"), h.OTHER_CUSTOMER.name, "billing choice retained");
        h.contains(await app.page.textContent("#a_awbstatus"), "manual edits were kept", "reconciliation explained");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "a failed shipment write retains the loaded records and import text": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Shipment Database");
        await app.page.fill("#sh_paste", "AWB\tGross Weight\tPieces\n780-30909807\t100\t2");
        await app.page.click("#sh_preview");
        const result = await app.page.evaluate(() => {
          const original = shSave;
          window.shSave = () => false;
          try {
            document.getElementById("sh_import").click();
            return { count: SH.items.length, text: document.getElementById("sh_paste").value };
          } finally { window.shSave = original; }
        });
        h.eq(result.count, 0, "failed import rolled back");
        h.contains(result.text, "780-30909807", "source text remains for retry");
        app.assertNoErrors();
      } finally { await app.close(); }
    },
  },
};
