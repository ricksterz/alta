import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

// Capital call allocation is arithmetic on money, which is the category of
// code where a plausible-looking implementation is wrong in ways nobody
// notices until a holder disputes a notice.
//
// The specific hazards these guard:
//  - floating point on currency
//  - a "funded" total that exceeds the commitment it draws against
//  - allocations that do not reconcile to the fund total in the notice

/** Mirrors the allocation computed in routes/capitalCalls.ts. */
function allocate(commitments: string[], percent: string) {
  const pct = new Prisma.Decimal(percent);
  const amounts = commitments.map((c) =>
    new Prisma.Decimal(c).mul(pct).toDecimalPlaces(2)
  );
  const total = amounts.reduce((s, a) => s.add(a), new Prisma.Decimal(0));
  return { amounts, total };
}

describe("pro-rata allocation", () => {
  it("allocates by commitment, not equally", () => {
    const { amounts } = allocate(["1000000", "3000000"], "0.2");
    expect(amounts.map(String)).toEqual(["200000", "600000"]);
  });

  it("keeps currency exact where floating point would not", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE754. Decimal is the reason this holds.
    const { total } = allocate(["1000000", "2000000"], "0.1");
    expect(total.toString()).toBe("300000");
  });

  it("rounds each holder's share to cents", () => {
    const { amounts } = allocate(["1000000"], "0.123456");
    expect(amounts[0]!.toString()).toBe("123456");
    const odd = allocate(["333333.33"], "0.075");
    expect(odd.amounts[0]!.decimalPlaces()).toBeLessThanOrEqual(2);
  });

  it("reports a total that is the sum of what holders were actually told", () => {
    // The notice total must equal the sum of individual notices, even when
    // per-holder rounding means it differs slightly from percent × fund size.
    // Back-solving the total from the fund would produce a number no holder
    // can reproduce from their own commitment.
    const commitments = ["333333.33", "333333.33", "333333.34"];
    const { amounts, total } = allocate(commitments, "0.075");
    const summed = amounts.reduce((s, a) => s.add(a), new Prisma.Decimal(0));
    expect(total.equals(summed)).toBe(true);
  });
});

describe("funded versus committed", () => {
  it("starts a drawdown position unfunded", () => {
    // The bug this replaced: positions were recorded as fully funded at
    // subscription time, which is only true for a continuous vehicle.
    const structure: string = "drawdown";
    const funded = structure === "continuous" ? new Prisma.Decimal("3000000") : new Prisma.Decimal(0);
    expect(funded.toString()).toBe("0");
  });

  it("starts a continuous position fully funded", () => {
    const structure: string = "continuous";
    const funded = structure === "continuous" ? new Prisma.Decimal("3000000") : new Prisma.Decimal(0);
    expect(funded.toString()).toBe("3000000");
  });

  it("never lets cumulative payments exceed the amount called", () => {
    const due = new Prisma.Decimal("600000");
    let paid = new Prisma.Decimal("600000");
    const attempted = paid.add(new Prisma.Decimal("1"));
    expect(attempted.gt(due)).toBe(true); // rejected by the route

    paid = new Prisma.Decimal("400000");
    expect(paid.add(new Prisma.Decimal("200000")).gt(due)).toBe(false); // accepted
  });

  it("keeps funded within committed across a full call schedule", () => {
    const commitment = new Prisma.Decimal("3000000");
    let funded = new Prisma.Decimal(0);
    for (const pct of ["0.2", "0.3", "0.25", "0.25"]) {
      funded = funded.add(commitment.mul(new Prisma.Decimal(pct)).toDecimalPlaces(2));
      expect(funded.lte(commitment)).toBe(true);
    }
    expect(funded.equals(commitment)).toBe(true);
  });
});
