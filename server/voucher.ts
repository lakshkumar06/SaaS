import { privateKeyToAccount } from "viem/accounts";

export async function signPersonhoodVoucher(params: {
  signerKey: `0x${string}`;
  chainId: number;
  verifyingContract: `0x${string}`;
  user: `0x${string}`;
  nullifierHash: `0x${string}`;
  deadline: bigint;
}): Promise<`0x${string}`> {
  const account = privateKeyToAccount(params.signerKey);

  return account.signTypedData({
    domain: {
      name: "StakeAndAdvance",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.verifyingContract,
    },
    types: {
      Personhood: [
        { name: "user", type: "address" },
        { name: "nullifierHash", type: "bytes32" },
        { name: "deadline", type: "uint64" },
      ],
    },
    primaryType: "Personhood",
    message: {
      user: params.user,
      nullifierHash: params.nullifierHash,
      deadline: params.deadline,
    },
  });
}
