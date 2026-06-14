import { useEffect, useState } from "react";
import {
  createPublicClient,
  formatUnits,
  http,
  parseUnits,
  type Address,
} from "viem";
import { DynamicConnectButton, useDynamicContext, type Wallet } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";

import {
  CompanyPanel,
  FooterSection,
  HeroSection,
  MemberPanel,
  MetaSection,
  StatsSection,
  UnderwritePanel,
} from "./components/DashboardSections";
import { stakeAndAdvanceAbi } from "./lib/abi";
import { ARC_TESTNET_USDC, STAKE_AND_ADVANCE_ADDRESS } from "./lib/addresses";
import { arcTestnet } from "./lib/arcChain";
import type { MemberPosition, PoolState, UnderwritePayload, UnderwriteResult } from "./lib/dashboardTypes";

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
  transport: http(arcTestnet.rpcUrls.default.http[0]),
});

const backendBase =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8788";

const defaultUnderwrite: UnderwritePayload = {
  vendor: "0x19E95b026731974B7c1feD9eb3c3113fBDD80464",
  currentDepositedPrincipalUsdc: 250,
  monthlyRecurringRevenueUsd: 5000,
  grossMarginBps: 8000,
  cashBalanceUsd: 50000,
  monthlyBurnUsd: 20000,
  delinquencyRateBps: 100,
};

function parseTokenInput(value: string) {
  return parseUnits(value || "0", 18);
}

function parseUnderwriteValue(key: keyof UnderwritePayload, value: string) {
  if (key === "vendor") return value;
  return value === "" ? 0 : Number(value);
}

async function readPoolState(address?: Address): Promise<{
  pool: PoolState;
  member: MemberPosition;
}> {
  const [
    poolState,
    availableToBorrow,
    accruedInterest,
    defaultGracePeriod,
    shares,
  ] = await Promise.all([
    publicClient.readContract({
      address: STAKE_AND_ADVANCE_ADDRESS,
      abi: stakeAndAdvanceAbi,
      functionName: "poolState",
    }),
    publicClient.readContract({
      address: STAKE_AND_ADVANCE_ADDRESS,
      abi: stakeAndAdvanceAbi,
      functionName: "availableToBorrow",
    }),
    publicClient.readContract({
      address: STAKE_AND_ADVANCE_ADDRESS,
      abi: stakeAndAdvanceAbi,
      functionName: "accruedInterest",
    }),
    publicClient.readContract({
      address: STAKE_AND_ADVANCE_ADDRESS,
      abi: [
        ...stakeAndAdvanceAbi,
        {
          type: "function",
          name: "defaultGracePeriod",
          stateMutability: "view",
          inputs: [],
          outputs: [{ name: "", type: "uint64" }],
        },
      ] as const,
      functionName: "defaultGracePeriod",
    }),
    address
      ? publicClient.readContract({
          address: STAKE_AND_ADVANCE_ADDRESS,
          abi: stakeAndAdvanceAbi,
          functionName: "sharesOf",
          args: [address],
        })
      : Promise.resolve(0n),
  ]);

  const redeemableAssets =
    shares > 0n
      ? await publicClient.readContract({
          address: STAKE_AND_ADVANCE_ADDRESS,
          abi: stakeAndAdvanceAbi,
          functionName: "previewRedeem",
          args: [shares],
        })
      : 0n;

  return {
    pool: {
      totalAssets: poolState[0],
      cash: poolState[1],
      outstandingPrincipal: poolState[2],
      totalShares: poolState[3],
      navPerShare1e18: poolState[4],
      creditCap: poolState[5],
      interestRateBps: Number(poolState[7]),
      dueAt: BigInt(poolState[8]),
      defaulted: poolState[9],
      availableToBorrow,
      accruedInterest,
      defaultGracePeriod: BigInt(defaultGracePeriod),
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

export default function App() {
  const { primaryWallet, sdkHasLoaded } = useDynamicContext();
  const wallet = primaryWallet?.address as Address | undefined;
  const walletConnected = Boolean(wallet);
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

  async function refresh(addr = wallet) {
    const data = await readPoolState(addr);
    setPool(data.pool);
    setMember(data.member);
  }

  useEffect(() => {
    refresh().then(
      () => setStatus("Pool state synced from Arc testnet."),
      (error: unknown) =>
        setStatus(error instanceof Error ? error.message : "Failed to load pool state."),
    );
  }, []);

  useEffect(() => {
    if (!sdkHasLoaded) return;
    refresh(wallet).catch(() => undefined);
  }, [sdkHasLoaded, wallet]);

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
        args: [STAKE_AND_ADVANCE_ADDRESS, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const depositHash = await walletClient.writeContract({
        address: STAKE_AND_ADVANCE_ADDRESS,
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
      const shares = parseTokenInput(redeemShares || formatUnits(member.shares, 18));

      const redeemHash = await walletClient.writeContract({
        address: STAKE_AND_ADVANCE_ADDRESS,
        abi: stakeAndAdvanceAbi,
        functionName: "redeem",
        account: address,
        args: [shares],
      });
      await publicClient.waitForTransactionReceipt({ hash: redeemHash });

      await refresh(address);
      setStatus(`Redeemed ${formatUnits(shares, 18)} shares.`);
    });
  }

  async function drawdown() {
    await withBusy("Drawing down", async () => {
      const { walletClient, address } = await walletClientAndAddress(primaryWallet);
      const hash = await walletClient.writeContract({
        address: STAKE_AND_ADVANCE_ADDRESS,
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
        args: [STAKE_AND_ADVANCE_ADDRESS, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const repayHash = await walletClient.writeContract({
        address: STAKE_AND_ADVANCE_ADDRESS,
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
        address: STAKE_AND_ADVANCE_ADDRESS,
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
    <main className="mx-auto max-w-[1280px] px-3.5 pt-7 pb-12 sm:px-5 sm:pt-12 sm:pb-[72px]">
      <HeroSection
        wallet={wallet}
        poolAddress={STAKE_AND_ADVANCE_ADDRESS}
        connectControl={
          <DynamicConnectButton buttonClassName="btn-primary">
            {wallet ? "Manage wallet" : "Connect wallet"}
          </DynamicConnectButton>
        }
      />

      <StatsSection pool={pool} />

      <MetaSection pool={pool} />

      <section className="mb-[18px] grid gap-[18px] lg:grid-cols-3">
        <MemberPanel
          pool={pool}
          member={member}
          depositAmount={depositAmount}
          redeemShares={redeemShares}
          busy={busy}
          walletConnected={walletConnected}
          onDepositAmountChange={setDepositAmount}
          onRedeemSharesChange={setRedeemShares}
          onDeposit={approveAndDeposit}
          onRedeem={redeem}
        />

        <CompanyPanel
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

        <UnderwritePanel
          backendBase={backendBase}
          form={underwriteForm}
          result={underwriteResult}
          busy={busy}
          onChange={(key, value) =>
            setUnderwriteForm((current) => ({
              ...current,
              [key]: parseUnderwriteValue(key, value),
            }))
          }
          onSubmit={runUnderwrite}
        />
      </section>

      <FooterSection
        busy={busy}
        status={status}
        onMarkDefaulted={markDefaulted}
        onRefresh={() => refreshWithStatus()}
      />
    </main>
  );
}
