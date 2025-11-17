import { sepolia } from 'viem/chains';
import { proxyAbi } from './proxy.abi';
import { universalRouterAbi } from './universal-router.abi';
import { proxyApproveRouterAbi } from './proxy-approve-router';
import { proxyPermitRouterAbi } from './proxy-permit-router';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0x754D7F2A462E64ADE436a29d45312C5f54E8Af4D',
      abi: proxyAbi,
    },
    proxyApproveRouter: {
      address: '0xC7d6f2085A3aF5Fb9060fF9bb14D6676aA1d2450',
      abi: proxyApproveRouterAbi,
    },
    proxyPermitRouter: {
      address: '0xb7F27D6e9f14CA18BB62b32bE336347Cd7CBfE77',
      abi: proxyPermitRouterAbi,
    },
    uniswapRouter: {
      address: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b',
      abi: universalRouterAbi,
    },
  },
} as const;

type ContractNames = keyof (typeof contracts)[keyof typeof contracts];

export const getContract = (key: ContractNames, chainId: number) => {
  if (chainId !== sepolia.id) {
    throw new Error(`ChainId ${chainId} not supported`);
  }

  return {
    address: contracts[chainId][key].address as `0x${string}`,
    abi: contracts[chainId][key].abi,
  };
};
