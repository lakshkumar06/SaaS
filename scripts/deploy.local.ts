import { parseUnits } from "viem";
import { loadArtifact } from "../server/artifacts";
import { publicClientFor, walletClientFor } from "../server/chain";

const RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
const USDC = (n: number) => parseUnits(String(n), 6);

const KEY = {
  company: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
} as const;

const ADDR = {
  reporter: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  member: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
} as const;

async function main(): Promise<void> {
  const usdcArtifact = await loadArtifact("MockUSDC");
  const stakeArtifact = await loadArtifact("StakeAndAdvance");
  const publicClient = publicClientFor(CHAIN_ID, RPC);
  const company = walletClientFor(KEY.company, CHAIN_ID, RPC);

  let hash = await company.deployContract({
    abi: usdcArtifact.abi as never,
    bytecode: usdcArtifact.bytecode,
    args: [],
  });
  const usdc = (await publicClient.waitForTransactionReceipt({ hash })).contractAddress!;

  hash = await company.deployContract({
    abi: stakeArtifact.abi as never,
    bytecode: stakeArtifact.bytecode,
    args: [usdc, ADDR.company, ADDR.reporter, 600, 600, 0],
  });
  const contract = (await publicClient.waitForTransactionReceipt({ hash })).contractAddress!;

  const mintHash = await company.writeContract({
    address: usdc,
    abi: usdcArtifact.abi as never,
    functionName: "mint",
    args: [ADDR.member, USDC(1000)],
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });

  console.log(JSON.stringify({ usdc, contract }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
