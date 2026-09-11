/* Payment breakdown rules. */

/* [mode, amount label, amount field, pay key, Invoice Register column] */
const MODES = [
  ["Cash", "Cash Collected (AED)", "a_pay_cash", "cash", 6],
  ["Card", "Card (AED)", "a_pay_card", "card", 9],
  ["Credit", "Credit (AED)", "a_pay_credit", "credit", 10],
  ["CASS", "CASS (AED)", "a_pay_cass", "cass", 11],
  ["Bank Transfer", "Bank Transfer (AED)", "a_pay_bank", "bank", 12],
];

async function closePreview(page) {
  await page.evaluate(() => Array.from(document.querySelectorAll("#modal button"))
    .find((b) => b.textContent.trim() === "Close").click());
  await page.waitForTimeout(200);
}

async function printedText(page) {
  await page.click("#a_preview");
  await page.waitForTimeout(400);
  return page.evaluate(() => document.getElementById("printarea").textContent);
}

module.exports = {
  name: "Payment modes & breakdown",
  tests: {
    "every mode shows its amount, blank, and the reason box": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        for (const [mode, label, id] of MODES) {
          if (mode !== "Cash") await h.payMode(app.page, "export", mode);
          const f = await app.page.evaluate((id) => {
            const vis = Array.from(document.getElementById("a_payfields").children)
              .filter((c) => getComputedStyle(c).display !== "none");
            const el = document.getElementById(id);
            return { labels: vis.map((c) => c.textContent.trim()), value: el.value, hint: el.placeholder };
          }, id);
          h.eq(f.labels.length, 2, mode + " shows its amount and the reason");
          h.contains(f.labels[0], label, mode + " amount label");
          h.contains(f.labels[1], "Reason the amount differs from the total", mode + " reason box");
          h.eq(f.value, "", mode + " amount starts blank");
          h.contains(f.hint, "full total", mode + " says blank means the full total");
        }
      } finally { await app.close(); }
    },

    "a blank amount saves the full total against the method in use": async (h) => {
      const app = await h.openApp();
      try {
        let n = 20;
        for (const [mode, , , key] of MODES) {
          await h.fillAdvice(app.page, "export", {
            cust: h.SAMPLE_CUSTOMER.name, mawb: "780-301000" + n++, wt: 100, pcs: 5 });
          await h.payMode(app.page, "export", mode);
          const msg = await h.saveAdvice(app.page, "export");
          h.contains(msg, "Invoice saved", mode + " saves without a reason");
          const d = await h.db(app.page);
          const e = d.entries[d.entries.length - 1];
          h.eq(e.payMode, mode, "pay mode");
          h.eqMoney(e.total, 84, "50 AWB + 34 handling minimum");
          h.eqMoney(e.pay[key], e.total, mode + " carries the invoice total");
          h.eqMoney(e.pay.cash + e.pay.card + e.pay.credit + e.pay.cass + e.pay.bank, e.total, mode + ": nothing else");
          h.eq(e.payReason, "", mode + ": no reason recorded");
        }
      } finally { await app.close(); }
    },

    "an amount different from the total cannot be saved without a reason": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100012", wt: 100, pcs: 5 });
        for (const [mode, , id] of MODES) {
          await h.payMode(app.page, "export", mode);
          /* Credit types a zero: a typed 0 is an amount, not a blank */
          const typed = mode === "Credit" ? "0" : "60";
          await app.page.fill("#" + id, typed);
          const msg = await h.saveAdvice(app.page, "export");
          h.contains(msg, mode + " AED " + Number(typed).toFixed(2) + " differs from the total AED 84.00. Give the reason.",
            mode + " save is refused");
          h.eq(await app.page.evaluate(() => document.activeElement.id), "a_pay_reason", mode + ": the reason box is focused");
        }
        h.eq((await h.db(app.page)).entries.filter((e) => e.type === "invoice").length, 0, "nothing saved");
      } finally { await app.close(); }
    },

    "the invoice prints the full charges; the register records the amount typed and why": async (h) => {
      const app = await h.openApp();
      try {
        let n = 40;
        const saved = [];
        for (const [mode, , id, key, col] of MODES) {
          const reason = "Earlier overcharge settled " + mode;
          await h.fillAdvice(app.page, "export", {
            cust: h.SAMPLE_CUSTOMER.name, mawb: "780-301000" + n++, wt: 100, pcs: 5 });
          await h.payMode(app.page, "export", mode);
          await app.page.fill("#" + id, "60");
          await app.page.fill("#a_pay_reason", reason);

          const printed = await printedText(app.page);
          h.contains(printed, "84.00", mode + ": the advice shows the full charges");
          h.assert(printed.indexOf("60.00") < 0, mode + ": the amount typed is not on the advice");
          h.assert(printed.indexOf(reason) < 0, mode + ": nor is the reason");
          await closePreview(app.page);

          const msg = await h.saveAdvice(app.page, "export");
          h.contains(msg, mode + " AED 60.00 against charges AED 84.00", mode + ": saved, saying what was recorded");
          const d = await h.db(app.page);
          const e = d.entries[d.entries.length - 1];
          h.eqMoney(e.total, 84, mode + ": the invoice total stays the full charges");
          h.eqMoney(e.pay[key], 60, mode + ": the amount typed is kept");
          h.eqMoney(e.pay.cash + e.pay.card + e.pay.credit + e.pay.cass + e.pay.bank, 60, mode + ": other methods zeroed");
          h.eq(e.payReason, reason, mode + ": the reason is kept");
          saved.push({ id: e.id, mode, col, reason });
        }

        await h.tab(app.page, "Invoice Register");
        for (const x of saved) {
          const row = await app.page.evaluate((id) =>
            Array.from(document.querySelector('#regtbl tr[data-id="' + id + '"]').cells).map((c) => c.textContent.trim()), x.id);
          h.eq(row[x.col], "60.00", x.mode + ": the register column shows the amount typed");
          h.eq(row[13], "84.00", x.mode + ": Total Sale is the full charges");
          h.contains(row[14], "Amount differs from total: " + x.reason, x.mode + ": Remarks gives the reason");
          const exported = await app.page.evaluate((id) => regRows(DB.entries.filter((e) => e.id === id)).slice(-1)[0], x.id);
          h.contains(exported[18], "[amount differs from total: " + x.reason + "]", x.mode + ": the export carries the reason");
        }
      } finally { await app.close(); }
    },

    "Cash + Card shows both amounts and the reason box": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        await h.payMode(app.page, "export", "Cash + Card");
        const vis = await app.page.evaluate(() =>
          Array.from(document.getElementById("a_payfields").children)
            .filter((c) => getComputedStyle(c).display !== "none")
            .map((c) => c.textContent.trim()));
        h.eq(vis.length, 3, "Cash + Card shows two amounts and the reason");
        h.contains(vis.join("|"), "Cash Collected", "cash field");
        h.contains(vis.join("|"), "Card (AED)", "card field");
        h.contains(vis.join("|"), "Reason the amount differs", "reason box");
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

    "a Cash + Card split needs its amounts, and a reason when it does not add up": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100014", wt: 100, pcs: 5 });
        await h.payMode(app.page, "export", "Cash + Card");
        h.contains(await h.saveAdvice(app.page, "export"), "Enter the cash and card amounts", "blank split refused");
        await app.page.fill("#a_pay_cash", "45");
        await app.page.fill("#a_pay_card", "25");
        h.contains(await h.saveAdvice(app.page, "export"),
          "Cash + Card AED 70.00 differs from the total AED 84.00. Give the reason.", "short split refused");
        await app.page.fill("#a_pay_reason", "Earlier overcharge settled");
        const printed = await printedText(app.page);
        h.contains(printed, "84.00", "the advice shows the full charges");
        h.assert(printed.indexOf("45.00") < 0 && printed.indexOf("25.00") < 0, "a split that does not add up is not printed");
        await closePreview(app.page);
        h.contains(await h.saveAdvice(app.page, "export"), "Invoice saved", "saves with the reason");
        const d = await h.db(app.page);
        const e = d.entries[d.entries.length - 1];
        h.eqMoney(e.pay.cash, 45, "cash portion");
        h.eqMoney(e.pay.card, 25, "card portion");
        h.eq(e.payReason, "Earlier overcharge settled", "reason kept");
      } finally { await app.close(); }
    },

    "changing mode clears the amount and reason; clicking the same mode keeps them": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        await app.page.fill("#a_pay_cash", "60");
        await app.page.fill("#a_pay_reason", "anything");
        await h.payMode(app.page, "export", "Cash");
        h.eq(await app.page.inputValue("#a_pay_cash"), "60", "same mode keeps the amount");
        h.eq(await app.page.inputValue("#a_pay_reason"), "anything", "and the reason");
        await h.payMode(app.page, "export", "Card");
        await h.payMode(app.page, "export", "Cash");
        h.eq(await app.page.inputValue("#a_pay_cash"), "", "the cash box is blank again");
        h.eq(await app.page.inputValue("#a_pay_reason"), "", "and so is the reason");
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
