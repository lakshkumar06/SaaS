import { formatUnits, parseUnits } from "viem";

import { loadArtifact } from "../server/artifacts";
import { publicClientFor, walletClientFor } from "../server/chain";
import type { ServerConfig } from "../server/config";
import { startServer } from "../server/index";

const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
const USDC = (n: number | bigint) => parseUnits(String(n), 6);
const YEAR = 31_536_000;

const KEY = {
  company: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  alice: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  bob: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  reporter: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const;

const ADDR = {
  company: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  alice: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  bob: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  reporter: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
} as const;

let passed = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const got = typeof actual === "bigint" ? actual.toString() : String(actual);
  const want = typeof expected === "bigint" ? expected.toString() : String(expected);
  if (got !== want) throw new Error(`${label}: got ${got}, expected ${want}`);
  passed += 1;
  console.log(`  ok ${label}`);
}

function expect(label: string, condition: boolean, detail: string): void {
  if (!condition) throw new Error(`${label}: ${detail}`);
  passed += 1;
  console.log(`  ok ${label} (${detail})`);
}

async function rpc(method: string, params: unknown[]): Promise<void> {
  await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function main(): Promise<void> {
  const usdcArtifact = await loadArtifact("MockUSDC");
  const stakeArtifact = await loadArtifact("StakeAndAdvance");
  const usdcAbi = usdcArtifact.abi as never;
  const stakeAbi = stakeArtifact.abi as never;

  const publicClient = publicClientFor(CHAIN_ID, RPC);
  const company = walletClientFor(KEY.company, CHAIN_ID, RPC);
  const alice = walletClientFor(KEY.alice, CHAIN_ID, RPC);
  const bob = walletClientFor(KEY.bob, CHAIN_ID, RPC);

  console.log("deploy");
  let hash = await company.deployContract({ abi: usdcAbi, bytecode: usdcArtifact.bytecode, args: [] });
  const usdc = (await publicClient.waitForTransactionReceipt({ hash })).contractAddress!;
  hash = await company.deployContract({
    abi: stakeAbi,
    bytecode: stakeArtifact.bytecode,
    args: [usdc, ADDR.company, ADDR.reporter, 600, 600, 0],
  });
  const contract = (await publicClient.waitForTransactionReceipt({ hash })).contractAddress!;

  const write = (wallet: typeof company, functionName: string, args: unknown[]) =>
    wallet.writeContract({ address: contract, abi: stakeAbi, functionName, args }).then((txHash) =>
      publicClient.waitForTransactionReceipt({ hash: txHash }),
    );
  const read = (functionName: string, args: unknown[] = []) =>
    publicClient.readContract({ address: contract, abi: stakeAbi, functionName, args });
  const usdcBalance = (who: `0x${string}`) =>
    publicClient.readContract({ address: usdc, abi: usdcAbi, functionName: "balanceOf", args: [who] });
  const mint = async (to: `0x${string}`, amount: number) => {
    const tx = await company.writeContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "mint",
      args: [to, USDC(amount)],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
  };
  const approve = async (wallet: typeof company) => {
    const tx = await wallet.writeContract({
      address: usdc,
      abi: usdcAbi,
      functionName: "approve",
      args: [contract, USDC(1_000_000)],
    });
    await publicClient.waitForTransactionReceipt({ hash: tx });
  };

  await mint(ADDR.alice, 300);
  await mint(ADDR.bob, 300);
  await mint(ADDR.company, 1000);
  await approve(alice);
  await approve(bob);
  await approve(company);

  const serverConfig: ServerConfig = {
    port: 0,
    rpcUrl: RPC,
    chainId: CHAIN_ID,
    contract: contract as `0x${string}`,
    reporterKey: KEY.reporter,
    confidentialAiEndpoint: undefined,
    confidentialAiApiKey: undefined,
  };
  const server = await startServer(serverConfig);
  const api = async (path: string, body?: unknown) => {
    const response = await fetch(`${server.url}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`${path} failed: ${JSON.stringify(json)}`);
    return json;
  };

  try {
    const health = await api("/health");
    check("health", health.ok, true);

    const financials = {
      vendor: ADDR.company,
      currentDepositedPrincipalUsdc: 250,
      monthlyRecurringRevenueUsd: 5000,
      grossMarginBps: 8000,
      cashBalanceUsd: 50000,
      monthlyBurnUsd: 20000,
      delinquencyRateBps: 100,
    };
    const underwriting = await api("/cre/underwrite", financials);
    check("cap written", await read("creditCap"), BigInt(underwriting.cap));
    check("rate written", await read("interestRateBps"), underwriting.interestRateBps);

    await write(alice, "deposit", [USDC(300)]);
    await write(bob, "deposit", [USDC(300)]);
    check("total assets after deposits", await read("totalAssets"), USDC(600));

    const state = await api("/pool/state");
    check("pool state assets", state.totalAssets, USDC(600).toString());

    await write(company, "drawdown", [USDC(300)]);
    check("principal drawn", await read("outstandingPrincipal"), USDC(300));

    await rpc("evm_increaseTime", [YEAR]);
    await rpc("evm_mine", []);
    const interest = (await read("accruedInterest")) as bigint;
    expect("interest accrued", interest > 0n, `${formatUnits(interest, 6)} USDC`);
    const principal = (await read("outstandingPrincipal")) as bigint;
    await write(company, "repay", [principal + interest]);

    const navAfterProfit = (await read("navPerShare1e18")) as bigint;
    expect("nav rose", navAfterProfit > 10n ** 18n, formatUnits(navAfterProfit, 18));

    const aliceShares = (await read("sharesOf", [ADDR.alice])) as bigint;
    await write(alice, "redeem", [aliceShares]);
    const aliceOut = (await usdcBalance(ADDR.alice)) as bigint;
    expect("alice profits", aliceOut > USDC(300), formatUnits(aliceOut, 6));

    await api("/cre/underwrite", financials);
    await write(company, "drawdown", [USDC(300)]);
    await rpc("evm_increaseTime", [1201]);
    await rpc("evm_mine", []);
    await write(alice, "markDefaulted", []);
    check("default amount", await read("totalDefaultedAmount"), USDC(300));

    const bobShares = (await read("sharesOf", [ADDR.bob])) as bigint;
    await write(bob, "redeem", [bobShares]);
    const bobOut = (await usdcBalance(ADDR.bob)) as bigint;
    expect("bob takes loss", bobOut < USDC(300), formatUnits(bobOut, 6));

    console.log(`PASS ${passed} assertions`);
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
