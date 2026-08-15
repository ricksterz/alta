import { useState } from "react";

// Disclosures and a glossary, shown on every authenticated page.
//
// The disclosures are not decoration: this app renders documents that look
// like executed subscription agreements, records something it calls a
// signature, and makes eligibility determinations from self-attested data.
// Each of those invites a reader to assume more than is true, so each gets a
// line saying plainly what it is and isn't.
//
// The acronym list exists because this domain is dense with initialisms whose
// meanings materially change what a control does — QP vs accredited being the
// clearest example, and the one this build turns into an actual gate.

interface Acronym {
  term: string;
  expansion: string;
  note: string;
}

const ACRONYMS: Acronym[] = [
  {
    term: "QP",
    expansion: "Qualified Purchaser",
    note: "Investment Company Act §2(a)(51). Broadly, a person owning ≥$5M in investments (≥$25M if investing for others). A higher bar than accredited investor, and required to invest in a 3(c)(7) fund.",
  },
  {
    term: "Accredited Investor",
    expansion: "Regulation D, Rule 501(a)",
    note: "Broadly, ≥$1M net worth excluding primary residence, or ≥$200k income ($300k joint). Sufficient for a 3(c)(1) fund; NOT sufficient for a 3(c)(7) fund.",
  },
  {
    term: "3(c)(1)",
    expansion: "Investment Company Act §3(c)(1)",
    note: "Exclusion from registration for funds with no more than 100 beneficial owners. Open to accredited investors.",
  },
  {
    term: "3(c)(7)",
    expansion: "Investment Company Act §3(c)(7)",
    note: "Exclusion from registration for funds whose investors are all qualified purchasers. No 100-holder cap.",
  },
  {
    term: "3c-5",
    expansion: "Rule 3c-5",
    note: "Permits “knowledgeable employees” of a fund to invest in a 3(c)(1) or 3(c)(7) fund without counting toward the holder cap or needing QP status.",
  },
  {
    term: "ADV",
    expansion: "Form ADV",
    note: "The registration and disclosure form investment advisers file with the SEC. Schedule D 7.B.(1) is the private-fund section this app's fund data comes from.",
  },
  {
    term: "AML",
    expansion: "Anti-Money Laundering",
    note: "Screening obligations. Not performed by this application.",
  },
  { term: "AUM", expansion: "Assets Under Management", note: "Total client assets an adviser manages." },
  {
    term: "BDC",
    expansion: "Business Development Company",
    note: "A closed-end vehicle investing primarily in small and mid-sized private companies.",
  },
  {
    term: "CRD",
    expansion: "Central Registration Depository",
    note: "The identifier assigned to advisers and representatives in FINRA/SEC registration systems.",
  },
  {
    term: "EIN",
    expansion: "Employer Identification Number",
    note: "Federal taxpayer identifier for an entity.",
  },
  {
    term: "ESIGN",
    expansion: "Electronic Signatures in Global and National Commerce Act",
    note: "US federal law governing the legal effect of electronic signatures. The signature ceremony in this build is NOT ESIGN-compliant.",
  },
  { term: "GAV", expansion: "Gross Asset Value", note: "A fund's total assets before subtracting liabilities." },
  {
    term: "GP",
    expansion: "General Partner",
    note: "The managing partner of a fund, with management authority and unlimited liability. Countersigns subscription agreements.",
  },
  {
    term: "KYC",
    expansion: "Know Your Customer",
    note: "Identity verification obligations. Not performed by this application.",
  },
  {
    term: "LP",
    expansion: "Limited Partner / Limited Partnership",
    note: "Either the investor class in a fund (limited liability, no management role) or the entity form itself.",
  },
  {
    term: "QIB",
    expansion: "Qualified Institutional Buyer",
    note: "Rule 144A. An institution owning/investing ≥$100M in securities; treated as a qualified purchaser.",
  },
  { term: "Reg D", expansion: "Regulation D", note: "The Securities Act exemption most private placements rely on." },
  { term: "RIA", expansion: "Registered Investment Adviser", note: "An adviser registered with the SEC or a state." },
  { term: "SEC", expansion: "Securities and Exchange Commission", note: "US federal securities regulator." },
  { term: "SSN", expansion: "Social Security Number", note: "Federal taxpayer identifier for an individual." },
  { term: "TIN", expansion: "Taxpayer Identification Number", note: "Umbrella term covering SSN and EIN." },
  {
    term: "UETA",
    expansion: "Uniform Electronic Transactions Act",
    note: "State-level counterpart to ESIGN. Also not satisfied by this build's signature ceremony.",
  },
  {
    term: "W-9",
    expansion: "IRS Form W-9",
    note: "Certifies US person status and taxpayer identification number.",
  },
  {
    term: "W-8BEN",
    expansion: "IRS Form W-8BEN",
    note: "Certifies foreign status, and claims treaty benefits where applicable.",
  },
];

const DISCLOSURES: { heading: string; body: string }[] = [
  {
    heading: "Demonstration system",
    body: "Alta is a development build populated with test data. It does not execute securities transactions, transmit funds, or transmit documents to any counterparty. Nothing here creates a binding obligation.",
  },
  {
    heading: "Not an offer, and not investment advice",
    body: "Fund records shown here are reference data, not offers to sell or solicitations to buy any security. Nothing in this application is investment, legal, or tax advice. Any actual offering is made solely through a fund's own offering documents.",
  },
  {
    heading: "Signatures are not legally binding",
    body: "The signing step records a typed name, timestamp, and IP address for workflow purposes. It is not a compliant electronic signature under ESIGN or UETA, and the resulting document is not an executed agreement.",
  },
  {
    heading: "Eligibility is self-attested and unverified",
    body: "Accredited investor and qualified purchaser determinations are recorded as entered by the advisory representative. Alta performs no independent verification of income, net worth, or investments, and performs no KYC or AML screening. Eligibility gates here reduce obvious errors; they are not a substitute for the fund's own subscription review.",
  },
  {
    heading: "Fund data provenance",
    body: "Fund names, types, domiciles, Investment Company Act exclusions, master/feeder status, and gross asset values are derived from public SEC Form ADV Schedule D 7.B.(1) filings and may be stale or superseded. Investment minimums and close dates shown are synthetic — Form ADV does not report them — and should not be relied on.",
  },
  {
    heading: "Generated documents",
    body: "Subscription documents in this build are rendered locally from mapped field values and are illustrative only. They are not a fund's actual subscription agreement, and unmapped or unresolved fields are left blank rather than inferred.",
  },
];

export function SiteFooter() {
  const [showGlossary, setShowGlossary] = useState(false);

  return (
    <footer className="mt-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Important disclosures
          </h2>
          <button
            type="button"
            onClick={() => setShowGlossary((v) => !v)}
            aria-expanded={showGlossary}
            className="rounded border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
          >
            {showGlossary ? "Hide" : "Show"} acronyms &amp; terms
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-5 md:grid-cols-2">
          {DISCLOSURES.map((d) => (
            <div key={d.heading}>
              <h3 className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{d.heading}</h3>
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{d.body}</p>
            </div>
          ))}
        </div>

        {showGlossary && (
          <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-6">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Acronyms &amp; terms
            </h3>
            <dl className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
              {ACRONYMS.map((a) => (
                <div key={a.term}>
                  <dt className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {a.term}
                    <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">{a.expansion}</span>
                  </dt>
                  <dd className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{a.note}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <p className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-5 text-xs text-slate-400 dark:text-slate-500">
          Alta — development build. Fund reference data derived from public SEC filings. Not for
          production use.
        </p>
      </div>
    </footer>
  );
}
