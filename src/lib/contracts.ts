import { sepolia } from "viem/chains";

const proxyAbi = [
  {
    inputs: [
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes", name: "data", type: "bytes" },
    ],
    name: "CallFailed",
    type: "error",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "uint256", name: "balance", type: "uint256" },
      { internalType: "uint256", name: "actual", type: "uint256" },
    ],
    name: "InsufficientBalance",
    type: "error",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "postBalances",
        type: "tuple[]",
      },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "preBalances",
        type: "tuple[]",
      },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "approvals",
        type: "tuple[]",
      },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes", name: "data", type: "bytes" },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "withdrawals",
        type: "tuple[]",
      },
    ],
    name: "proxyCall",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "postBalances",
        type: "tuple[]",
      },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "preBalances",
        type: "tuple[]",
      },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "approvals",
        type: "tuple[]",
      },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes", name: "data", type: "bytes" },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "address", name: "token", type: "address" },
          { internalType: "uint256", name: "balance", type: "uint256" },
        ],
        internalType: "struct IBalanceProxy.Balance[]",
        name: "withdrawals",
        type: "tuple[]",
      },
    ],
    name: "proxyCallCalldata",
    outputs: [{ internalType: "bytes", name: "", type: "bytes" }],
    stateMutability: "payable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
] as const;

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: "0x8D95aCA53C6c41dD19032cD7C5559B68d4801C9E" as const,
      abi: proxyAbi,
    },
  },
};

export const getProxyContract = (chainId: number | undefined) => {
  if (chainId !== sepolia.id)
    throw new Error(`ChainId ${chainId} not supported`);

  return {
    address: contracts[chainId].proxy.address,
    abi: contracts[chainId].proxy.abi,
  };
};
