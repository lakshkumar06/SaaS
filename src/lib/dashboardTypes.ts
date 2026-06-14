export type PoolState = {
  company: `0x${string}`;
  totalAssets: bigint;
  cash: bigint;
  outstandingPrincipal: bigint;
  totalShares: bigint;
  navPerShare1e18: bigint;
  creditCap: bigint;
  interestRateBps: number;
  dueAt: bigint;
  defaulted: boolean;
  availableToBorrow: bigint;
  accruedInterest: bigint;
  defaultGracePeriod: bigint;
};

export type MemberPosition = {
  shares: bigint;
  redeemableAssets: bigint;
};

export type UnderwritePayload = {
  vendor: string;
  currentDepositedPrincipalUsdc: number;
  monthlyRecurringRevenueUsd: number;
  grossMarginBps: number;
  cashBalanceUsd: number;
  monthlyBurnUsd: number;
  delinquencyRateBps: number;
};

export type UnderwriteResult = {
  vendor: string;
  cap: string;
  expiry: string;
  interestRateBps: number;
  txHash: string;
  status: string;
  mode: string;
  inference: {
    riskScore: number;
    approvedMultiple: number;
    rationale: string;
  };
};
