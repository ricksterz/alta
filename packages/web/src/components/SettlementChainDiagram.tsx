import { useEffect, useRef, useState } from "react";

// The subscription settlement pipeline, as a diagram rather than a table of
// tenant types. Two versions of the same chain: "simple" is the six roles a
// first-time visitor needs, "extended" is the full ten-party version
// (placement agent, escrow agent, secondary transferee, auditor/K-1) for
// whoever wants the real picture. Defaults to simple; the toggle in the
// transport bar switches to extended.
//
// Styling is scoped under .chain-diagram rather than global :root, and dark
// mode piggybacks on the app's own `.dark` class on <html> (see
// ThemeContext.tsx) instead of re-deriving theme state independently — this
// component lives inside the app, unlike the standalone artifact it started
// as, so it should follow the app's theme rather than carry its own.

interface DiagramNode {
  role: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  tag: string;
  label: string;
  labelFontSize?: number;
  terminal?: boolean;
}

interface DiagramEdge {
  id: string;
  d: string;
  kind: "lane-a" | "lane-b" | "lane-c" | "trunk" | "gate";
}

interface DiagramCaption {
  x: number;
  y: number;
  text: string;
}

interface ParticleLane {
  edgeId: string;
  cls: string;
  count: number;
  duration: number;
  radius: number;
  phase: number;
}

interface LegendItem {
  color: string;
  label: string;
}

// Decorative, non-interactive fan-out — used once, to show a single fund's
// capital reaching many portfolio companies without needing a full node (and
// a full detail-panel entry) per company.
interface Decoration {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  r: number;
}

interface SectionCaption {
  x: number;
  y: number;
  text: string;
}

interface DiagramSpec {
  viewBox: string;
  minWidth: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  captions: DiagramCaption[];
  sectionCaptions?: SectionCaption[];
  decorations?: Decoration[];
  particleLanes: ParticleLane[];
  legend: LegendItem[];
}

const SIMPLE: DiagramSpec = {
  viewBox: "0 0 1500 500",
  minWidth: 900,
  captions: [
    { x: 110, y: 106, text: "via an advisor" },
    { x: 110, y: 454, text: "going direct" },
  ],
  nodes: [
    { role: "investor-advised", x: 110, y: 160, w: 156, h: 60, tag: "party 1a", label: "Investor" },
    { role: "advisor", x: 380, y: 160, w: 144, h: 60, tag: "party 2", label: "Advisor" },
    { role: "investor-direct", x: 110, y: 400, w: 156, h: 60, tag: "party 1b", label: "Investor" },
    { role: "counsel", x: 650, y: 110, w: 172, h: 54, tag: "gate", label: "Fund Counsel", labelFontSize: 13.5 },
    { role: "sponsor", x: 650, y: 280, w: 168, h: 64, tag: "party 3", label: "Fund Sponsor" },
    { role: "admin", x: 900, y: 280, w: 184, h: 64, tag: "party 4", label: "Fund Administrator", labelFontSize: 13.5 },
    { role: "custodian", x: 1130, y: 280, w: 160, h: 64, tag: "party 5", label: "Custodian" },
    { role: "position", x: 1350, y: 280, w: 164, h: 64, rx: 32, tag: "settled", label: "On-Chain Position", labelFontSize: 13, terminal: true },
  ],
  edges: [
    { id: "edgeAdvisor", kind: "lane-a", d: "M 110 160 C 200 160, 280 160, 380 160 C 480 160, 540 220, 566 280" },
    { id: "edgeDirect", kind: "lane-b", d: "M 110 400 C 260 400, 400 400, 480 400 C 540 400, 560 340, 566 280" },
    { id: "edgeGate", kind: "gate", d: "M 650 137 L 650 248" },
    { id: "edgeTrunk1", kind: "trunk", d: "M 734 280 L 808 280" },
    { id: "edgeTrunk2", kind: "trunk", d: "M 992 280 L 1050 280" },
    { id: "edgeTrunk3", kind: "trunk", d: "M 1210 280 L 1268 280" },
  ],
  particleLanes: [
    { edgeId: "edgeAdvisor", cls: "lane-a", count: 3, duration: 3.2, radius: 3.6, phase: 0 },
    { edgeId: "edgeDirect", cls: "lane-b", count: 3, duration: 3.2, radius: 3.6, phase: 0.33 },
    { edgeId: "edgeTrunk1", cls: "trunk", count: 3, duration: 1.5, radius: 3.6, phase: 0 },
    { edgeId: "edgeTrunk2", cls: "trunk", count: 3, duration: 1.6, radius: 3.6, phase: 0.2 },
    { edgeId: "edgeTrunk3", cls: "trunk", count: 2, duration: 0.9, radius: 3.6, phase: 0 },
    { edgeId: "edgeGate", cls: "gate", count: 1, duration: 4.5, radius: 2.6, phase: 0 },
  ],
  legend: [
    { color: "var(--chain-accent-2)", label: "direct" },
    { color: "var(--chain-accent)", label: "via advisor" },
    { color: "var(--chain-muted)", label: "template gate" },
  ],
};

const EXTENDED: DiagramSpec = {
  viewBox: "0 0 1930 980",
  minWidth: 1180,
  captions: [
    { x: 90, y: 62, text: "via an advisor" },
    { x: 90, y: 252, text: "via a placement agent" },
    { x: 90, y: 542, text: "going direct" },
    { x: 1820, y: 82, text: "later, on transfer" },
    { x: 1820, y: 502, text: "annual, after funding" },
    { x: 1090, y: 494, text: "only before first close" },
  ],
  sectionCaptions: [{ x: 1000, y: 640, text: "capital deployment, once funded — across every LP, not per subscription" }],
  nodes: [
    { role: "investor-advised", x: 90, y: 110, w: 156, h: 60, tag: "party 1a", label: "Investor" },
    { role: "advisor", x: 340, y: 110, w: 144, h: 60, tag: "party 2a", label: "Advisor" },
    { role: "investor-placement", x: 90, y: 300, w: 156, h: 60, tag: "party 1b", label: "Investor" },
    { role: "placement-agent", x: 340, y: 300, w: 176, h: 60, tag: "party 2b", label: "Placement Agent", labelFontSize: 13.5 },
    { role: "investor-direct", x: 90, y: 490, w: 156, h: 60, tag: "party 1c", label: "Investor" },
    { role: "counsel", x: 610, y: 60, w: 172, h: 54, tag: "gate", label: "Fund Counsel", labelFontSize: 13.5 },
    { role: "sponsor", x: 610, y: 300, w: 168, h: 64, tag: "party 3", label: "Fund Sponsor" },
    { role: "admin", x: 860, y: 300, w: 184, h: 64, tag: "party 4", label: "Fund Administrator", labelFontSize: 13.5 },
    { role: "escrow", x: 1090, y: 440, w: 160, h: 64, tag: "optional hop", label: "Escrow Agent", labelFontSize: 13.5 },
    { role: "custodian", x: 1310, y: 300, w: 160, h: 64, tag: "party 5", label: "Custodian" },
    { role: "position", x: 1540, y: 300, w: 170, h: 64, rx: 32, tag: "settled", label: "On-Chain Position", labelFontSize: 13, terminal: true },
    { role: "secondary", x: 1820, y: 150, w: 180, h: 60, tag: "party 6", label: "Secondary Transferee", labelFontSize: 13 },
    { role: "auditor", x: 1820, y: 450, w: 176, h: 60, tag: "party 7", label: "Auditor / K-1", labelFontSize: 13.5 },
    { role: "master-fund", x: 820, y: 820, w: 170, h: 60, tag: "optional hop", label: "Master Fund", labelFontSize: 13.5 },
    { role: "portfolio", x: 1180, y: 820, w: 190, h: 64, rx: 32, tag: "destination", label: "Portfolio Investments", labelFontSize: 12.5, terminal: true },
  ],
  edges: [
    { id: "edgeAdvisor", kind: "lane-a", d: "M 168 110 C 320 110, 460 200, 526 300" },
    { id: "edgeAdvisorToPlacement", kind: "gate", d: "M 340 140 L 340 270" },
    { id: "edgePlacement", kind: "lane-c", d: "M 168 300 L 526 300" },
    { id: "edgeDirect", kind: "lane-b", d: "M 168 490 C 320 490, 460 420, 526 300" },
    { id: "edgeGate", kind: "gate", d: "M 610 87 L 610 268" },
    { id: "edgeTrunk1", kind: "trunk", d: "M 694 300 L 768 300" },
    { id: "edgeAdminCustodianDirect", kind: "trunk", d: "M 952 300 L 1230 300" },
    { id: "edgeAdminToEscrow", kind: "gate", d: "M 860 332 C 900 400, 960 440, 1010 440" },
    { id: "edgeEscrowToCustodian", kind: "gate", d: "M 1170 440 C 1220 440, 1280 400, 1310 332" },
    { id: "edgeTrunk4", kind: "trunk", d: "M 1390 300 L 1455 300" },
    { id: "edgeSecondary", kind: "gate", d: "M 1625 300 C 1700 300, 1700 150, 1730 150" },
    { id: "edgeAudit", kind: "gate", d: "M 1625 300 C 1700 300, 1700 450, 1732 450" },
    { id: "edgeDeployDirect", kind: "trunk", d: "M 610 332 C 700 550, 950 700, 1085 800" },
    { id: "edgeDeployViaMaster", kind: "gate", d: "M 610 332 C 650 550, 780 700, 820 790" },
    { id: "edgeMasterToPortfolio", kind: "gate", d: "M 905 820 C 970 820, 1030 830, 1085 840" },
  ],
  particleLanes: [
    { edgeId: "edgeAdvisor", cls: "lane-a", count: 3, duration: 3.2, radius: 3.6, phase: 0 },
    { edgeId: "edgeAdvisorToPlacement", cls: "gate", count: 1, duration: 3.5, radius: 2.6, phase: 0.4 },
    { edgeId: "edgePlacement", cls: "lane-c", count: 3, duration: 3.2, radius: 3.6, phase: 0.5 },
    { edgeId: "edgeDirect", cls: "lane-b", count: 3, duration: 3.2, radius: 3.6, phase: 0.33 },
    { edgeId: "edgeTrunk1", cls: "trunk", count: 3, duration: 1.4, radius: 3.6, phase: 0 },
    { edgeId: "edgeAdminCustodianDirect", cls: "trunk", count: 3, duration: 1.3, radius: 3.6, phase: 0.15 },
    { edgeId: "edgeAdminToEscrow", cls: "gate", count: 1, duration: 3.8, radius: 2.6, phase: 0.2 },
    { edgeId: "edgeEscrowToCustodian", cls: "gate", count: 1, duration: 2.2, radius: 2.6, phase: 0.6 },
    { edgeId: "edgeTrunk4", cls: "trunk", count: 2, duration: 0.9, radius: 3.6, phase: 0 },
    { edgeId: "edgeGate", cls: "gate", count: 1, duration: 4.5, radius: 2.6, phase: 0 },
    { edgeId: "edgeSecondary", cls: "gate", count: 1, duration: 5.5, radius: 2.8, phase: 0.2 },
    { edgeId: "edgeAudit", cls: "gate", count: 1, duration: 6, radius: 2.8, phase: 0.6 },
    { edgeId: "edgeDeployDirect", cls: "capital", count: 3, duration: 2.6, radius: 3.6, phase: 0 },
    { edgeId: "edgeDeployViaMaster", cls: "gate", count: 1, duration: 4, radius: 2.6, phase: 0.1 },
    { edgeId: "edgeMasterToPortfolio", cls: "gate", count: 1, duration: 2, radius: 2.6, phase: 0.5 },
  ],
  decorations: [
    { id: "sat1", from: { x: 1275, y: 800 }, to: { x: 1400, y: 750 }, r: 9 },
    { id: "sat2", from: { x: 1275, y: 820 }, to: { x: 1420, y: 820 }, r: 9 },
    { id: "sat3", from: { x: 1275, y: 840 }, to: { x: 1400, y: 890 }, r: 9 },
  ],
  legend: [
    { color: "var(--chain-accent-2)", label: "direct" },
    { color: "var(--chain-accent)", label: "via advisor" },
    { color: "var(--chain-accent-3)", label: "via placement agent" },
    { color: "var(--chain-accent-4)", label: "capital deployed" },
    { color: "var(--chain-muted)", label: "occasional / gating" },
  ],
};

const ROLES: Record<string, { label: string; tag: string; text: string }> = {
  "investor-advised": {
    label: "Investor",
    tag: "party 1a — via an advisor",
    text: "Supplies identity, accreditation, and (for a 3(c)(7) fund) qualified-purchaser status. From here, an advisor carries the paperwork on their behalf.",
  },
  "investor-placement": {
    label: "Investor",
    tag: "party 1b — via a placement agent",
    text: "The same investor role, introduced through a placement agent instead of an advisor. The paperwork still runs through the same subscription pipeline once they're in it.",
  },
  "investor-direct": {
    label: "Investor",
    tag: "party — going direct",
    text: "The same investor role, minus any intermediary: when a fund sponsor grants access straight to an investor, that investor originates, signs, and tracks their own subscription — no advisor or placement agent ever sees it.",
  },
  advisor: {
    label: "Advisor",
    tag: "party 2a",
    text: "Onboards the investor, generates the subscription document from the fund's template, and collects the investor's signature. Cannot accept, reject, or fund its own subscription — that separation of duties is enforced, not just implied. Represents the investor's side of the relationship. Reaches the sponsor directly most of the time, but a capacity-constrained fund sometimes only takes allocations through the placement agent it has engaged — the dashed link down to Placement Agent.",
  },
  "placement-agent": {
    label: "Placement Agent",
    tag: "party 2b",
    text: "A paid distribution channel that introduces prospective investors to the fund, compensated by the sponsor with a placement fee. The mirror image of an advisor: an advisor represents the investor; a placement agent represents the fund it's placing. Reachable two ways — directly by an investor with no advisor at all, or as the route an advisor is sometimes required to use to access a specific fund.",
  },
  counsel: {
    label: "Fund Counsel",
    tag: "gate — before any subscription",
    text: "Reviews and approves the subscription-document template itself, once per fund, before it's usable. Outside counsel — not part of any single transaction, but nothing downstream is signable without their sign-off first.",
  },
  sponsor: {
    label: "Fund Sponsor (GP)",
    tag: "party 3",
    text: "The general partner. Countersigns every subscription after the investor side is fully executed, and sets the fund's terms, share classes, and close calendar upstream of all of this.",
  },
  admin: {
    label: "Fund Administrator",
    tag: "party 4",
    text: "Reviews the countersigned subscription and accepts or rejects it — when one is engaged for the fund. If not, the sponsor performs this step itself; the pipeline never blocks on a party who isn't there.",
  },
  escrow: {
    label: "Escrow Agent",
    tag: "optional — only before a fund's first close",
    text: "Holds subscribed capital until a drawdown fund's first-close minimum is actually met, before releasing it to the fund — a real gate, but not a recurring one. Once a fund has had its first close, it's already an operating fund: a later investor's capital just gets confirmed and added, with no minimum left to wait for. Most subscriptions go straight from administrator to custodian; this detour only applies to the handful that land before that first close clears. It has nothing to do with tokenization — this is about the fund not existing yet in a fundable sense, not about where the record ends up afterward.",
  },
  custodian: {
    label: "Custodian",
    tag: "party 5",
    text: "Confirms the investor's capital actually landed. That confirmation is the one event that turns an accepted subscription into a funded one.",
  },
  position: {
    label: "On-Chain Position",
    tag: "settled",
    text: "A position opens the moment a subscription funds, and its holding can be tokenized — the security's ownership record moves from a signature trail to an on-chain register. Not the end of the chain: a position can later transfer, and it always gets audited.",
  },
  secondary: {
    label: "Secondary Transferee",
    tag: "party 6 — later, on transfer",
    text: "A different investor receiving an existing position after it's already funded. The same eligibility engine — accreditation, qualified-purchaser status, holder caps — runs again for them, just later and on a transfer instead of a new subscription.",
  },
  auditor: {
    label: "Auditor / K-1",
    tag: "party 7 — annual, after funding",
    text: "Performs the fund's annual financial statement audit and prepares each investor's K-1 tax reporting. Not part of any single subscription — an ongoing, once-a-year relationship that starts only after a position is funded.",
  },
  "master-fund": {
    label: "Master Fund",
    tag: "optional — feeder structure",
    text: "In a master-feeder structure, LPs actually subscribe to a feeder fund — what 'Fund Sponsor' represents on this diagram — which pools their capital and invests it into a separate master fund. The master is the entity that actually deploys into the underlying investments; the feeder itself never touches one directly. Most funds skip this hop and invest straight from the fund an LP subscribed to — this path only applies to the ones that don't.",
  },
  portfolio: {
    label: "Portfolio Investments",
    tag: "many — depends on strategy",
    text: "Where committed capital actually goes to work, decided by the GP under the fund's stated strategy — and what that is varies enormously: operating companies or startups for a PE or venture fund, physical real estate or infrastructure for a real-assets fund, a diversified book of loans for a credit strategy, digital assets for a crypto-focused one. This is the one part of the chain AltsFlow doesn't track — subscription execution ends once a position is funded; what the fund does with the capital afterward is portfolio management, a different system entirely.",
  },
};

type Mode = "simple" | "extended";

export function SettlementChainDiagram() {
  const [mode, setMode] = useState<Mode>("simple");
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);

  const playingRef = useRef(playing);
  playingRef.current = playing;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
  const particleGroupRef = useRef<SVGGElement | null>(null);

  const spec = mode === "extended" ? EXTENDED : SIMPLE;

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) setPlaying(false);
  }, []);

  // Rebuild the particle set whenever the diagram (mode) changes — the edge
  // paths themselves are different, so cached lengths/offsets would be wrong.
  useEffect(() => {
    const group = particleGroupRef.current;
    if (!group) return;
    group.innerHTML = "";

    const svgns = "http://www.w3.org/2000/svg";
    const dots: { el: SVGCircleElement; path: SVGPathElement; len: number; duration: number; offset: number }[] = [];

    for (const lane of spec.particleLanes) {
      const path = pathRefs.current.get(lane.edgeId);
      if (!path) continue;
      const len = path.getTotalLength();
      for (let i = 0; i < lane.count; i++) {
        const el = document.createElementNS(svgns, "circle");
        el.setAttribute("r", String(lane.radius));
        el.setAttribute("class", `chain-particle chain-particle-${lane.cls}`);
        group.appendChild(el);
        dots.push({ el, path, len, duration: lane.duration, offset: (lane.phase + i / lane.count) % 1 });
      }
    }

    let raf = 0;
    let last = performance.now();
    let accumulated = 0;

    function frame(now: number) {
      if (playingRef.current) {
        accumulated += (now - last) / 1000;
      }
      last = now;
      for (const d of dots) {
        const progress = (d.offset + accumulated / d.duration) % 1;
        const pt = d.path.getPointAtLength(progress * d.len);
        d.el.setAttribute("cx", String(pt.x));
        d.el.setAttribute("cy", String(pt.y));
        const edgeFade = Math.min(progress, 1 - progress) * 10;
        d.el.style.opacity = String(Math.min(1, edgeFade));
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const activeRole = selected && ROLES[selected] ? ROLES[selected] : null;

  return (
    <div className="chain-diagram">
      <style>{`
        .chain-diagram {
          --chain-surface: #ffffff;
          --chain-surface-2: #efe7d3;
          --chain-ink: #201c14;
          --chain-muted: #6f6a5c;
          --chain-accent: #b8842f;
          --chain-accent-ink: #fff8ea;
          --chain-accent-2: #1a9585;
          --chain-accent-3: #b8503c;
          --chain-accent-4: #3f8452;
          --chain-line: #ddd3ba;
          --chain-node-stroke: #cdbf9c;
          --chain-shadow: rgba(120, 100, 60, 0.18);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .dark .chain-diagram {
          --chain-surface: #131a2b;
          --chain-surface-2: #1c2540;
          --chain-ink: #e8ecf5;
          --chain-muted: #8896b8;
          --chain-accent: #d4a24e;
          --chain-accent-ink: #2a1c04;
          --chain-accent-2: #45c9b8;
          --chain-accent-3: #d98a7a;
          --chain-accent-4: #7fc98e;
          --chain-line: #2a3352;
          --chain-node-stroke: #3a466e;
          --chain-shadow: rgba(0, 0, 0, 0.45);
        }

        .chain-stage {
          background: var(--chain-surface);
          border: 1px solid var(--chain-line);
          border-radius: 14px;
          box-shadow: 0 20px 50px -30px var(--chain-shadow);
          overflow: hidden;
        }
        .chain-transport {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 20px;
          border-bottom: 1px solid var(--chain-line);
          background: var(--chain-surface-2);
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 12px;
          color: var(--chain-muted);
          flex-wrap: wrap;
        }
        .chain-modes {
          display: flex;
          gap: 2px;
          border: 1px solid var(--chain-node-stroke);
          border-radius: 8px;
          padding: 2px;
        }
        .chain-modebtn {
          border: none;
          background: transparent;
          color: var(--chain-muted);
          border-radius: 6px;
          padding: 5px 11px;
          font: inherit;
          cursor: pointer;
        }
        .chain-modebtn[aria-pressed="true"] {
          background: var(--chain-accent);
          color: var(--chain-accent-ink);
        }
        .chain-sep {
          width: 1px;
          height: 18px;
          background: var(--chain-line);
        }
        .chain-playbtn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid var(--chain-node-stroke);
          background: var(--chain-surface);
          color: var(--chain-ink);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
          flex: none;
        }
        .chain-playbtn svg { width: 11px; height: 11px; }
        .chain-legend {
          margin-left: auto;
          display: flex;
          gap: 14px;
        }
        .chain-legend span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }
        .chain-swatch {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .chain-canvas-wrap {
          position: relative;
          width: 100%;
          overflow-x: auto;
        }
        .chain-svg {
          display: block;
          width: 100%;
          height: auto;
          animation: chain-fade-in 220ms ease;
        }
        @keyframes chain-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .chain-edge { fill: none; stroke: var(--chain-line); stroke-width: 1.5; }
        .chain-edge-gate { stroke-dasharray: 3 5; }
        .chain-particle-lane-a { fill: var(--chain-accent); }
        .chain-particle-lane-b { fill: var(--chain-accent-2); }
        .chain-particle-lane-c { fill: var(--chain-accent-3); }
        .chain-particle-capital { fill: var(--chain-accent-4); }
        .chain-particle-trunk { fill: var(--chain-accent); }
        .chain-particle-gate { fill: var(--chain-muted); }
        .chain-node { cursor: pointer; }
        .chain-node rect {
          fill: var(--chain-surface-2);
          stroke: var(--chain-node-stroke);
          stroke-width: 1.3;
          transition: stroke 0.15s ease;
        }
        .chain-node:hover rect, .chain-node:focus-visible rect, .chain-node.chain-active rect {
          stroke: var(--chain-accent);
        }
        .chain-node.chain-terminal rect { fill: var(--chain-accent); stroke: var(--chain-accent); }
        .chain-node text {
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
          fill: var(--chain-ink);
          pointer-events: none;
        }
        .chain-node.chain-terminal text { fill: var(--chain-accent-ink); }
        .chain-role-label { font-size: 15px; }
        .chain-role-tag {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 9.5px;
          letter-spacing: 0.07em;
          fill: var(--chain-muted);
          text-transform: uppercase;
        }
        .chain-node.chain-terminal .chain-role-tag { fill: var(--chain-accent-ink); opacity: 0.75; }
        .chain-ring {
          fill: none;
          stroke: var(--chain-accent);
          stroke-width: 1.5;
          opacity: 0;
          transform-origin: center;
          animation: chain-pulse 2.6s ease-out infinite;
        }
        @keyframes chain-pulse {
          0% { opacity: 0.55; stroke-width: 3; r: 34; }
          100% { opacity: 0; stroke-width: 0.5; r: 58; }
        }
        .chain-satellite-line {
          fill: none;
          stroke: var(--chain-line);
          stroke-width: 1.3;
        }
        .chain-satellite-dot {
          fill: var(--chain-accent-4);
        }
        .chain-satellite-ring {
          fill: none;
          stroke: var(--chain-accent-4);
          stroke-width: 1.2;
          opacity: 0;
          transform-origin: center;
          animation: chain-pulse-small 2.4s ease-out infinite;
        }
        @keyframes chain-pulse-small {
          0% { opacity: 0.5; stroke-width: 2; r: 9; }
          100% { opacity: 0; stroke-width: 0.4; r: 20; }
        }
        .chain-section-caption {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 10.5px;
          letter-spacing: 0.08em;
          fill: var(--chain-muted);
          text-transform: uppercase;
        }
        .chain-caption {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 10px;
          letter-spacing: 0.06em;
          fill: var(--chain-muted);
          text-transform: uppercase;
        }
        .chain-detail {
          border-top: 1px solid var(--chain-line);
          padding: 16px 20px 18px;
          min-height: 88px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .chain-detail-role {
          font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
          font-size: 17px;
          color: var(--chain-ink);
        }
        .chain-detail-role .chain-tag {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: 10px;
          color: var(--chain-accent);
          letter-spacing: 0.07em;
          text-transform: uppercase;
          margin-left: 10px;
          vertical-align: middle;
        }
        .chain-detail p {
          margin: 0;
          color: var(--chain-muted);
          font-size: 13.5px;
          line-height: 1.6;
          max-width: 78ch;
        }
        .chain-placeholder {
          color: var(--chain-muted);
          font-size: 13px;
          font-style: italic;
        }
        @media (prefers-reduced-motion: reduce) {
          .chain-particle-lane-a, .chain-particle-lane-b, .chain-particle-lane-c,
          .chain-particle-trunk, .chain-particle-gate, .chain-particle-capital { display: none; }
          .chain-ring, .chain-satellite-ring { animation: none; }
          .chain-svg { animation: none; }
        }
        @media (max-width: 720px) {
          .chain-legend { display: none; }
        }
      `}</style>

      <div className="chain-stage">
        <div className="chain-transport">
          <div className="chain-modes" role="group" aria-label="Diagram detail level">
            <button
              type="button"
              className="chain-modebtn"
              aria-pressed={mode === "simple"}
              onClick={() => setMode("simple")}
            >
              Simplified
            </button>
            <button
              type="button"
              className="chain-modebtn"
              aria-pressed={mode === "extended"}
              onClick={() => setMode("extended")}
            >
              Extended
            </button>
          </div>

          <div className="chain-sep" />

          <button
            type="button"
            className="chain-playbtn"
            aria-pressed={playing}
            aria-label={playing ? "Pause animation" : "Play animation"}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="3.5" height="12" rx="0.8" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="0.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.5 L13 8 L4 13.5 Z" />
              </svg>
            )}
          </button>

          <div className="chain-legend">
            {spec.legend.map((item) => (
              <span key={item.label}>
                <i className="chain-swatch" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <div className="chain-canvas-wrap">
          <svg
            ref={svgRef}
            key={mode}
            className="chain-svg"
            viewBox={spec.viewBox}
            style={{ minWidth: spec.minWidth }}
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={mode === "extended" ? "Extended subscription settlement pipeline diagram" : "Subscription settlement pipeline diagram"}
          >
            {spec.captions.map((c) => (
              <text key={c.text} x={c.x} y={c.y} textAnchor="middle" className="chain-caption">
                {c.text}
              </text>
            ))}

            {spec.sectionCaptions?.map((c) => (
              <text key={c.text} x={c.x} y={c.y} textAnchor="middle" className="chain-section-caption">
                {c.text}
              </text>
            ))}

            {spec.decorations?.map((d) => (
              <g key={d.id}>
                <path className="chain-satellite-line" d={`M ${d.from.x} ${d.from.y} L ${d.to.x} ${d.to.y}`} />
                <circle className="chain-satellite-ring" cx={d.to.x} cy={d.to.y} r={d.r} />
                <circle className="chain-satellite-dot" cx={d.to.x} cy={d.to.y} r={d.r} />
              </g>
            ))}

            {spec.edges.map((e) => (
              <path
                key={e.id}
                ref={(el) => {
                  if (el) pathRefs.current.set(e.id, el);
                }}
                d={e.d}
                className={`chain-edge${e.kind === "gate" ? " chain-edge-gate" : ""}`}
              />
            ))}

            <g ref={particleGroupRef} />

            {spec.nodes.map((n) => (
              <g
                key={n.role}
                className={`chain-node${n.terminal ? " chain-terminal" : ""}${selected === n.role ? " chain-active" : ""}`}
                tabIndex={0}
                transform={`translate(${n.x},${n.y})`}
                onClick={() => setSelected(n.role)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(n.role);
                  }
                }}
              >
                {n.terminal && <circle className="chain-ring" cx={0} cy={0} r={34} />}
                <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx={n.rx ?? 10} />
                <text className="chain-role-tag" x={0} y={-n.h / 2 + 21} textAnchor="middle">
                  {n.tag}
                </text>
                <text
                  className="chain-role-label"
                  x={0}
                  y={n.h / 2 - 18}
                  textAnchor="middle"
                  style={n.labelFontSize ? { fontSize: n.labelFontSize } : undefined}
                >
                  {n.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="chain-detail" aria-live="polite">
          {activeRole ? (
            <>
              <div className="chain-detail-role">
                {activeRole.label}
                <span className="chain-tag">{activeRole.tag}</span>
              </div>
              <p>{activeRole.text}</p>
            </>
          ) : (
            <p className="chain-placeholder">Click a party above to read what they actually do in the chain.</p>
          )}
        </div>
      </div>
    </div>
  );
}
