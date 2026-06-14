import {
  type Address,
  type Log,
  type PublicClient,
  decodeEventLog,
  formatUnits,
} from "viem";

import { USDC_DECIMALS } from "./format";

export type PoolActivityKind =
  | "borrow"
  | "repay"
  | "deposit"
  | "redeem"
  | "default"
  | "credit_update"
  | "cycle_closed"
  | "interest_accrued";

export type PoolActivity = {
  id: string;
  kind: PoolActivityKind;
  label: string;
  detail: string;
  amount?: bigint;
  actor?: Address;
  timestamp: number;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

const ACTIVITY_EVENTS_ABI = [
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "member", type: "address", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Redeemed",
    inputs: [
      { name: "member", type: "address", indexed: true },
      { name: "shares", type: "uint256", indexed: false },
      { name: "assets", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DrawnDown",
    inputs: [
      { name: "company", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "outstandingPrincipal", type: "uint256", indexed: false },
      { name: "dueAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Repaid",
    inputs: [
      { name: "company", type: "address", indexed: true },
      { name: "principalPaid", type: "uint256", indexed: false },
      { name: "interestPaid", type: "uint256", indexed: false },
      { name: "outstandingPrincipal", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RepaymentCycleClosed",
    inputs: [
      { name: "company", type: "address", indexed: true },
      { name: "onTime", type: "bool", indexed: false },
      { name: "dueAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InterestAccrued",
    inputs: [
      { name: "added", type: "uint256", indexed: false },
      { name: "interestDue", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Defaulted",
    inputs: [
      { name: "company", type: "address", indexed: true },
      { name: "principalWrittenOff", type: "uint256", indexed: false },
      { name: "at", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreditTermsUpdated",
    inputs: [
      { name: "company", type: "address", indexed: true },
      { name: "cap", type: "uint256", indexed: false },
      { name: "expiry", type: "uint64", indexed: false },
      { name: "interestRateBps", type: "uint16", indexed: false },
    ],
  },
] as const;

const MAX_LOG_RANGE = 9_999n;
const LOOKBACK_BLOCKS = 200_000n;

async function getContractLogsInChunks(
  client: PublicClient,
  contractAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs: Log<bigint, number, false>[] = [];
  let start = fromBlock;

  while (start <= toBlock) {
    const end = start + MAX_LOG_RANGE > toBlock ? toBlock : start + MAX_LOG_RANGE;
    const batch = await client.getLogs({
      address: contractAddress,
      fromBlock: start,
      toBlock: end,
    });
    logs.push(...batch);
    start = end + 1n;
  }

  return logs;
}

function fmtTokenAmount(value: bigint) {
  const [whole, fraction = ""] = formatUnits(value, USDC_DECIMALS).split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction} USDC` : `${whole} USDC`;
}

function mapDecodedLog(
  decoded: ReturnType<typeof decodeEventLog>,
  log: Log<bigint, number, false>,
): PoolActivity | null {
  const base = {
    id: `${log.transactionHash}-${log.logIndex ?? 0}`,
    blockNumber: log.blockNumber ?? 0n,
    transactionHash: log.transactionHash!,
    timestamp: 0,
  };

  switch (decoded.eventName) {
    case "DrawnDown": {
      const { company, amount, outstandingPrincipal } = decoded.args;
      return {
        ...base,
        kind: "borrow",
        label: "Borrow",
        detail: `Outstanding ${fmtTokenAmount(outstandingPrincipal)}`,
        amount,
        actor: company,
      };
    }
    case "Repaid": {
      const { company, principalPaid, interestPaid, outstandingPrincipal } = decoded.args;
      return {
        ...base,
        kind: "repay",
        label: "Repayment",
        detail: `${fmtTokenAmount(principalPaid)} principal, ${fmtTokenAmount(interestPaid)} interest · ${fmtTokenAmount(outstandingPrincipal)} left`,
        amount: principalPaid + interestPaid,
        actor: company,
      };
    }
    case "Deposited": {
      const { member, assets } = decoded.args;
      return {
        ...base,
        kind: "deposit",
        label: "Deposit",
        detail: `Minted pool shares`,
        amount: assets,
        actor: member,
      };
    }
    case "Redeemed": {
      const { member, assets } = decoded.args;
      return {
        ...base,
        kind: "redeem",
        label: "Redeem",
        detail: `Burned shares for cash`,
        amount: assets,
        actor: member,
      };
    }
    case "Defaulted": {
      const { company, principalWrittenOff } = decoded.args;
      return {
        ...base,
        kind: "default",
        label: "Default",
        detail: `${fmtTokenAmount(principalWrittenOff)} written off`,
        amount: principalWrittenOff,
        actor: company,
      };
    }
    case "CreditTermsUpdated": {
      const { company, cap, interestRateBps } = decoded.args;
      return {
        ...base,
        kind: "credit_update",
        label: "Credit update",
        detail: `Cap ${fmtTokenAmount(cap)} at ${(Number(interestRateBps) / 100).toFixed(2)}% APR`,
        amount: cap,
        actor: company,
      };
    }
    case "RepaymentCycleClosed": {
      const { company, onTime } = decoded.args;
      return {
        ...base,
        kind: "cycle_closed",
        label: onTime ? "On-time cycle" : "Late cycle",
        detail: onTime ? "Repayment closed on schedule" : "Repayment closed after due date",
        actor: company,
      };
    }
    case "InterestAccrued": {
      const { added, interestDue } = decoded.args;
      return {
        ...base,
        kind: "interest_accrued",
        label: "Interest accrued",
        detail: `${fmtTokenAmount(added)} added · ${fmtTokenAmount(interestDue)} due`,
        amount: added,
      };
    }
    default:
      return null;
  }
}

export async function fetchPoolActivity(
  client: PublicClient,
  contractAddress: Address,
  limit = 24,
): Promise<PoolActivity[]> {
  const latest = await client.getBlockNumber();
  const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
  const logs = await getContractLogsInChunks(client, contractAddress, fromBlock, latest);

  const activities: PoolActivity[] = [];

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: ACTIVITY_EVENTS_ABI,
        data: log.data,
        topics: log.topics,
      });
      const activity = mapDecodedLog(decoded, log);
      if (activity) activities.push(activity);
    } catch {
      // ignore unrelated logs
    }
  }

  activities.sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber > right.blockNumber ? -1 : 1;
    }
    return left.id > right.id ? -1 : 1;
  });

  const blockNumbers = [...new Set(activities.map((item) => item.blockNumber))];
  const blockTimestamps = new Map<bigint, number>();

  await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      const block = await client.getBlock({ blockNumber });
      blockTimestamps.set(blockNumber, Number(block.timestamp) * 1000);
    }),
  );

  return activities.slice(0, limit).map((activity) => ({
    ...activity,
    timestamp: blockTimestamps.get(activity.blockNumber) ?? 0,
  }));
}

export type PoolActivityDto = {
  id: string;
  kind: PoolActivityKind;
  label: string;
  detail: string;
  amount?: string;
  actor?: Address;
  timestamp: number;
  blockNumber: string;
  transactionHash: `0x${string}`;
};

export function serializePoolActivity(activity: PoolActivity): PoolActivityDto {
  return {
    id: activity.id,
    kind: activity.kind,
    label: activity.label,
    detail: activity.detail,
    amount: activity.amount?.toString(),
    actor: activity.actor,
    timestamp: activity.timestamp,
    blockNumber: activity.blockNumber.toString(),
    transactionHash: activity.transactionHash,
  };
}

export function deserializePoolActivity(dto: PoolActivityDto): PoolActivity {
  return {
    id: dto.id,
    kind: dto.kind,
    label: dto.label,
    detail: dto.detail,
    amount: dto.amount ? BigInt(dto.amount) : undefined,
    actor: dto.actor,
    timestamp: dto.timestamp,
    blockNumber: BigInt(dto.blockNumber),
    transactionHash: dto.transactionHash,
  };
}
