import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createPublicClient,
  formatUnits,
  http,
  parseUnits,
  type Address,
} from "viem";
import {
  DynamicConnectButton,
  useDynamicContext,
  type Wallet,
} from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";

import {
  AlertsSection,
  HeroSection,
  MemberPanel,
  OperatorPanel,
  VendorPanel,
  type DashboardView,
} from "./components/DashboardSections";
import { stakeAndAdvanceAbi } from "./lib/abi";
import { ARC_TESTNET_USDC } from "./lib/addresses";
import { arcTestnet } from "./lib/arcChain";
import type {
  MemberPosition,
  PoolState,
  UnderwritePayload,
  UnderwriteResult,
} from "./lib/dashboardTypes";
import {
  backendBase,
  frontendWarnings,
  stakeAndAdvanceAddress,
} from "./lib/env";
import { useDashboardView } from "./lib/dashboardView";
import { USDC_DECIMALS } from "./lib/format";
import { buildValueHistoryFromActivity } from "./lib/valueHistory";
import { deserializePoolActivity, fetchPoolActivity, type PoolActivity, type PoolActivityDto } from "./lib/poolActivity";

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(arcTestnet.rpcUrls.default.http[0], {
    retryCount: 2,
    retryDelay: 1_500,
    timeout: 30_000,
  }),
});

type BackendPoolState = {
  company: Address;
  totalAssets: string;
  cash: string;
  outstandingPrincipal: string;
  totalShares: string;
  navPerShare1e18: string;
  creditCap: string;
  capExpiry: string;
  interestRateBps: number;
  dueAt: string;
  defaulted: boolean;
  availableToBorrow: string;
  accruedInterest: string;
  defaultGracePeriod: string;
};

const defaultUnderwrite: UnderwritePayload = {
  vendor: "0x19E95b026731974B7c1feD9eb3c3113fBDD80464",
  currentDepositedPrincipalUsdc: 250,
  monthlyRecurringRevenueUsd: 5000,
  grossMarginBps: 8000,
  cashBalanceUsd: 50000,
  monthlyBurnUsd: 20000,
  delinquencyRateBps: 100,
};

type AppContentProps = {
  connectControl: ReactNode;
  currentView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  primaryWallet?: Wallet | null;
  wallet?: Address;
  walletConnected: boolean;
};

function parseTokenInput(value: string) {
  return parseUnits(value || "0", USDC_DECIMALS);
}

function parseUnderwriteValue(key: keyof UnderwritePayload, value: string) {
  if (key === "vendor") return value;
  return value === "" ? 0 : Number(value);
}

async function readPoolState(address?: Address): Promise<{
  pool: PoolState;
  member: MemberPosition;
}> {
  const res = await fetch(`${backendBase}/pool/state`);
  if (!res.ok) {
    throw new Error(`Pool state request failed (${res.status}). Is the backend running?`);
  }

  const data = (await res.json()) as BackendPoolState;

  let shares = 0n;
  let redeemableAssets = 0n;

  if (address) {
    shares = await publicClient.readContract({
      address: stakeAndAdvanceAddress,
      abi: stakeAndAdvanceAbi,
      functionName: "sharesOf",
      args: [address],
    });

    if (shares > 0n) {
      redeemableAssets = await publicClient.readContract({
        address: stakeAndAdvanceAddress,
        abi: stakeAndAdvanceAbi,
        functionName: "previewRedeem",
        args: [shares],
      });
    }
  }

  return {
    pool: {
      company: data.company,
      totalAssets: BigInt(data.totalAssets),
      cash: BigInt(data.cash),
      outstandingPrincipal: BigInt(data.outstandingPrincipal),
      totalShares: BigInt(data.totalShares),
      navPerShare1e18: BigInt(data.navPerShare1e18),
      creditCap: BigInt(data.creditCap),
      interestRateBps: data.interestRateBps,
      dueAt: BigInt(data.dueAt),
      defaulted: data.defaulted,
      availableToBorrow: BigInt(data.availableToBorrow),
      accruedInterest: BigInt(data.accruedInterest),
      defaultGracePeriod: BigInt(data.defaultGracePeriod),
    },
    member: {
      shares,
      redeemableAssets,
    },
  };
}

async function walletClientAndAddress(primaryWallet: Wallet | null | undefined) {
  if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
    throw new Error("Connect an EVM wallet with Dynamic first.");
  }

  await primaryWallet.switchNetwork(arcTestnet.id);
  const walletClient = await primaryWallet.getWalletClient(String(arcTestnet.id));

  return {
    address: primaryWallet.address as Address,
    walletClient,
  };
}

function AppContent({
  connectControl,
  currentView,
  onViewChange,
  primaryWallet,
  wallet,
  walletConnected,
}: AppContentProps) {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [member, setMember] = useState<MemberPosition>({ shares: 0n, redeemableAssets: 0n });
  const [depositAmount, setDepositAmount] = useState("100");
  const [repayAmount, setRepayAmount] = useState("25");
  const [drawAmount, setDrawAmount] = useState("50");
  const [redeemShares, setRedeemShares] = useState("");
  const [underwriteForm, setUnderwriteForm] = useState(defaultUnderwrite);
  const [underwriteResult, setUnderwriteResult] = useState<UnderwriteResult | null>(null);
  const [status, setStatus] = useState("Loading pool state...");
  const [busy, setBusy] = useState<string | null>(null);
  const [valueHistory, setValueHistory] = useState<number[]>([]);
  const [poolActivity, setPoolActivity] = useState<PoolActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  function updateValueHistory(
    activity: PoolActivity[],
    poolState: PoolState,
    memberState: MemberPosition,
    addr?: Address,
  ) {
    const headlineValue =
      memberState.shares > 0n ? memberState.redeemableAssets : poolState.totalAssets;
    const currentValue = Number(formatUnits(headlineValue || 0n, USDC_DECIMALS));
    setValueHistory(
      buildValueHistoryFromActivity(activity, currentValue, {
        actor: addr,
        memberOnly: memberState.shares > 0n,
      }),
    );
  }

  async function readPoolActivity(): Promise<PoolActivity[]> {
    try {
      const res = await fetch(`${backendBase}/pool/activity`);
      if (res.ok) {
        const data = (await res.json()) as { activities: PoolActivityDto[] };
        return data.activities.map(deserializePoolActivity);
      }
    } catch {
      // fall back to direct RPC below
    }

    return fetchPoolActivity(publicClient, stakeAndAdvanceAddress);
  }

  async function refresh(addr = wallet) {
    if (refreshInFlight.current) {
      await refreshInFlight.current;
      return;
    }

    const request = Promise.all([
      readPoolState(addr),
      readPoolActivity().catch(() => [] as PoolActivity[]),
    ])
      .then(([data, activity]) => {
        setPool(data.pool);
        setMember(data.member);
        setPoolActivity(activity);
        setUnderwriteForm((current) => ({ ...current, vendor: data.pool.company }));
        updateValueHistory(activity, data.pool, data.member, addr);
      })
      .finally(() => {
        refreshInFlight.current = null;
        setActivityLoading(false);
      });

    setActivityLoading(true);

    refreshInFlight.current = request;
    await request;
  }

  useEffect(() => {
    let cancelled = false;

    refresh(wallet)
      .then(() => {
        if (!cancelled) setStatus("Pool state synced from Arc testnet.");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Failed to load pool state.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [wallet]);

  async function withBusy(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function refreshWithStatus(message = "Pool state refreshed.") {
    try {
      await refresh(wallet);
      setStatus(message);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to refresh pool state.");
    }
  }

  async function approveAndDeposit() {
    await withBusy("Approving and depositing", async () => {
      const { walletClient, address } = await walletClientAndAddress(primaryWallet);
      const amount = parseTokenInput(depositAmount);

      const approveHash = await walletClient.writeContract({
        address: ARC_TESTNET_USDC,
        abi: erc20Abi,
        functionName: "approve",
        account: address,
        args: [stakeAndAdvanceAddress, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const depositHash = await walletClient.writeContract({
        address: stakeAndAdvanceAddress,
        abi: stakeAndAdvanceAbi,
        functionName: "deposit",
        account: address,
        args: [amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      await refresh(address);
      setStatus(`Deposited ${depositAmount} USDC.`);
    });
  }

  async function redeem() {
    await withBusy("Redeeming shares", async () => {
      const { walletClient, address } = await walletClientAndAddress(primaryWallet);
      const shares = parseTokenInput(redeemShares || formatUnits(member.shares, USDC_DECIMALS));

      const redeemHash = await walletClient.writeContract({
        address: stakeAndAdvanceAddress,
        abi: stakeAndAdvanceAbi,
        functionName: "redeem",
        account: address,
        args: [shares],
      });
      await publicClient.waitForTransactionReceipt({ hash: redeemHash });

      await refresh(address);
      setStatus(`Redeemed ${formatUnits(shares, USDC_DECIMALS)} shares.`);
    });
  }

  async function drawdown() {
    await withBusy("Drawing down", async () => {
      const { walletClient, address } = await walletClientAndAddress(primaryWallet);
      const hash = await walletClient.writeContract({
        address: stakeAndAdvanceAddress,
        abi: stakeAndAdvanceAbi,
        functionName: "drawdown",
        account: address,
        args: [parseTokenInput(drawAmount)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh(address);
      setStatus(`Borrowed ${drawAmount} USDC.`);
    });
  }

  async function repay() {
    await withBusy("Repaying", async () => {
      const { walletClient, address } = await walletClientAndAddress(primaryWallet);
      const amount = parseTokenInput(repayAmount);

      const approveHash = await walletClient.writeContract({
        address: ARC_TESTNET_USDC,
        abi: erc20Abi,
        functionName: "approve",
        account: address,
        args: [stakeAndAdvanceAddress, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const repayHash = await walletClient.writeContract({
        address: stakeAndAdvanceAddress,
        abi: stakeAndAdvanceAbi,
        functionName: "repay",
        account: address,
        args: [amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: repayHash });

      await refresh(address);
      setStatus(`Repaid ${repayAmount} USDC.`);
    });
  }

  async function markDefaulted() {
    await withBusy("Marking default", async () => {
      const { walletClient, address } = await walletClientAndAddress(primaryWallet);
      const hash = await walletClient.writeContract({
        address: stakeAndAdvanceAddress,
        abi: stakeAndAdvanceAbi,
        functionName: "markDefaulted",
        account: address,
        args: [],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh(address);
      setStatus("Default marked onchain.");
    });
  }

  async function runUnderwrite() {
    await withBusy("Running underwriting", async () => {
      const res = await fetch(`${backendBase}/cre/underwrite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(underwriteForm),
      });
      const payload = await res.json().catch(() => null);
      const data = payload as UnderwriteResult | { error: string } | null;
      if (!res.ok || (data !== null && "error" in data) || data === null) {
        throw new Error(data && "error" in data ? data.error : "Underwrite request failed.");
      }
      setUnderwriteResult(data);
      await refresh(wallet);
      setStatus(`Underwriting posted onchain in ${data.mode} mode.`);
    });
  }

  return (
    <main className="dashboard-shell">
      <HeroSection
        wallet={wallet}
        currentView={currentView}
        onViewChange={onViewChange}
        connectControl={connectControl}
      />

      <AlertsSection warnings={frontendWarnings} />

      {currentView === "member" ? (
        <MemberPanel
          pool={pool}
          member={member}
          valueHistory={valueHistory}
          poolActivity={poolActivity}
          activityLoading={activityLoading}
          depositAmount={depositAmount}
          redeemShares={redeemShares}
          busy={busy}
          walletConnected={walletConnected}
          onDepositAmountChange={setDepositAmount}
          onRedeemSharesChange={setRedeemShares}
          onDeposit={approveAndDeposit}
          onRedeem={redeem}
        />
      ) : null}

      {currentView === "vendor" ? (
        <VendorPanel
          pool={pool}
          drawAmount={drawAmount}
          repayAmount={repayAmount}
          busy={busy}
          walletConnected={walletConnected}
          onDrawAmountChange={setDrawAmount}
          onRepayAmountChange={setRepayAmount}
          onDrawdown={drawdown}
          onRepay={repay}
        />
      ) : null}

      {currentView === "operator" ? (
        <OperatorPanel
          pool={pool}
          backendBase={backendBase}
          form={underwriteForm}
          result={underwriteResult}
          busy={busy}
          walletConnected={walletConnected}
          onChange={(key, value) =>
            setUnderwriteForm((current) => ({
              ...current,
              [key]: parseUnderwriteValue(key, value),
            }))
          }
          onSubmit={runUnderwrite}
          onMarkDefaulted={markDefaulted}
          onRefresh={() => refreshWithStatus()}
        />
      ) : null}
    </main>
  );
}

export function DynamicDashboardApp() {
  const { primaryWallet } = useDynamicContext();
  const wallet = primaryWallet?.address as Address | undefined;
  const [currentView, setCurrentView] = useDashboardView();

  return (
    <AppContent
      currentView={currentView}
      onViewChange={setCurrentView}
      connectControl={
        <DynamicConnectButton buttonClassName="btn-primary">
          {wallet ? "Manage wallet" : "Connect wallet"}
        </DynamicConnectButton>
      }
      primaryWallet={primaryWallet}
      wallet={wallet}
      walletConnected={Boolean(wallet)}
    />
  );
}

export function ReadonlyDashboardApp() {
  const [currentView, setCurrentView] = useDashboardView();

  return (
    <AppContent
      currentView={currentView}
      onViewChange={setCurrentView}
      connectControl={
        <button className="btn-primary" disabled>
          Wallet unavailable
        </button>
      }
      walletConnected={false}
    />
  );
}
