import { app } from './runtime.js';

app.DB = {
  openingBalance: 0, openingNote: "", openingDate: "",
  entries: [], seq: { export: 0, import: 0 },
  customers: [], staff: "Counter 1", rates: {}, logo: null,
  staffList: ["Counter 1", "Counter 2", "Counter 3", "Counter 4", "Counter 5", "Counter 6"],
  freeHours: { general: 48, special: 48, perishable: 8 },
  /* site details, entered under Rates & Data - never held in the source */
  company: null, bank: null,
  sec: []
};
