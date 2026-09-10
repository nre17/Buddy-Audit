/* Boot integrity: the app must build all nine tabs with no errors. */
module.exports = {
  name: "Boot & shell",
  tests: {
    "loads with no console or page errors": async (h) => {
      const app = await h.openApp();
      try { app.assertNoErrors(); } finally { await app.close(); }
    },

    "builds all nine tab panels": async (h) => {
      const app = await h.openApp();
      try {
        const ids = ["p-shipments","p-export","p-import","p-lying","p-register",
                     "p-handover","p-dash","p-admin","p-security"];
        for (const id of ids) {
          const filled = await app.page.evaluate((id) => {
            const el = document.getElementById(id);
            return !!el && el.innerHTML.trim().length > 200;
          }, id);
          h.assert(filled, "tab panel #" + id + " did not build");
        }
        app.assertNoErrors();
      } finally { await app.close(); }
    },

    "embedded logo renders in the header": async (h) => {
      const app = await h.openApp();
      try {
        const logo = await app.page.evaluate(() => {
          const img = document.getElementById("brandLogo");
          return { display: img.style.display, isData: img.src.indexOf("data:image/") === 0 };
        });
        h.eq(logo.display, "block", "header logo should be visible");
        h.assert(logo.isData, "logo must be an embedded data: URI (single-file constraint)");
      } finally { await app.close(); }
    },

    "acceptance time defaults to local time, not UTC": async (h) => {
      // Regression: the field used toISOString() and showed Dubai time minus 4h.
      const app = await h.openApp({ timezoneId: "Asia/Dubai" });
      try {
        await h.tab(app.page, "Export Advice");
        const t1 = await app.page.$eval("#a_t1", (el) => el.value);
        const now = await h.localDT(app.page, 0);
        h.eq(t1.slice(0, 16), now.slice(0, 16), "acceptance time should default to local now");
      } finally { await app.close(); }
    },
  },
};
