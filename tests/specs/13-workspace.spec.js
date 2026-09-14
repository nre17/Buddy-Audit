module.exports = {
  name: 'Cargo workspace navigation and connected records',
  tests: {
    'overview shows empty ledger truth and navigates through every destination': async h => {
      const instance = await h.openApp();
      try {
        const { page } = instance;
        await page.locator('[data-ws-route="overview"]').click();
        h.eq(await page.locator('.page.on').getAttribute('id'), 'p-overview');
        h.contains(await page.locator('[data-metric="invoiced"]').textContent(), '0.00');
        h.contains(await page.locator('.ws-sidebar-footer').textContent(), 'Synthetic customer master');
        for (const route of ['shipments', 'export', 'import', 'lying', 'security', 'register', 'handover', 'dash', 'customers', 'admin']) {
          await page.locator(`[data-ws-route="${route}"]`).click();
          h.eq(await page.locator('.page.on').getAttribute('id'), 'p-' + route);
          h.eq(await page.locator(`[data-ws-route="${route}"]`).getAttribute('aria-current'), 'page');
        }
        await page.goBack();
        h.eq(await page.locator('.page.on').getAttribute('id'), 'p-customers');
        await page.reload();
        h.eq(await page.locator('.page.on').getAttribute('id'), 'p-customers');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
    'search connects a manifest shipment to its matching advice form': async h => {
      const instance = await h.openApp({ firstOpen: true });
      try {
        const { page } = instance;
        const shipment = await page.evaluate(() => {
          const row = SH.items.find(item => shDirection(item) === 'Export');
          return { awb: row.awb, wt: row.wt };
        });
        await page.locator('#ws-search-open').click();
        await page.locator('#ws-search-input').fill(shipment.awb);
        await page.locator('#ws-search-results [data-ws-awb]').first().click();
        h.contains(await page.locator('#ws-dialog').textContent(), 'The AWB trail');
        h.contains(await page.locator('#ws-dialog').textContent(), 'Synthetic manifest record');
        await page.locator('[data-ws-advice]').click();
        h.eq(await page.locator('.page.on').getAttribute('id'), 'p-export');
        h.eq(await page.locator('#a_mawb').inputValue(), shipment.awb);
        h.eqMoney(await page.locator('#a_wt').inputValue(), shipment.wt);
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
    'search is dismissible and mobile navigation remains usable without page overflow': async h => {
      const instance = await h.openApp();
      try {
        const { page } = instance;
        await page.keyboard.press('Control+k');
        h.assert(await page.locator('#ws-dialog').evaluate(node => node.open), 'search is open');
        await page.locator('#ws-search-input').fill('no-such-shipment-anywhere');
        h.contains(await page.locator('#ws-search-results').textContent(), 'No matching records');
        await page.keyboard.press('Escape');
        h.assert(!(await page.locator('#ws-dialog').evaluate(node => node.open)), 'Escape closes search');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#ws-menu').click();
        await page.locator('[data-ws-route="overview"]').click();
        const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, elements: [...document.querySelectorAll('body *')].filter(node => { const bounds = node.getBoundingClientRect(); return bounds.width && bounds.right > innerWidth + 1 && getComputedStyle(node).position !== 'fixed'; }).slice(0, 10).map(node => ({ tag: node.tagName, class: node.className, width: Math.round(node.getBoundingClientRect().width) })) }));
        h.assert(overflow.width <= overflow.viewport + 1, 'overview fits mobile viewport: ' + JSON.stringify(overflow));
        await page.locator('#ws-menu').click();
        await page.locator('[data-ws-route="register"]').click();
        h.eq(await page.locator('.page.on').getAttribute('id'), 'p-register');
        h.assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'ledger scroll is contained');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
  },
};
