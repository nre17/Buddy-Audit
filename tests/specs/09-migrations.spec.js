/*
 * Legacy data migrations. Counter machines carry live localStorage written by
 * older builds. These two backfills run in load(); if either regresses, staff
 * lose visibility of historical invoices without any error being shown.
 */
module.exports = {
  name: "Legacy data migrations",
  tests: {
    "invoices saved before the type field are tagged and become visible again": async (h) => {
      const legacy = {
        solitair_db: {
          openingBalance: 0, openingNote: "", openingDate: "",
          seq: { export: 1, import: 0 }, customers: [], staff: "Counter 1",
          rates: {}, logo: null, sec: [],
          entries: [
            { id: "INV_LEGACY_1", mode: "Export", mawb: "780-30180001",
              cust: "Legacy Customer LLC", staff: "Counter 1", date: "2026-09-01",
              ts: "2026-09-01T10:00:00.000Z", total: 150, wt: 100, pcs: 5, items: [],
              payMode: "Cash", pay: { cash: 150, card: 0, credit: 0, cass: 0, bank: 0, prepaid: 0 } },
            { id: "HO_LEGACY_1", type: "handover", amount: 50, staff: "Counter 1",
              note: "", date: "2026-09-01", ts: "2026-09-01T12:00:00.000Z" },
          ],
        },
      };
      const app = await h.openApp({ seed: legacy });
      try {
        const d = await h.db(app.page);
        h.eq(d.entries.filter((e) => e.id === "INV_LEGACY_1")[0].type, "invoice",
          "legacy invoice should be backfilled as an invoice");
        h.eq(d.entries.filter((e) => e.id === "HO_LEGACY_1")[0].type, "handover",
          "an existing handover tag must be preserved");

        await h.tab(app.page, "Dashboard");
        h.contains(await app.page.evaluate(() => document.getElementById("d_kpis").textContent),
          "150.00", "legacy invoice must appear in dashboard revenue");

        h.assert(await app.page.evaluate(() => !!findInvoiceByAWB("780-30180001")),
          "facility security must be able to match the legacy AWB");
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "reception records saved before the id field get one and remain deletable": async (h) => {
      const legacy = {
        solitair_db: {
          openingBalance: 0, openingNote: "", openingDate: "", entries: [],
          seq: { export: 0, import: 0 }, customers: [], staff: "Counter 1",
          rates: {}, logo: null,
          sec: [{ awb: "780-30190001", dir: "Import", by: "ACC",
                  ts: "2026-09-01T09:00:00.000Z", ack: false }],
        },
      };
      const app = await h.openApp({ seed: legacy });
      try {
        h.assert(await app.page.evaluate(() => !!DB.sec[0].id),
          "legacy reception record should be backfilled with an id");
        await h.tab(app.page, "Facility Security");
        await app.page.evaluate(() => {
          const row = Array.from(document.querySelectorAll("#sec_tbl tbody tr"))
            .find((r) => r.textContent.indexOf("780-30190001") >= 0);
          row.querySelector("button.secrm").click();
        });
        await app.page.waitForTimeout(250);
        await h.modalClick(app.page, "Delete");
        h.eq(await app.page.evaluate(() => DB.sec.length), 0,
          "a backfilled legacy record must still be deletable");
        app.assertNoErrors();
      } finally { await app.close(); }
    },
  },
};
