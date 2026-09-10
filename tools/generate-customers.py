#!/usr/bin/env python3
"""
Demo customer master generator.

Produces `fixtures/customers.demo.json` - 1,892 fictional trading companies,
used as the customer master in `app/solitair-invoicing.html`, listed on the
Customer Database tab, and the source of `h.SAMPLE_CUSTOMER` in the test harness.

Why generate rather than hand-write
-----------------------------------
The counter application is only meaningfully exercised against a customer list
of realistic size: an autocomplete searching a couple of thousand entries, with
contact details typed as inconsistently as real counter data is. Writing that by
hand is impractical; maintaining it by hand is worse.

Every customer has a fake tax registration number and a full address, so any
customer chosen as a billing party shows both on the advice. Contact details stay
patchy - some customers have no landline, mobile or email - so the application is
still exercised against missing values.

Everything here is invented. Company names are coined from syllable pools, so the
output is fiction by construction.

Safety properties, enforced by tools/pii-scan.js
------------------------------------------------
  * Email domains use the `.example` TLD, permanently reserved by RFC 2606 and
    IANA for documentation. It can never be delegated to a real mailbox.
  * Telephone numbers use the 555 fictional-number convention.
  * Tax registration numbers are random, unique digits in the UAE 15-digit format.
  * Addresses and cities come from the curated tables below.

Deterministic: seeded with SEED, so the dataset is reproducible by anyone and
diffs stay reviewable. CI regenerates it and fails if the committed file differs.

Usage:  python3 tools/generate-customers.py > fixtures/customers.demo.json
        (or: npm run customers)
"""

import json
import random
import re
import sys

SEED = 20260910
RECORDS = 1892

# ---------------------------------------------------------------- proportions
# How complete the contact details are. Counter data is patchy, so the demo set
# is too: half the customers have no landline, most have no separate mobile, and
# about two in five have no email. The TRN, address and city are always present.
P_PHONE = 0.50
P_MOBILE = 0.23
P_EMAIL = 0.61

# ---------------------------------------------------------------- word pools

ONSETS = [
    "Ar", "Bel", "Cor", "Dra", "El", "Fen", "Gal", "Hal", "Ir", "Jan",
    "Kel", "Lum", "Mar", "Nor", "Or", "Pel", "Qua", "Rav", "Sol", "Tor",
    "Ul", "Vel", "Wyn", "Xan", "Yar", "Zel", "Ash", "Bre", "Cly", "Dun",
    "Emb", "Fal", "Gri", "Hes", "Ith", "Jor", "Kry", "Lan", "Mer", "Nyx",
    "Ohm", "Pry", "Rho", "Ser", "Thal", "Umb", "Vor", "Wex", "Zir", "Cal",
]

CODAS = [
    "dor", "mar", "ven", "tis", "ora", "ix", "eth", "ara", "ion", "ux",
    "elle", "ost", "ynn", "aris", "emo", "ulan", "ada", "ero", "ithe", "onda",
]

SECTORS = [
    "Logistics", "Cargo", "Freight", "Shipping", "Air Services", "Forwarding",
    "Transport", "Supply Chain", "Aviation", "Express", "Cargo Handling",
    "Movers", "Couriers", "Consolidators", "Trading", "Global Logistics",
    "Air Cargo", "Sea & Air", "Distribution", "Clearance Services",
    "Freight Systems", "Logistics Group", "Cargo Services", "Airfreight",
    "International", "Worldwide Cargo", "Charter Services", "Handling Services",
]

# weighted so the mix of legal forms reads like a Gulf freight-forwarding book
SUFFIXES = (
    ["LLC"] * 22 + ["L.L.C"] * 10 + ["DWC-LLC"] * 8 + ["FZE"] * 8 +
    ["FZCO"] * 7 + ["DMCC"] * 5 + ["FZ-LLC"] * 4 + ["Ltd"] * 5 +
    ["Pvt Ltd"] * 3 + ["Co."] * 3 + [""] * 25
)

# a counter at DWC serves mostly UAE forwarders, with a long international tail
COUNTRIES = (
    ["United Arab Emirates"] * 1657 + ["India"] * 32 + ["China"] * 25 +
    ["Saudi Arabia"] * 19 + ["United States of America"] * 18 +
    ["United Kingdom"] * 14 + ["Pakistan"] * 12 + ["Bangladesh"] * 9 +
    ["Turkey"] * 9 + ["Hong Kong"] * 8 + ["Kenya"] * 7 + ["Egypt"] * 6 +
    ["Oman"] * 6 + ["Qatar"] * 5 + ["Kuwait"] * 5 + ["Singapore"] * 5 +
    ["Netherlands"] * 5
)

PAY_MODES = (
    ["Cash/Card/CASS"] * 1722 + ["Cash"] * 90 + ["Card"] * 46 +
    ["Credit"] * 18 + ["CASS"] * 10 + ["Bank transfer"] * 6
)

MAILBOXES = [
    "info", "sales", "ops", "operations", "accounts", "cargo", "admin",
    "exports", "imports", "booking", "docs", "finance", "reservations",
    "customerservice", "airfreight", "contact", "dubai", "enquiry",
]

# ---------------------------------------------------------------- addresses
# UAE customers sit in the free zones and industrial areas, each address paired
# with the city (and emirate, where it differs) it is actually in.
UAE_ADDRESSES = [
    ("Warehouse {n}, Jebel Ali Free Zone South", "Jebel Ali", "Dubai"),
    ("Unit {n}, JAFZA North, PO Box {p}", "Jebel Ali", "Dubai"),
    ("Office {n}, Dubai Airport Free Zone, Block {b}", "Dubai", ""),
    ("Office {n}, DAFZA West Wing, PO Box {p}", "Dubai", ""),
    ("Building {b}{n}, Dubai South Logistics District", "Dubai South", "Dubai"),
    ("Plot {n}, DWC Cargo Village", "Dubai South", "Dubai"),
    ("Unit {n}, Al Quoz Industrial Area {d}", "Dubai", ""),
    ("Warehouse {n}, Ras Al Khor Industrial Area {d}", "Dubai", ""),
    ("Office {n}, {b} Business Tower, Business Bay", "Dubai", ""),
    ("{b} Tower, Floor {d}, Sheikh Zayed Road", "Dubai", ""),
    ("Shop {n}, Al Fahidi Street, Bur Dubai", "Dubai", ""),
    ("PO Box {p}, Deira", "Dubai", ""),
    ("Warehouse {n}, Sharjah Airport International Free Zone", "Sharjah", ""),
    ("Office {n}, Al Majaz {d}", "Sharjah", ""),
    ("Unit {n}, Khalifa Industrial Zone", "Abu Dhabi", ""),
    ("Office {n}, Al Maryah Island", "Abu Dhabi", ""),
    ("Warehouse {n}, Ajman Free Zone", "Ajman", ""),
    ("Unit {n}, RAK Economic Zone", "Ras Al Khaimah", ""),
    ("Warehouse {n}, Fujairah Free Zone", "Fujairah", ""),
]

# everyone else gets a business-district address in a city of their own country
INTL_ADDRESS_FORMS = [
    "{n} {road}",
    "{n} {road}, {district}",
    "Unit {n}, {district} Business Park",
    "Office {n}, Floor {d}, {b} Tower",
    "Warehouse {n}, {district} Industrial Area",
    "Plot {n}, {district} Logistics Park",
]
ROADS = ["Harbour Road", "Station Road", "Airport Road", "Market Street",
         "Park Avenue", "Canal Street", "Cargo Way", "Trade Centre Road"]
DISTRICTS = ["Central", "North", "South", "East", "West", "Port", "Airport", "Old Town"]
BLOCKS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "M", "N"]

CITIES = {
    "India": [("Mumbai", "Maharashtra"), ("Delhi", ""), ("Chennai", "Tamil Nadu"), ("Kochi", "Kerala")],
    "China": [("Shanghai", ""), ("Guangzhou", "Guangdong"), ("Shenzhen", "Guangdong"), ("Beijing", "")],
    "Saudi Arabia": [("Riyadh", ""), ("Jeddah", ""), ("Dammam", "")],
    "United States of America": [("New York", "New York"), ("Chicago", "Illinois"), ("Houston", "Texas")],
    "United Kingdom": [("London", ""), ("Manchester", "")],
    "Pakistan": [("Karachi", "Sindh"), ("Lahore", "Punjab")],
    "Bangladesh": [("Dhaka", ""), ("Chattogram", "")],
    "Turkey": [("Istanbul", ""), ("Izmir", "")],
    "Hong Kong": [("Hong Kong", "")],
    "Kenya": [("Nairobi", ""), ("Mombasa", "")],
    "Egypt": [("Cairo", ""), ("Alexandria", "")],
    "Oman": [("Muscat", ""), ("Sohar", "")],
    "Qatar": [("Doha", "")],
    "Kuwait": [("Kuwait City", "")],
    "Singapore": [("Singapore", "")],
    "Netherlands": [("Rotterdam", "South Holland"), ("Amsterdam", "North Holland")],
}
CITIES_FALLBACK = [("Singapore", ""), ("Rotterdam", "South Holland")]


def coined_stems(rng, count):
    """Build `count` unique coined brand stems from the syllable pools."""
    seen, out = set(), []
    while len(out) < count:
        stem = rng.choice(ONSETS) + rng.choice(CODAS)
        if stem not in seen:
            seen.add(stem)
            out.append(stem)
    return out


def make_names(rng, count):
    """Build `count` unique fictional company names."""
    stems = coined_stems(rng, len(ONSETS) * len(CODAS))
    seen, out = set(), []
    while len(out) < count:
        parts = [rng.choice(stems), rng.choice(SECTORS)]
        suffix = rng.choice(SUFFIXES)
        if suffix:
            parts.append(suffix)
        name = " ".join(parts)
        # compare on letters and digits only, so "Sea & Air" and "Sea Air"
        # cannot both be issued
        key = re.sub(r"[^A-Z0-9]", "", name.upper())
        if key not in seen:
            seen.add(key)
            out.append(name)
    return out


def phone(rng, mobile):
    """A fictional UAE number. Formatting is deliberately inconsistent, because
    counter data is typed by hand and the application has to tolerate it."""
    if mobile:
        raw = "97155500" + "".join(rng.choice("0123456789") for _ in range(4))
        style = rng.randrange(4)
        if style == 0:
            return "+" + raw
        if style == 1:
            return raw
        if style == 2:
            return "0" + raw[3:]
        return "+" + raw[:3] + " " + raw[3:5] + " " + raw[5:8] + " " + raw[8:]
    raw = "97145550" + "".join(rng.choice("0123456789") for _ in range(3))
    return ("+" + raw) if rng.randrange(2) else raw


def spread(rng, pool):
    """A shuffled copy of `pool`, sized to RECORDS."""
    out = list(pool)
    while len(out) < RECORDS:
        out.append(rng.choice(pool))
    out = out[:RECORDS]
    rng.shuffle(out)
    return out


def main():
    rng = random.Random(SEED)

    names = sorted(make_names(rng, RECORDS), key=lambda s: s.upper())
    countries = spread(rng, COUNTRIES)
    pay_modes = spread(rng, PAY_MODES)

    used_trns = set()
    out = []

    for i, name in enumerate(names):
        country = countries[i]
        stem = name.split()[0].lower()
        domain = stem + "-" + rng.choice(
            ["cargo", "logistics", "freight", "shipping", "air"]
        ) + ".example"

        if country == "United Arab Emirates":
            form, city, state = rng.choice(UAE_ADDRESSES)
        else:
            form = rng.choice(INTL_ADDRESS_FORMS)
            city, state = rng.choice(CITIES.get(country, CITIES_FALLBACK))
        addr = form.format(
            n=rng.randrange(1, 400), b=rng.choice(BLOCKS), d=rng.randrange(1, 5),
            p=rng.randrange(10000, 99999), road=rng.choice(ROADS),
            district=rng.choice(DISTRICTS),
        )

        while True:
            trn = "100" + "".join(rng.choice("0123456789") for _ in range(12))
            if trn not in used_trns:
                used_trns.add(trn)
                break

        out.append({
            "no": i + 1,
            "name": name,
            "trn": trn,
            "addr": addr,
            "pay": pay_modes[i],
            "country": country,
            "phone": phone(rng, mobile=False) if rng.random() < P_PHONE else "",
            "mobile": phone(rng, mobile=True) if rng.random() < P_MOBILE else "",
            "email": (rng.choice(MAILBOXES) + "@" + domain) if rng.random() < P_EMAIL else "",
            "city": city,
            "state": state if state and state != city else "",
        })

    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
