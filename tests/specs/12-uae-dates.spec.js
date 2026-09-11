/* Dates are shown and typed day-first, the UAE way (dd/mm/yyyy), and stored ISO. */

/** What the field shows, as opposed to its .value, which reads ISO. */
const shown = (page, id) => page.$eval("#" + id, (e) =>
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").get.call(e));
const stored = (page, id) => page.$eval("#" + id, (e) => e.value);
const dayFirst = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) +
  (iso.length > 10 ? " " + iso.slice(11, 16) : "");

module.exports = {
  name: "UAE dates",
  tests: {
    "date and time fields are shown and typed day-first": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        const now = await stored(app.page, "a_t1");
        h.assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(now), "the value stays ISO (" + now + ")");
        h.eq(await shown(app.page, "a_t1"), dayFirst(now), "the field shows dd/mm/yyyy hh:mm");
        h.eq(await app.page.getAttribute("#a_t1", "placeholder"), "dd/mm/yyyy hh:mm", "and says so");

        await app.page.fill("#a_wt", "500");
        await app.page.fill("#a_t1", "01/09/2026 08:00");
        await app.page.fill("#a_t2", "04/09/2026 08:00");
        await app.page.waitForTimeout(250);
        h.eq(await stored(app.page, "a_t1"), "2026-09-01T08:00", "01/09 is 1 September, not 9 January");
        h.eq(await stored(app.page, "a_t2"), "2026-09-04T08:00", "04/09 is 4 September");
        h.contains(await app.page.$eval("#a_storageinfo", (e) => e.textContent), "72.0 hrs", "storage counts three days between them");
        h.eqMoney((await h.chargeRow(app.page, "ex_stor_gen")).charge, 75, "500kg x 0.15 x 1 chargeable day");

        await app.page.fill("#a_t2", "4/9/2026 8:05");
        await app.page.press("#a_t2", "Tab");
        h.eq(await shown(app.page, "a_t2"), "04/09/2026 08:05", "a short entry is tidied on leaving the field");
      } finally { await app.close(); }
    },

    "a date that cannot be read turns the field red and counts as empty": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        for (const bad of ["31/02/2026 10:00", "13/13/2026 10:00", "05/09/2026", "05/09/2026 25:00"]) {
          await app.page.fill("#a_t2", bad);
          await app.page.press("#a_t2", "Tab");
          const f = await app.page.$eval("#a_t2", (e) => ({ red: e.classList.contains("dtbad"), value: e.value }));
          h.assert(f.red, bad + " is marked");
          h.eq(f.value, "", bad + " counts as empty");
          h.eq(await app.page.evaluate(() => collectAdvice("export").t2), "", bad + " is not saved as a time");
        }
        await app.page.fill("#a_t2", "28/02/2026 10:00");
        await app.page.press("#a_t2", "Tab");
        h.assert(!(await app.page.$eval("#a_t2", (e) => e.classList.contains("dtbad"))), "a real date clears the mark");
      } finally { await app.close(); }
    },

    "every date field in the app is day-first, dialogs included": async (h) => {
      const app = await h.openApp();
      try {
        const fields = await app.page.evaluate(() => ({
          native: document.querySelectorAll('input[type="date"]:not(.dtnative), input[type="datetime-local"]:not(.dtnative)').length,
          dayFirst: Array.from(document.querySelectorAll("input[data-dt]")).map((e) => e.id + ":" + e.dataset.dt).sort(),
        }));
        h.eq(fields.native, 0, "no browser date input is left showing");
        for (const f of ["a_t1:datetime", "a_t2:datetime", "i_t1:datetime", "i_t2:datetime", "rf_from:date", "rf_to:date",
                         "d_from:date", "d_to:date", "ho_d:date", "ho_from:datetime", "ho_to:datetime", "ll_dep:datetime"]) {
          h.assert(fields.dayFirst.indexOf(f) >= 0, f + " is a day-first field (" + fields.dayFirst.join(", ") + ")");
        }

        await h.tab(app.page, "Invoice Register");
        await app.page.fill("#rf_from", "01/09/2026");
        h.eq(await stored(app.page, "rf_from"), "2026-09-01", "the register filter reads day-first");

        await app.page.click("#btnHandover");
        await app.page.waitForTimeout(200);
        const today = await app.page.evaluate(() => ymd(new Date()));
        h.eq(await app.page.$eval("#ho_date", (e) => e.dataset.dt), "date", "a dialog's date field is day-first too");
        h.eq(await shown(app.page, "ho_date"), dayFirst(today), "and shows today day-first");
      } finally { await app.close(); }
    },

    "the printout, register and exports show dates day-first; the record keeps ISO": async (h) => {
      const app = await h.openApp();
      try {
        await h.fillAdvice(app.page, "export", {
          cust: h.SAMPLE_CUSTOMER.name, mawb: "780-30100090", wt: 100, pcs: 5,
          t1: "2026-09-01T08:00", t2: "2026-09-01T20:00" });
        await app.page.click("#a_preview");
        await app.page.waitForTimeout(400);
        const printed = await app.page.evaluate(() => document.getElementById("printarea").textContent);
        h.contains(printed, "01/09/2026 08:00", "acceptance time on the advice");
        h.contains(printed, "01/09/2026 20:00", "departure time on the advice");
        h.assert(!/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(printed), "no year-first date and time is printed");
        await app.page.evaluate(() => Array.from(document.querySelectorAll("#modal button"))
          .find((b) => b.textContent.trim() === "Close").click());
        await app.page.waitForTimeout(200);

        await h.saveAdvice(app.page, "export");
        const d = await h.db(app.page);
        const e = d.entries[d.entries.length - 1];
        h.assert(/^\d{4}-\d{2}-\d{2}$/.test(e.date), "the record's date stays ISO (" + e.date + ")");
        h.assert(/^\d{4}-\d{2}-\d{2}\/\d{2}$/.test(e.ref), "the reference keeps its year-first date (" + e.ref + ")");
        h.eq(e.t1, "2026-09-01T08:00", "the record's times stay ISO");

        await h.tab(app.page, "Invoice Register");
        const cell = await app.page.evaluate((id) => document.querySelector('#regtbl tr[data-id="' + id + '"]').cells[0].textContent, e.id);
        h.eq(cell, dayFirst(e.date), "the register shows the date day-first");
        const exported = await app.page.evaluate((id) => regRows(DB.entries.filter((x) => x.id === id)).slice(-1)[0][0], e.id);
        h.eq(exported, dayFirst(e.date), "and so do the Excel and CSV exports");
      } finally { await app.close(); }
    },

    "the calendar button's picker fills the field day-first": async (h) => {
      const app = await h.openApp();
      try {
        await h.tab(app.page, "Export Advice");
        h.eq(await app.page.$$eval("#a_t1 + .dtpick", (b) => b.length), 1, "the field has a calendar button");
        await app.page.evaluate(() => {
          const picker = document.querySelector("#a_t1 ~ .dtnative");
          picker.value = "2026-09-05T09:30";
          picker.dispatchEvent(new Event("change"));
        });
        await app.page.waitForTimeout(150);
        h.eq(await shown(app.page, "a_t1"), "05/09/2026 09:30", "the picked date shows day-first");
        h.eq(await stored(app.page, "a_t1"), "2026-09-05T09:30", "and is stored ISO");
      } finally { await app.close(); }
    },
  },
};
