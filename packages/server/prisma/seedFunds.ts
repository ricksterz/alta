// GENERATED from the Open Disclosure project (~/dev/advisorapp), which
// builds on SEC Form ADV Schedule D 7.B.(1) private-fund reporting.
// Real fund names, types, domiciles, and gross asset values.
//
// Two fields are NOT from ADV and are synthetic: minInvestment (ADV does
// not report investment minimums) and closeDate.
//
// Three real characteristics are DROPPED on import because Alta's Fund
// model has nowhere to put them — see the note in seed.ts:
//   - exclusion3c1 / exclusion3c7 (investor eligibility regime)
//   - domicile (drives W-9 vs W-8BEN applicability)
//   - isMasterFund / isFeederFund
// They are retained as comments per fund so the gap stays visible.

export interface SeedFund {
  name: string;
  legalName: string;
  vehicleType: 'lp' | 'llc_feeder' | 'interval_fund' | 'non_traded_bdc' | 'evergreen';
  structure: 'drawdown' | 'continuous';
  minInvestment: number;
  closeDate: string | null;
  gpSignatoryName: string;
  /** ADV fund_type, verbatim — the real taxonomy Alta's vehicleType approximates. */
  advFundType: string;
  /** ADV domicile. No Fund column for this yet. */
  domicile: string;
  /** 3(c)(1) = accredited OK; 3(c)(7) = qualified purchaser required. No Fund column yet. */
  exclusion: '3c1' | '3c7' | null;
  grossAssetValueUsd: number;
}

export interface SeedSponsor {
  slug: string; name: string; gpEmail: string;
  gpFirstName: string; gpLastName: string; funds: SeedFund[];
}

export const SEED_SPONSORS: SeedSponsor[] = [
  {
    slug: "goldman-sachs-asset-management-l-p",
    name: "Goldman Sachs Asset Management, L.P.",
    gpEmail: "gpops@goldman.test",
    gpFirstName: "Priya", gpLastName: "Nair",
    funds: [
      {
        name: "Exchange Place Master LP",
        legalName: "EXCHANGE PLACE MASTER LP",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 500000, closeDate: "2027-03-31",
        gpSignatoryName: "Priya Nair",
        advFundType: "Other Private Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 12799849144,
      },
      {
        name: "Vintage IX B LP",
        legalName: "VINTAGE IX B LP",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 500000, closeDate: "2027-06-30",
        gpSignatoryName: "Priya Nair",
        advFundType: "Other Private Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 9633319825,
      },
      {
        name: "West Street Strategic Solutions Offshore Fund I, L.P.",
        legalName: "WEST STREET STRATEGIC SOLUTIONS OFFSHORE FUND I, L.P.",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 250000, closeDate: "2027-09-30",
        gpSignatoryName: "Priya Nair",
        advFundType: "Private Equity Fund",
        domicile: "Cayman Islands",
        exclusion: '3c7', grossAssetValueUsd: 7931788922,
      },
      {
        name: "Vintage VIII LP",
        legalName: "VINTAGE VIII LP",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 250000, closeDate: "2027-12-31",
        gpSignatoryName: "Priya Nair",
        advFundType: "Private Equity Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 7718077574,
      },
    ],
  },
  {
    slug: "ares-management-llc",
    name: "Ares Management LLC",
    gpEmail: "gpops@ares.test",
    gpFirstName: "Daniel", gpLastName: "Okafor",
    funds: [
      {
        name: "Ares Senior Credit Master Fund III LP",
        legalName: "ARES SENIOR CREDIT MASTER FUND III LP",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Daniel Okafor",
        advFundType: "Hedge Fund",
        domicile: "Cayman Islands",
        exclusion: '3c7', grossAssetValueUsd: 23210273397,
      },
      {
        name: "Ares Senior Direct Lending Master Fund II Designated Activity Company",
        legalName: "ARES SENIOR DIRECT LENDING MASTER FUND II DESIGNATED ACTIVITY COMPANY",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Daniel Okafor",
        advFundType: "Hedge Fund",
        domicile: "Ireland",
        exclusion: '3c7', grossAssetValueUsd: 12916740503,
      },
      {
        name: "Ares Capital Europe VI (E) II Levered, L.P.",
        legalName: "ARES CAPITAL EUROPE VI (E) II LEVERED, L.P.",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Daniel Okafor",
        advFundType: "Hedge Fund",
        domicile: "Luxembourg",
        exclusion: '3c7', grossAssetValueUsd: 9890543882,
      },
      {
        name: "Ares Capital Europe V (E) Levered",
        legalName: "ARES CAPITAL EUROPE V (E) LEVERED",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Daniel Okafor",
        advFundType: "Hedge Fund",
        domicile: "Luxembourg",
        exclusion: '3c7', grossAssetValueUsd: 9801923132,
      },
    ],
  },
  {
    slug: "two-sigma-investments-lp",
    name: "Two Sigma Investments, LP",
    gpEmail: "gpops@two.test",
    gpFirstName: "Sofia", gpLastName: "Marchetti",
    funds: [
      {
        name: "Two Sigma Absolute Return Portfolio, LLC",
        legalName: "TWO SIGMA ABSOLUTE RETURN PORTFOLIO, LLC",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Sofia Marchetti",
        advFundType: "Hedge Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 38337427187,
      },
      {
        name: "Two Sigma Spectrum Portfolio, LLC",
        legalName: "TWO SIGMA SPECTRUM PORTFOLIO, LLC",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Sofia Marchetti",
        advFundType: "Hedge Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 37231961306,
      },
      {
        name: "Two Sigma Equity Portfolio, LLC",
        legalName: "TWO SIGMA EQUITY PORTFOLIO, LLC",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Sofia Marchetti",
        advFundType: "Hedge Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 21754330720,
      },
      {
        name: "Two Sigma Futures Portfolio, LLC",
        legalName: "TWO SIGMA FUTURES PORTFOLIO, LLC",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Sofia Marchetti",
        advFundType: "Hedge Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 21599006885,
      },
    ],
  },
  {
    slug: "apollo-capital-management-l-p",
    name: "Apollo Capital Management, L.P.",
    gpEmail: "gpops@apollo.test",
    gpFirstName: "James", gpLastName: "Whitlock",
    funds: [
      {
        name: "Apollo Aligned Alternatives Aggregator, L.P.",
        legalName: "APOLLO ALIGNED ALTERNATIVES AGGREGATOR, L.P.",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 500000, closeDate: "2027-03-31",
        gpSignatoryName: "James Whitlock",
        advFundType: "Other Private Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 16694413528,
      },
      {
        name: "Apollo Aligned Alternatives (A), L.P.",
        legalName: "APOLLO ALIGNED ALTERNATIVES (A), L.P.",
        vehicleType: "llc_feeder", structure: "drawdown",
        minInvestment: 500000, closeDate: "2027-06-30",
        gpSignatoryName: "James Whitlock",
        advFundType: "Other Private Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 16690702951,
      },
      {
        name: "A-a Offshore (Aaa), L.P.",
        legalName: "A-A OFFSHORE (AAA), L.P.",
        vehicleType: "llc_feeder", structure: "drawdown",
        minInvestment: 500000, closeDate: "2027-09-30",
        gpSignatoryName: "James Whitlock",
        advFundType: "Other Private Fund",
        domicile: "Cayman Islands",
        exclusion: '3c7', grossAssetValueUsd: 13546688327,
      },
      {
        name: "Apollo Investment Fund IX, L.P.",
        legalName: "APOLLO INVESTMENT FUND IX, L.P.",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 250000, closeDate: "2027-12-31",
        gpSignatoryName: "James Whitlock",
        advFundType: "Private Equity Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 10929220785,
      },
    ],
  },
  {
    slug: "kohlberg-kravis-roberts-co-l-p",
    name: "Kohlberg Kravis Roberts & Co. L.P.",
    gpEmail: "gpops@kohlberg.test",
    gpFirstName: "Amara", gpLastName: "Osei",
    funds: [
      {
        name: "KKR North America Fund XIII SCSP",
        legalName: "KKR NORTH AMERICA FUND XIII SCSP",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 250000, closeDate: "2027-03-31",
        gpSignatoryName: "Amara Osei",
        advFundType: "Private Equity Fund",
        domicile: "Luxembourg",
        exclusion: '3c7', grossAssetValueUsd: 21165504870,
      },
      {
        name: "KKR Asian Fund IV SCSP",
        legalName: "KKR ASIAN FUND IV SCSP",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 250000, closeDate: "2027-06-30",
        gpSignatoryName: "Amara Osei",
        advFundType: "Private Equity Fund",
        domicile: "Luxembourg",
        exclusion: '3c7', grossAssetValueUsd: 17135524813,
      },
      {
        name: "KKR Global Infrastructure Investors IV (Usd) SCSP",
        legalName: "KKR GLOBAL INFRASTRUCTURE INVESTORS IV (USD) SCSP",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 250000, closeDate: "2027-09-30",
        gpSignatoryName: "Amara Osei",
        advFundType: "Private Equity Fund",
        domicile: "Luxembourg",
        exclusion: '3c7', grossAssetValueUsd: 13138805532,
      },
      {
        name: "KKR Americas Fund XII L.P.",
        legalName: "KKR AMERICAS FUND XII L.P.",
        vehicleType: "lp", structure: "drawdown",
        minInvestment: 250000, closeDate: "2027-12-31",
        gpSignatoryName: "Amara Osei",
        advFundType: "Private Equity Fund",
        domicile: "Cayman Islands",
        exclusion: '3c7', grossAssetValueUsd: 13011814877,
      },
    ],
  },
  {
    slug: "point72-asset-management-l-p",
    name: "Point72 Asset Management, L.P.",
    gpEmail: "gpops@point72.test",
    gpFirstName: "Henrik", gpLastName: "Lindqvist",
    funds: [
      {
        name: "Point72 Associates, LLC",
        legalName: "POINT72 ASSOCIATES, LLC",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Henrik Lindqvist",
        advFundType: "Hedge Fund",
        domicile: "Cayman Islands",
        exclusion: '3c7', grossAssetValueUsd: 266320056307,
      },
      {
        name: "Point72 Capital International, LTD.",
        legalName: "POINT72 CAPITAL INTERNATIONAL, LTD.",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Henrik Lindqvist",
        advFundType: "Hedge Fund",
        domicile: "Cayman Islands",
        exclusion: '3c7', grossAssetValueUsd: 32014110351,
      },
      {
        name: "Point72 Capital, L.P.",
        legalName: "POINT72 CAPITAL, L.P.",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Henrik Lindqvist",
        advFundType: "Hedge Fund",
        domicile: "Delaware",
        exclusion: '3c7', grossAssetValueUsd: 11324494524,
      },
      {
        name: "Point72 Turion Master, L.P.",
        legalName: "POINT72 TURION MASTER, L.P.",
        vehicleType: "evergreen", structure: "continuous",
        minInvestment: 1000000, closeDate: null,
        gpSignatoryName: "Henrik Lindqvist",
        advFundType: "Hedge Fund",
        domicile: "Cayman Islands",
        exclusion: '3c7', grossAssetValueUsd: 4339105745,
      },
    ],
  },
];
