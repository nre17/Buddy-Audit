#!/usr/bin/env node
/*
 * Test runner. Discovers tests/specs/*.spec.js, runs each exported case in a
 * fresh browser, prints a report, and exits non-zero on any failure.
 *
 * A spec module exports: { name: string, tests: { [caseName]: async (h) => void } }
 * where `h` is the harness module. Each case is responsible for opening and
 * closing its own app instance via h.openApp().
 */
const fs = require("fs");
const path = require("path");
const harness = require("./harness");

const SPEC_DIR = path.join(__dirname, "specs");
const only = process.argv[2]; // optional substring filter

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", YEL = "\x1b[33m", RST = "\x1b[0m";

(async () => {
  if (!fs.existsSync(path.join(__dirname, "..", "node_modules", "playwright"))) {
    console.error(RED + "playwright is not installed. Run: npm install" + RST);
    process.exit(1);
  }

  const files = fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith(".spec.js")).sort();
  let pass = 0, fail = 0;
  const failures = [];
  const started = Date.now();

  for (const file of files) {
    if (only && file.indexOf(only) < 0) continue;
    const spec = require(path.join(SPEC_DIR, file));
    console.log("\n" + spec.name + DIM + "  (" + file + ")" + RST);

    for (const caseName of Object.keys(spec.tests)) {
      const t0 = Date.now();
      try {
        await spec.tests[caseName](harness);
        pass++;
        console.log("  " + GREEN + "PASS" + RST + "  " + caseName + DIM + "  " + (Date.now() - t0) + "ms" + RST);
      } catch (err) {
        fail++;
        failures.push({ file, caseName, err });
        console.log("  " + RED + "FAIL" + RST + "  " + caseName);
        console.log("        " + String(err.message).split("\n").join("\n        "));
      }
    }
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log("\n" + "-".repeat(64));
  if (fail === 0) {
    console.log(GREEN + pass + " passed" + RST + DIM + "  in " + secs + "s" + RST);
  } else {
    console.log(RED + fail + " failed" + RST + ", " + pass + " passed" + DIM + "  in " + secs + "s" + RST);
    console.log("\n" + YEL + "Failed cases:" + RST);
    failures.forEach((f) => console.log("  " + f.file + " > " + f.caseName));
  }
  console.log("-".repeat(64));

  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(RED + "runner crashed:" + RST, e);
  process.exit(1);
});
