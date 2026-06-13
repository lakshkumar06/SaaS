import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { arcTestnet } from "../app/lib/arcChain";
import { STAKE_AND_ADVANCE_ADDRESS } from "../app/lib/addresses";

const abi = parseAbi([
  "function autoRelease(uint256 stakeId)",
  "function stakes(uint256 stakeId) view returns (address user,address vendor,uint256 amount,uint256 collateral,uint256 creditAllocation,uint256 pendingObligation,uint8 state,uint64 createdAt,uint64 disputedAt)",
  "function disputeWindow() view returns (uint64)",
]);

async function main() {
  const privateKey = process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) throw new Error("KEEPER_PRIVATE_KEY is required");

  const stakeIds = (process.env.STAKE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => BigInt(value));
  if (stakeIds.length === 0) throw new Error("STAKE_IDS is required");

  const rpcUrl = process.env.ARC_RPC_URL ?? arcTestnet.rpcUrls.default.http[0];
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });
  const disputeWindow = await publicClient.readContract({
    address: STAKE_AND_ADVANCE_ADDRESS,
    abi,
    functionName: "disputeWindow",
  });

  for (const stakeId of stakeIds) {
    const stake = await publicClient.readContract({
      address: STAKE_AND_ADVANCE_ADDRESS,
      abi,
      functionName: "stakes",
      args: [stakeId],
    });

    const state = stake[6];
    const disputedAt = stake[8];
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (state !== 3 || now <= disputedAt + disputeWindow) {
      console.log(JSON.stringify({ stakeId: stakeId.toString(), skipped: true }));
      continue;
    }

    const hash = await walletClient.writeContract({
      address: STAKE_AND_ADVANCE_ADDRESS,
      abi,
      functionName: "autoRelease",
      args: [stakeId],
    });
    console.log(JSON.stringify({ stakeId: stakeId.toString(), hash }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
