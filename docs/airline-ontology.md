# Airline ontology and regulatory references

The airline pack is a U.S. Part 121-oriented shared ontology for governed decision support. It models operational and regulatory evidence; it does not encode a static legal conclusion, grant operational control, sign an airworthiness release, or reproduce security-sensitive procedures.

## Shared ontology

Eight repository-owned source schemas under `schemas/airline/` contribute 181 mapped fields with 100% field coverage:

- dispatch release;
- crew duty record;
- aircraft maintenance log;
- airworthiness release;
- safety event report;
- tarmac delay report;
- passenger refund case; and
- dangerous-goods declaration.

The generator consolidates them into 15 entity types and 19 relationships:

- organizations and network: Air Carrier, Aircraft, Airport, Flight;
- operational control and people: Dispatch Release, Crew Member, Crew Duty Record;
- airworthiness and safety: Maintenance Record, Airworthiness Release, Safety Event;
- passenger service: Passenger Journey, Consumer Remedy, Tarmac Delay Event;
- cargo and governance: Dangerous Goods Shipment, Regulatory Requirement.

`Regulatory Requirement` is versioned evidence, not an assertion that a rule applies. Applicability, effective dates, operations specifications, exemptions, carrier manuals, and the facts of a specific operation remain inputs to a governed decision.

## Seeded reference contracts

The registry seeds three published reference contracts into `workspace-airline`:

1. **Part 121 Dispatch Release Assurance** assembles flight, aircraft, airport, weather, fuel, dispatch-release, and crew-duty evidence. It always requires certificated human authority.
2. **Aircraft Return-to-Service Assurance** reviews maintenance, inspection, discrepancy, signer, service-difficulty, and airworthiness-release evidence. It cannot sign or independently determine airworthiness.
3. **Passenger Disruption & Refund Assurance** tracks tarmac-delay clocks and care evidence and assesses privacy-minimized refund cases. It intentionally excludes direct personal and full payment identifiers.

Each contract includes a simulated read-only binding, runtime policy, assurance checks, concept scope, and content-addressed regulatory evidence locators.

## Primary sources reviewed

The pack was reviewed against sources current on 2026-07-27:

- [14 CFR 121.533](https://www.ecfr.gov/current/title-14/part-121/section-121.533): domestic operational control and joint pilot-in-command/dispatcher responsibility.
- [14 CFR 121.593](https://www.ecfr.gov/current/title-14/part-121/section-121.593): dispatcher authorization for domestic operations.
- [14 CFR 121.601](https://www.ecfr.gov/current/title-14/part-121/section-121.601): current airport, facility, and weather information supplied to the pilot in command.
- [14 CFR 121.639](https://www.ecfr.gov/current/title-14/part-121/section-121.639): domestic dispatch and takeoff fuel.
- [14 CFR 117.25](https://www.ecfr.gov/current/title-14/part-117/section-117.25): required flightcrew rest.
- [14 CFR 121.363](https://www.ecfr.gov/current/title-14/part-121/section-121.363) and [121.367](https://www.ecfr.gov/current/title-14/part-121/section-121.367): carrier airworthiness responsibility and maintenance programs.
- [14 CFR 121.703](https://www.ecfr.gov/current/title-14/part-121/section-121.703) and [121.709](https://www.ecfr.gov/current/title-14/part-121/section-121.709): service-difficulty reporting and airworthiness release or log entry.
- [FAA Safety Management Systems for Part 121 operators](https://www.faa.gov/about/initiatives/sms/specifics_by_aviation_industry_type/121) and [AC 120-92D](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1042733): Part 5 safety-management structure and implementation guidance.
- [14 CFR 259.4](https://www.ecfr.gov/current/title-14/part-259/section-259.4) and [DOT 2026 tarmac-delay reporting guidance](https://www.transportation.gov/airconsumer/tarmac-delay-reporting-2026): deplaning, care, notification, exception, and reporting evidence.
- [14 CFR Part 260](https://www.ecfr.gov/current/title-14/part-260) and [DOT refund guidance](https://www.transportation.gov/individuals/aviation-consumer-protection/refunds): automatic fare and ancillary-service refunds, significant changes, delayed baggage, and prompt-refund timing.
- [FAA Part 121 hazardous-material operations](https://www.faa.gov/hazmat/air_carriers/operations/part_121): carrier hazardous-material programs and the relationship among 14 CFR, 49 CFR, and ICAO Technical Instructions.
- [49 CFR Part 1544](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-XII/subchapter-C/part-1544): aircraft-operator security-program requirements. The ontology stores status and evidence references only; it does not reproduce Sensitive Security Information.

These sources are reference evidence, not legal advice. A production deployment should pin reviewed rule versions, carrier operations specifications and manuals, approved programs, exemptions, interpretations, and jurisdiction-specific requirements before publication.
