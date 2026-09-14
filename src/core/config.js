import { app } from './runtime.js';
import packageInfo from '../../package.json';

app.APP_VERSION = packageInfo.version;

app.CFG = {
  company: {
    name: "SolitAir Cargo Express Services DWC-LLC",
    addr: "Plot: CT-05, DWC, Dubai South",
    contact: "Not configured",
    trn: "Not configured"
  },
  /* Fictional bank details, invented for the prototype: no such bank or accounts.
     Never put real ones in this file. The printed advice does not say they are
     invented, so a counter machine must enter its own before real use. */
  bank: {
    name: "SolitAir Cargo Express Services DWC-LLC",
    aed: { acc: "1234 5678 9001", iban: "AE12 0345 0000 1234 5678 901", bic: "DCRBXAEDXXX",
           bank: "Desert Crest Bank", branch: "101 / Business Bay" },
    usd: { acc: "1234 5678 9002", iban: "AE12 0345 0000 1234 5678 902", bic: "DCRBXAEDXXX",
           bank: "Desert Crest Bank", branch: "101 / Business Bay" }
  },
  staff: ["Counter 1", "Counter 2", "Counter 3", "Counter 4", "Counter 5", "Counter 6"],
  payModes: ["Cash", "Card", "Cash + Card", "CASS", "Credit", "Bank Transfer"],
  /* SHC drives the rate and the free storage time.
     GEN and ELI bill at the general rate. PER is perishable, 8 hrs free.
     Every other code bills as special cargo at the special rate, 48 hrs free. */
  shcCodes: [
    {c:"GEN", d:"General Cargo",                          k:"general"},
    {c:"ELI", d:"Lithium Ion Batteries (Section II)",     k:"general"},
    {c:"PER", d:"Perishable Cargo (general)",             k:"perishable"},
    {c:"PEP", d:"Perishables - Fruit & Vegetables",       k:"perishable"},
    {c:"PEF", d:"Perishables - Flowers",                  k:"perishable"},
    {c:"PEM", d:"Perishables - Meat",                     k:"perishable"},
    {c:"PES", d:"Perishables - Fish & Seafood",           k:"perishable"},
    {c:"AVI", d:"Live Animals",                           k:"special"},
    {c:"PIL", d:"Pharmaceuticals (temp. controlled)",     k:"special"},
    {c:"COL", d:"Cool Goods (+2C to +8C)",                k:"special"},
    {c:"VAL", d:"Valuable Cargo",                         k:"special"},
    {c:"HUM", d:"Human Remains in Coffin",                k:"special"},
    {c:"DGR", d:"Dangerous Goods",                        k:"special"},
    {c:"COU", d:"Courier Material / Diplomatic Mail",     k:"special"},
    {c:"MUW", d:"Munitions of War",                       k:"special"},
    {c:"SWP", d:"Sporting Weapons",                       k:"special"},
    {c:"VUN", d:"Vulnerable Cargo",                       k:"special"}
  ],
  /* free storage window in HOURS, by cargo class */
  freeHours: { general: 48, special: 48, perishable: 8 },
  vatRate: 0.05
};

app.CFG_SHIPPED = JSON.parse(JSON.stringify(app.CFG));
