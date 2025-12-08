import { sepolia } from 'viem/chains';
import { proxyAbi } from './abis/proxy.abi';
import { universalRouterAbi } from './abis/universal-router.abi';
import { proxyApproveRouterAbi } from './abis/proxy-approve-router.abi';
import { proxyPermitRouterAbi } from './abis/proxy-permit-router.abi';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0x1E54dC889eBD4e7F2fFd509090dd5F0Fb97F0f37',
      abi: proxyAbi,
    },
    proxyApproveRouter: {
      address: '0x1C43012b00c5feDefF172ff74C7A27E407120eDA',
      abi: proxyApproveRouterAbi,
    },
    proxyPermitRouter: {
      address: '0x7d89463918004b34FE0140819172DACac3422fDF',
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
