/* Storage failure and untrusted-input boundaries for reception, print and exports. */
module.exports = {
  name: 'Security and export boundaries',
  tests: {
    'reception status and bulk scanning require the same AWB direction': async h => {
      const instance = await h.openApp();
      try {
        await h.fillAdvice(instance.page, 'export', { cust: h.SAMPLE_CUSTOMER.name, mawb: '780-30908001', wt: 100, pcs: 1 });
        await h.saveAdvice(instance.page, 'export');
        await h.tab(instance.page, 'Facility Security');
        await instance.page.selectOption('#sec_dir', 'Import');
        await instance.page.fill('#sec_awb', '78030908001');
        await instance.page.click('#sec_add');
        h.contains(await instance.page.$eval('#sec_tbl tbody', el => el.textContent), 'NOT INVOICED');
        await instance.page.click('#sec_scan');
        h.contains(await instance.page.$eval('#sec_alerts', el => el.textContent), 'Missing invoice: 1');
        const lookup = await instance.page.evaluate(() => ({
          exportFound: !!findInvoiceByAWB('78030908001', 'Export'),
          importFound: !!findInvoiceByAWB('780-30908001', 'Import'),
          legacyFound: !!findInvoiceByAWB('78030908001'),
        }));
        h.assert(lookup.exportFound && lookup.legacyFound && !lookup.importFound);
        await instance.page.fill('#sec_confirm_awb', '780-30908001');
        await instance.page.selectOption('#sec_confirm_dir', 'Import');
        await instance.page.click('#sec_confirm_search');
        h.contains(await instance.page.$eval('#sec_confirm', el => el.textContent), 'No import invoice');
        await instance.page.selectOption('#sec_confirm_dir', 'Export');
        await instance.page.click('#sec_confirm_search');
        h.contains(await instance.page.$eval('#sec_confirm', el => el.textContent), 'invoiced.');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },

    'a newer invoice of the other direction does not hide the matching invoice': async h => {
      const instance = await h.openApp();
      try {
        const result = await instance.page.evaluate(() => {
          DB.entries = [
            { id: 'EX_1', type: 'invoice', mawb: '780-30908002', mode: 'Export', ts: '2026-09-14T08:00:00.000Z', ref: 'EXPORT-REF' },
            { id: 'IM_1', type: 'invoice', mawb: '78030908002', mode: 'Import', ts: '2026-09-14T09:00:00.000Z', ref: 'IMPORT-REF' },
          ];
          return { exp: findInvoiceByAWB('78030908002', 'Export').ref, imp: findInvoiceByAWB('780-30908002', 'Import').ref };
        });
        h.eq(result.exp, 'EXPORT-REF'); h.eq(result.imp, 'IMPORT-REF');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },

    'acknowledgement clears only checked visible reception records': async h => {
      const instance = await h.openApp();
      try {
        await h.tab(instance.page, 'Facility Security');
        await instance.page.evaluate(() => {
          secAdd('780-30908003', 'Export', '');
          secAdd('780-30908004', 'Export', '');
          secAdd('780-30908005', 'Import', '');
        });
        await instance.page.click('#sec_ack');
        h.eq(await instance.page.evaluate(() => DB.sec.filter(row => row.ack).length), 0, 'no selection clears nothing');
        await instance.page.selectOption('#sec_dirfilter', 'Export');
        await instance.page.locator('#sec_tbl tbody input[data-sec-select]').first().check();
        const selected = await instance.page.$eval('#sec_tbl tbody input:checked', input => input.dataset.secSelect);
        await instance.page.click('#sec_ack');
        const cleared = await instance.page.evaluate(() => DB.sec.filter(row => row.ack).map(row => row.id));
        h.eq(cleared.length, 1); h.eq(cleared[0], selected);
        await instance.page.check('#sec_selectall');
        await instance.page.click('#sec_ack');
        h.eq(await instance.page.evaluate(() => DB.sec.filter(row => !row.ack && row.dir === 'Import').length), 1, 'hidden import remains active');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },

    'failed reception saves preserve single and block input with no partial batch': async h => {
      const instance = await h.openApp();
      try {
        await h.tab(instance.page, 'Facility Security');
        await instance.page.evaluate(() => { save = () => false; });
        await instance.page.fill('#sec_awb', '780-30908006');
        await instance.page.click('#sec_add');
        h.eq(await instance.page.inputValue('#sec_awb'), '780-30908006');
        h.eq(await instance.page.evaluate(() => DB.sec.length), 0);
        const block = '780-30908007\n780-30908008';
        await instance.page.fill('#sec_block', block);
        await instance.page.click('#sec_blockadd');
        h.eq(await instance.page.inputValue('#sec_block'), block);
        h.eq(await instance.page.evaluate(() => DB.sec.length), 0, 'the whole batch rolls back');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },

    'failed delete and acknowledgement preserve records and the open dialog': async h => {
      const instance = await h.openApp();
      try {
        await h.tab(instance.page, 'Facility Security');
        await instance.page.evaluate(() => { secAdd('780-30908009', 'Export', ''); save = () => false; });
        await instance.page.check('#sec_tbl [data-sec-select]');
        await instance.page.click('#sec_ack');
        h.eq(await instance.page.evaluate(() => DB.sec[0].ack), false);
        await instance.page.click('#sec_tbl button.secrm');
        await h.modalClick(instance.page, 'Delete');
        h.eq(await instance.page.evaluate(() => DB.sec.length), 1);
        h.assert(await instance.page.$eval('#modal', el => getComputedStyle(el).display !== 'none'), 'failed delete keeps its dialog open');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },

    'security restore validates records and rolls back a failed save': async h => {
      const instance = await h.openApp();
      try {
        await h.tab(instance.page, 'Facility Security');
        await instance.page.evaluate(() => secAdd('780-30908010', 'Export', ''));
        const originalId = await instance.page.evaluate(() => DB.sec[0].id);
        const upload = async rows => {
          const chooser = instance.page.waitForEvent('filechooser');
          await instance.page.click('#sec_restorebtn');
          await (await chooser).setFiles({ name: 'synthetic-reception.backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)) });
        };
        const valid = { id: 'RESTORE_DEMO', awb: '780-30908011', dir: 'Import', by: '', ts: '2026-09-14T08:00:00.000Z', ack: false };
        await upload([{ ...valid, dir: 'Outbound' }]);
        await instance.page.waitForFunction(() => document.getElementById('toast').textContent.includes('invalid'));
        h.eq(await instance.page.evaluate(() => DB.sec[0].id), originalId);
        const invalids = await instance.page.evaluate(row => {
          return [
            [{ ...row, id: '' }], [{ ...row, awb: '123' }], [{ ...row, ack: 'false' }],
            [{ ...row, ts: 'bad-date' }], [row, { ...row }],
          ].every(rows => { try { validateSecurityList(rows); return false; } catch { return true; } });
        }, valid);
        h.assert(invalids, 'record fields and duplicate identities are checked');
        await instance.page.evaluate(() => { save = () => { window.__securitySaveAttempted = true; return false; }; });
        await upload([valid]);
        await instance.page.waitForFunction(() => window.__securitySaveAttempted);
        h.eq(await instance.page.evaluate(() => DB.sec[0].id), originalId);
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },

    'restored invoice references, logo attributes and legacy day quantities stay inert': async h => {
      const instance = await h.openApp();
      try {
        await h.tab(instance.page, 'Facility Security');
        const result = await instance.page.evaluate(() => {
          const payload = '<img src="data:,bad" onerror="window.__unsafeSecurity=true">';
          const invoice = { id: 'PRINT_DEMO', type: 'invoice', mode: 'Export', mawb: '780-30908012', ref: payload,
            ts: '2026-09-14T08:00:00.000Z', cust: '', billTo: '', billTrn: '', billAddr: '',
            payMode: 'Cash', pay: { cash: 0, card: 0 }, total: 0, items: [{ d: 'Days', kind: 'days', qty: payload }] };
          DB.entries = [invoice];
          DB.sec = [{ id: 'SEC_PRINT_DEMO', awb: invoice.mawb, dir: 'Export', by: '', ts: invoice.ts, ack: false }];
          DB.logo = 'x" onerror="window.__unsafeSecurity=true';
          renderSecurity();
          const node = document.createElement('div');
          node.innerHTML = docCopy(invoice, 'Test copy');
          document.body.appendChild(node);
          return {
            marker: window.__unsafeSecurity === true,
            handlers: document.querySelectorAll('[onerror]').length,
            securityImages: document.querySelectorAll('#sec_tbl img').length,
            logo: node.querySelector('.logo img').getAttribute('src'),
            expected: LOGO_PRINT,
            literalRef: document.getElementById('sec_tbl').textContent.includes(payload),
          };
        });
        h.eq(result.handlers, 0); h.eq(result.securityImages, 0); h.eq(result.marker, false);
        h.eq(result.logo, result.expected); h.assert(result.literalRef);
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },

    'CSV exports neutralize formula text while preserving numeric amounts and quoted fields': async h => {
      const instance = await h.openApp();
      try {
        const output = await instance.page.evaluate(() => {
          const priorRows = regRows, priorDownload = dl;
          let text;
          try {
            regRows = () => [['=1+1', ' +2+2', '-formula', '@lookup', '\tvalue', -5, 12.5, '780-30908013', 'comma,quote"', 'line\rbreak']];
            dl = value => { text = value; };
            exportCsv([]);
          } finally { regRows = priorRows; dl = priorDownload; }
          return text;
        });
        h.contains(output, "'=1+1"); h.contains(output, "' +2+2"); h.contains(output, "'-formula");
        h.contains(output, "'@lookup"); h.contains(output, "'\tvalue");
        h.contains(output, ',-5,12.5,780-30908013,');
        h.contains(output, '"comma,quote"""'); h.contains(output, '"line\rbreak"');
        instance.assertNoErrors();
      } finally { await instance.close(); }
    },
  },
};
