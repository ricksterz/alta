import type { FundExclusion, InvestorType, QualifiedPurchaserBasis } from "@prisma/client";
import { checkEligibility } from "./eligibility.js";
import { holderCapacity } from "./holderRegister.js";

// Transfer compliance — the question "may this party receive this interest?"
//
// This is the same question a compliant security token asks before it moves.
// ERC-3643 (and ERC-1400 before it) put a compliance contract in the transfer
// path: the token calls out to ask whether a proposed recipient is permitted
// to hold, and reverts if not. That contract needs an authority to consult for
// facts it cannot know on-chain — is this person verified accredited, are they
// a qualified purchaser, would this breach a holder cap.
//
// Alta already computes exactly those facts for primary subscriptions. This
// module exposes them in the shape a transfer check needs, so the same rules
// govern an interest whether it is subscribed to directly or moved later.
// Writing it twice would guarantee the two eventually disagree, and a
// secondary market that applies weaker rules than the primary is precisely how
// an issuer loses its exclusion.
//
// Scope boundary, stated plainly: Alta answers compliance questions and keeps
// the register. It does not custody keys, sign transactions, or broadcast to
// any chain. `chain`/`contractAddress`/`tokenId` on Position are record-keeping
// — they say where an interest is represented, not that Alta put it there.

export interface TransferComplianceInput {
  transferee: {
    type: InvestorType;
    accreditationBasis: string | null;
    qualifiedPurchaserBasis: QualifiedPurchaserBasis | null;
  };
  fund: {
    id: string;
    name: string;
    exclusion: FundExclusion | null;
  };
  /** True when the transferee already holds a position in this fund. */
  transfereeIsExistingHolder: boolean;
}

export interface TransferComplianceResult {
  /** Mirrors an ERC-3643 compliance check: a single allow/deny. */
  allowed: boolean;
  /** Stable codes, suitable for surfacing on-chain or in an audit record. */
  reasons: { code: string; message: string }[];
  checkedAt: string;
}

export async function checkTransferCompliance(
  input: TransferComplianceInput,
  now: Date
): Promise<TransferComplianceResult> {
  const reasons: TransferComplianceResult["reasons"] = [];

  // 1. The transferee must independently satisfy the fund's investor
  //    eligibility bar. Receiving by transfer is not a way around it.
  const eligibility = checkEligibility({
    investor: input.transferee,
    fund: { exclusion: input.fund.exclusion, name: input.fund.name },
  });
  for (const blocker of eligibility.blockers) {
    reasons.push({ code: `transferee_${blocker.code}`, message: blocker.message });
  }

  // 2. A transfer to a NEW holder consumes holder-cap headroom; a transfer to
  //    an existing holder does not.
  if (!input.transfereeIsExistingHolder) {
    const capacity = await holderCapacity(input.fund.id);
    if (capacity.atCapacity) {
      reasons.push({
        code: "holder_cap_exceeded",
        message:
          `${input.fund.name} relies on the 3(c)(1) exclusion and is at its 100 ` +
          `beneficial-owner limit. Admitting another holder would breach it.`,
      });
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    checkedAt: now.toISOString(),
  };
}
