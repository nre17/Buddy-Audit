import { app } from '../core/runtime.js';

app.EXPORT_LINES = [
  {g:"A. Acceptance & Handling (auto-applied)"},
  {id:"ex_accept", d:"Cargo Acceptance Handling (per AWB) - the AWB fee", rate:50, min:50, kind:"each", vat:0, unit:"per AWB", role:"awb"},
  {id:"ex_hawb", d:"House Airwaybill (HAWB) Data Entry Fee", rate:50, min:0, kind:"each", vat:0, unit:"per HAWB", role:"hawb"},
  {id:"ex_handling_gen", d:"General Cargo Handling (per kg)", rate:0.15, min:34, kind:"kg", vat:0, role:"handling", cls:"general"},
  {id:"ex_handling_spc", d:"Special Cargo Handling (per kg)", rate:0.22, min:55, kind:"kg", vat:0, role:"handling", cls:"special"},
  {id:"ex_handling_per", d:"Perishable Cargo Handling (per kg)", rate:0.24, min:55, kind:"kg", vat:0, role:"handling", cls:"perishable"},

  {g:"B. Storage (auto-applied, per kg/day beyond the free period)"},
  {id:"ex_stor_gen", d:"General Cargo Storage (per kg/day)", rate:0.15, min:34, kind:"storage", vat:0, cls:"general"},
  {id:"ex_stor_spc", d:"Special Cargo Storage (per kg/day)", rate:0.20, min:44, kind:"storage", vat:0, cls:"special"},
  {id:"ex_stor_per", d:"Perishable Cargo Storage (per kg/day)", rate:0.29, min:60, kind:"storage", vat:0, cls:"perishable"},

  {g:"C. Conditional Charges (auto-applied when the condition is met)"},
  {id:"ex_dgr", d:"Dangerous Goods Inspection (auto when SHC = DGR)", rate:350, min:350, kind:"each", vat:0, role:"dgcond"},
  {id:"ex_lateaccept", d:"Late Acceptance of Cargo (auto when accepted within 5 hrs of departure)", rate:0.53, min:68, kind:"kg", vat:5, role:"lateaccept"},

  {g:"D. Non-Weight Items"},
  {id:"ex_days_free", d:"Free Storage Period (included)", rate:0, min:0, kind:"days"},
  {id:"ex_misc_note", d:"Manual / misc. charges (entered at save)", rate:0, min:0, kind:"misc"}
];

app.EXPORT_OPTIONAL = [
  {id:"ex_opt_barcode", d:"Barcode Labels / Sortation", rate:0.25, min:30, kind:"kg", vat:0},
  {id:"ex_opt_dgr_reject", d:"Dangerous Goods Rejection Fee", rate:350, min:350, kind:"each", vat:5},
  {id:"ex_opt_skid", d:"Skid Dismantling", rate:197, min:197, kind:"each", vat:5},
  {id:"ex_opt_cancel_pre", d:"AWB Cancellation / Rebooking / Return (Pre-Build-Up)", rate:225, min:225, kind:"each", vat:5},
  {id:"ex_opt_cancel_post", d:"AWB Cancellation / Rebooking / Return (Post-Build-Up, AED 450 base + per kg)", rate:0.15, min:450, kind:"kg", vat:5},
  {id:"ex_opt_amend", d:"AWB Amendment Fee (After Handover)", rate:172, min:172, kind:"each", vat:0},
  {id:"ex_opt_aviation", d:"Live Animals (AVI) Handling", rate:258, min:258, kind:"each", vat:0},
  {id:"ex_opt_cartage", d:"Cargo Cartage - Inbound to Warehouse", rate:30, min:30, kind:"each", vat:0},
  {id:"ex_opt_brokering", d:"Cargo Brokering / Agency Fee", rate:100, min:100, kind:"each", vat:0},
  {id:"ex_opt_doc", d:"Air Waybill & Documentation (Additional)", rate:25, min:25, kind:"each", vat:0},
  {id:"ex_opt_xray", d:"X-ray / Security Screening", rate:0.15, min:36, kind:"kg", vat:5}
];

app.IMPORT_LINES = [
  {g:"A. Handling (auto-applied)"},
  {id:"im_doc", d:"Delivery Order (per AWB) - the DO fee", rate:50, min:50, kind:"each", vat:0, unit:"per AWB", role:"awb"},
  {id:"im_hawb", d:"House Airwaybill (HAWB) Data Entry Fee", rate:50, min:0, kind:"each", vat:0, unit:"per HAWB", role:"hawb"},
  {id:"im_handling_gen", d:"General Cargo Handling (per kg)", rate:0.15, min:34, kind:"kg", vat:0, role:"handling", cls:"general"},
  {id:"im_handling_spc", d:"Special Cargo Handling (per kg)", rate:0.22, min:55, kind:"kg", vat:0, role:"handling", cls:"special"},
  {id:"im_handling_per", d:"Perishable Cargo Handling (per kg)", rate:0.24, min:60, kind:"kg", vat:0, role:"handling", cls:"perishable"},

  {g:"B. Storage (auto-applied, per kg/day beyond the free period)"},
  {id:"im_stor_gen", d:"General Cargo Storage (per kg/day)", rate:0.15, min:34, kind:"storage", vat:0, cls:"general"},
  {id:"im_stor_spc", d:"Special Cargo Storage (per kg/day)", rate:0.20, min:44, kind:"storage", vat:0, cls:"special"},
  {id:"im_stor_per", d:"Perishable Cargo Storage (per kg/day)", rate:0.29, min:60, kind:"storage", vat:0, cls:"perishable"},

  {g:"C. Conditional Charges (auto-applied when the condition is met)"},
  {id:"im_dgr", d:"Dangerous Goods Inspection (auto when SHC = DGR)", rate:350, min:350, kind:"each", vat:0, role:"dgcond"},

  {g:"D. Non-Weight Items"},
  {id:"im_storage_override", d:"Storage - Manual Override (per day)", rate:0, min:0, kind:"days"},
  {id:"im_days_free", d:"Free Storage Period (included)", rate:0, min:0, kind:"days"},
  {id:"im_misc_note", d:"Manual / misc. charges (entered at save)", rate:0, min:0, kind:"misc"}
];

app.IMPORT_OPTIONAL = [
  {id:"im_opt_consol", d:"Consolidation Breakdown", rate:50, min:50, kind:"each", vat:0},
  {id:"im_opt_dgr_reject", d:"Dangerous Goods Rejection Fee", rate:350, min:350, kind:"each", vat:5},
  {id:"im_opt_cancel_do", d:"Cancellation of Delivery Order", rate:126, min:126, kind:"each", vat:5},
  {id:"im_opt_amend", d:"AWB Amendment Fee", rate:172, min:172, kind:"each", vat:0},
  {id:"im_opt_skid_req", d:"Request for Wooden Skid on Delivery", rate:50, min:50, kind:"each", vat:5},
  {id:"im_opt_photocopy", d:"Photocopy Charges", rate:5, min:5, kind:"each", vat:5},
  {id:"im_opt_restrap", d:"Restraining / Restrapping / Resealing", rate:35, min:35, kind:"each", vat:0},
  {id:"im_opt_labour", d:"Additional Labour", rate:70, min:70, kind:"each", vat:5},
  {id:"im_opt_forklift", d:"Additional Forklift Use", rate:200, min:200, kind:"each", vat:5},
  {id:"im_opt_cca_amend", d:"AWB / CCA Amendment / AWB Reprint", rate:100, min:100, kind:"each", vat:0},
  {id:"im_opt_reweigh", d:"Reweighing", rate:0.15, min:170, kind:"kg", vat:5},
  {id:"im_opt_photo", d:"Photo Graph Charges", rate:54, min:54, kind:"each", vat:5},
  {id:"im_opt_xray", d:"X-ray Screening", rate:0.15, min:36, kind:"kg", vat:5},
  {id:"im_opt_liv", d:"LIV Handling", rate:0.28, min:300, kind:"kg", vat:0},
  {id:"im_opt_avi", d:"AVI Handling", rate:258, min:258, kind:"each", vat:0},
  {id:"im_opt_auto", d:"Automobile Handling", rate:400, min:400, kind:"each", vat:0},
  {id:"im_opt_dismantle", d:"Dismantling Skids after Acceptance on Airside", rate:197, min:197, kind:"each", vat:5},
  {id:"im_opt_rcv", d:"Cargo Receiving at Facility", rate:45, min:45, kind:"each", vat:0},
  {id:"im_opt_customs", d:"Customs Clearance Brokerage", rate:150, min:150, kind:"each", vat:0},
  {id:"im_opt_delivery_cartage", d:"Delivery / Cartage to Consignee", rate:0.25, min:50, kind:"kg", vat:0},
  {id:"im_opt_sorting", d:"Sortation & Labelling / Barcode Labels", rate:0.25, min:30, kind:"kg", vat:0}
];
