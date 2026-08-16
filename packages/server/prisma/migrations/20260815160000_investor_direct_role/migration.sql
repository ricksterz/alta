-- Adds the direct-investor path: an investor subscribing on their own
-- behalf, with no advisor firm in between.
ALTER TYPE "TenantType" ADD VALUE 'investor_direct';
ALTER TYPE "AdvisorRole" ADD VALUE 'investor_principal';
