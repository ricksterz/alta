import { prisma } from "../db/client.js";

// The holder register: who holds what in a given fund, counted across ALL
// advisor firms rather than one tenant's slice.
//
// This is deliberately an unscoped read, and the reason is the point of the
// module. A 3(c)(1) fund is capped at 100 beneficial owners; that count spans
// every advisor firm that has ever subscribed a client. A tenant-scoped query
// can only ever see its own holders, which is why Alta previously surfaced the
// cap as an unverifiable warning ("confirm with the fund sponsor").
//
// Counting across tenants is safe here because nothing tenant-identifying
// leaves this module: callers get integers and a boolean, never the identity
// of another firm's investors. That distinction — aggregate yes, detail no —
// is what makes a shared register compatible with tenant isolation, and it is
// the same shape a transfer-agent function takes in the real world.

/** Statutory beneficial-owner cap for a fund relying on the 3(c)(1) exclusion. */
export const SECTION_3C1_HOLDER_CAP = 100;

export interface HolderCapacity {
  /** Distinct investors currently holding a position in this fund. */
  currentHolders: number;
  /** Null when the fund's exclusion imposes no cap (3(c)(7), or unrecorded). */
  cap: number | null;
  remaining: number | null;
  atCapacity: boolean;
}

export async function holderCapacity(fundId: string): Promise<HolderCapacity> {
  const fund = await prisma.fund.findUnique({
    where: { id: fundId },
    select: { exclusion: true },
  });

  const grouped = await prisma.position.groupBy({
    by: ["investorId"],
    where: { fundId, status: { in: ["active", "partially_transferred"] } },
  });
  const currentHolders = grouped.length;

  // Only 3(c)(1) carries a holder cap. 3(c)(7) has none (Exchange Act §12(g)
  // registration thresholds are a separate matter and out of scope here).
  const cap = fund?.exclusion === "section_3c1" ? SECTION_3C1_HOLDER_CAP : null;

  return {
    currentHolders,
    cap,
    remaining: cap === null ? null : Math.max(0, cap - currentHolders),
    atCapacity: cap !== null && currentHolders >= cap,
  };
}

/**
 * Whether adding ONE new distinct holder would breach the cap. Returns false
 * for an investor who already holds a position — increasing an existing
 * holder's stake does not add a beneficial owner.
 */
export async function wouldExceedHolderCap(
  fundId: string,
  investorId: string
): Promise<boolean> {
  const capacity = await holderCapacity(fundId);
  if (capacity.cap === null) return false;

  const existing = await prisma.position.findFirst({
    where: { fundId, investorId, status: { in: ["active", "partially_transferred"] } },
    select: { id: true },
  });
  if (existing) return false;

  return capacity.currentHolders >= capacity.cap;
}
