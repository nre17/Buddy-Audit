# Appointment planning: dnata reference and prototype boundary

**Checked:** 14 September 2026. This note records public research and the internal rules in [bookings.mjs](../../src/domain/bookings.mjs). It is not a dnata tariff, an integration agreement or confirmation of an external booking. No Calogi account, appointment or customer record was accessed.

## What the primary sources establish

dnata's **30 November 2020** ADM announcement describes delivery/pickup appointments using shipment, flight and vehicle information. It links visibility of demand to resource planning and includes coordination of Customs inspections. This supports the general design pattern of appointment-led cargo handling. It is a historical announcement, not a specification of today's terminal rules or commercial terms. [dnata ADM announcement](https://www.dnata.com/media-centre/dnata-rolls-out-just-in-time-freight-handling-platform-in-dubai/)

The current cargo page directs registered users to Calogi for delivery/collection slots and relevant charges. It separately lists acceptance and collection documents, with additional requirements depending on cargo type. Its public description does not establish a universal lateness or no-show fee for this prototype. [dnata Cargo](https://www.dnata.com/en/our-services/cargo/)

Calogi's FAQ says appointment booking carries no additional fee, mentions no-show charges without an amount or implementation date, and requires separate appointments for additional truck trips. Its terminal-entry window is 15 minutes before/after slot start, not a billing rule. The FAQ contains 2019 material and DXB-only wording. A separate 2019 announcement names DXB and DWC for import appointments. Current site-specific terms remain unverified. [Calogi FAQ](https://calogi.gss.emirates.com/support/faqs/), [historical ADM Import launch](https://calogi.gss.emirates.com/transformation/adm-import/)

The FAQ was accessible through indexed primary-source text; direct retrieval was unreliable. Different scopes and publication dates do not establish today's tariff.

## Internal prototype contract

The planner adopts the appointment/workload pattern and defines its own explicit local behavior. Its reference implementation currently has:

| Area | Internal behavior | External boundary |
| --- | --- | --- |
| Booking | Export/import AWB, customer, route, pieces, weight, cargo/SHC and a start/end slot; civil times mean Asia/Dubai | An internal confirmed booking does not reserve a dnata terminal slot |
| Flight and vehicle context | Optional flight number/departure, vehicle type/registration and dock | These fields do not validate aircraft acceptance deadlines, vehicle registration or live dock availability |
| Resources | Staff demand and concurrent-booking projections; configurable capacity warnings | Warnings are planning information, not a terminal capacity guarantee or staff roster |
| Coordination | Customs, police and other coordination requirements, owner and recorded arrangements | Recorded arrangements are staff assertions, not authority-system approvals; police coordination is an internal requirement, not a claim taken from the ADM announcement |
| Arrival | Staff records actual arrival; lateness is measured against the slot end | This is the prototype's chosen service window, not an imported terminal-entry rule |
| No-show | Explicit terminal state, allowed only after slot end, with an operator and required reason | The clock alone does not declare a no-show, and this action creates no fee |
| Charges | Disabled by default; an enabled policy can produce a fixed AED late-charge proposal after the configured grace | A proposal is not an invoice, collected payment, dnata charge or automatic financial posting |
| History | Bookings capture their policy; changes and terminal actions preserve attributed history | Local actor attribution is not proof of authenticated identity or commercial authorization |

Flight, vehicle and dock remain optional so the prototype can support early planning before those details are known. Where they are required for a real terminal process, that requirement must become an explicit validated rule backed by the applicable procedure. Do not imply complete gate or dock control from these fields alone.

## Keep four different rules separate

| Concept | Meaning in this prototype |
| --- | --- |
| Appointment lateness | Actual arrival after the booked service window ends; whole elapsed minutes are used |
| Terminal access window | When a vehicle may enter a particular terminal; no access-window enforcement is implemented |
| No-show | Staff records that a confirmed appointment was not attended, after its slot ends; distinct from a late arrival |
| Flight acceptance cutoff | A deadline relative to an actual flight operation and its cargo-handling requirements; no cutoff rule is established by this booking reference |

The existing advice engine's late-acceptance calculation is a separate commercial rule. Do not reuse its trigger or tariff for appointment lateness. Likewise, a configured appointment grace period does not change flight acceptance eligibility.

The late-charge function uses the policy captured for that booking. It computes elapsed minutes after slot end, subtracts the configured grace, and proposes one fixed amount only when the remaining duration is positive and the policy is enabled. It does not multiply the amount by minutes. Without an arrival there is no arrival assessment; no-show and cancelled bookings receive none. A waiver requires a recorded reason. These are internal implementation choices, not facts inferred from dnata's website.

## Before adopting external rules

Obtain the current airport/terminal scope, service type, effective date and authoritative schedule or contractual terms. Clarify the precise event clock: slot start, slot end, gate arrival, dock arrival, acceptance completion or flight departure. Confirm fee amount, currency, tax treatment, grace/rounding, exemptions, no-show definition, cancellations, multiple trips, partial collections and who can approve or waive a charge.

Keep operational status and financial liability separate until those terms are approved. A future integration would also need an authorized API or agreed exchange, external booking identifiers, acknowledgement/error handling and reconciliation of changes. Public access to explanatory pages does not establish that such access or an API is available.

The present reference intentionally supplies no dnata fee amount or current DWC charging policy. It provides a source-backed operating pattern and a clear boundary around the prototype's configurable proposals.
