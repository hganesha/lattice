# Telecommunications / NVO ontology and regulatory references

The telecommunications pack models a U.S.-oriented communications provider and a virtual or mobile virtual network operator (NVO/MVNO) that may depend on one or more host networks. It is a governed decision-support model, not a static determination that a rule applies to a provider, service, incident, or customer interaction.

## Shared ontology

Eleven repository-owned source schemas under `schemas/telecommunications/` contribute 196 mapped fields with 100% field coverage:

- provider profile and wholesale-network responsibilities;
- subscriber account, service subscription, plan label, and service order;
- number-port order and emergency-service provisioning;
- usage and charging record;
- network incident and outage reporting;
- CPNI authorization and access safeguards; and
- robocall-compliance profile.

The generator consolidates them into 19 entity types and 24 relationships:

- providers and wholesale delivery: Communications Provider, Wholesale Network Agreement, Network Resource;
- customer and service: Subscriber, Customer Account, Service Subscription, Service Plan, Service Order, Service Address;
- numbering and usage: Telephone Number, Number Port Order, Usage Record, Charge;
- operations and public safety: Service Quality Measurement, Network Incident, Emergency Service Record;
- privacy and compliance: Privacy Authorization, Robocall Compliance Profile, Regulatory Requirement.

The pack deliberately separates the retail provider, host or wholesale provider, responsibility allocation, and evidence source. That distinction matters for an NVO: outsourcing radio access, switching, numbering operations, or platform functions does not by itself answer which entity holds a regulatory or contractual duty.

## Seeded reference contracts

The registry seeds three published, readable reference contracts into `workspace-telecommunications`:

1. **Number Port & Service Activation Assurance** checks standard port fields, interval classification, service dependencies, and emergency-service provisioning. It cannot authenticate a subscriber, submit an LSR, port a number, or activate service.
2. **Network Outage & 911 Reporting Assurance** evaluates service-specific outage thresholds, filing clocks, host-network evidence, 911 or PSAP impact, and restoration evidence. Only an authorized provider representative can file or attest.
3. **CPNI Access & Use Assurance** evaluates the proposed purpose, approval basis, authentication channel, disclosure or campaign logging, retention, and minimum-necessary context. It never discloses CPNI or grants access itself.

Each contract includes a simulated read-only binding, explicit operation, approval-gated policy, assurance checks, concept scope, and content-addressed primary-source evidence.

## Standards alignment

- [TM Forum Information Framework (SID)](https://www.tmforum.org/open-digital-architecture/information-framework-sid/) informs the separation of customer, product, service, resource, and party concepts.
- [TM Forum TMF641 Service Ordering API](https://www.tmforum.org/open-digital-architecture/open-apis/service-ordering-management-api-TMF641/v4.1) informs service-order lifecycle and decomposition fields.
- [3GPP TS 23.501](https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3144) informs 5G system, network-slice, access, and service terminology.

These are semantic alignment references, not claims of API conformance or a substitute for a licensed standards implementation.

## Primary U.S. regulatory sources reviewed

The pack was reviewed against primary sources available on 2026-07-27:

- [47 CFR Part 52, Subpart C](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-52/subpart-C), including [§ 52.34](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-52/subpart-C/section-52.34), [§ 52.35](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-52/subpart-C/section-52.35), and [§ 52.36](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-52/subpart-C/section-52.36): port-facilitation duties, simple and non-simple port intervals, and the standard simple-port data set.
- [47 CFR Part 4](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-4), including [§ 4.9](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-4/section-4.9) and [§ 4.11](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-4/section-4.11): service-specific outage thresholds, notifications and reports, authorized filers, and final-report attestation.
- [47 CFR Part 9](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-9), including [§ 9.10](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-9/section-9.10): 911 obligations and reseller responsibilities for supported services and devices.
- [47 CFR Part 64, Subpart U](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U), including [§ 64.2007](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U/section-64.2007), [§ 64.2009](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U/section-64.2009), and [§ 64.2010](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-U/section-64.2010): CPNI approval, safeguards, supervisory review, customer authentication, notification, and recordkeeping.

The robocall profile stores provider status, evidence references, version dates, and review state, but the seeded contracts do not turn changing robocall rules into an automated legal conclusion. Similarly, rules with a deferred compliance date or pending information-collection approval must not be treated as effective merely because a field exists.

These sources are reference evidence, not legal advice. A production deployment should pin the reviewed rule text and effective date, provider classification, licenses and authorizations, service and jurisdiction, host-network agreement, numbering roles, 911 architecture, exemptions, waivers, FCC orders, and counsel-approved interpretations before publication.
