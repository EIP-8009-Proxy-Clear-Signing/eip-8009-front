import { sepolia } from 'viem/chains';
import { proxyAbi } from './abis/proxy.abi';
import { universalRouterAbi } from './abis/universal-router.abi';
import { proxyApproveRouterAbi } from './abis/proxy-approve-router.abi';
import { proxyPermitRouterAbi } from './abis/proxy-permit-router.abi';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0xa1A77109EaAFDEf3b2Eb36493A98868D4bD82FEf',
      abi: proxyAbi,
    },
    proxyApproveRouter: {
      address: '0xf3c82E2176D894ED32C5748C22238ebfcc68CDd8',
      abi: proxyApproveRouterAbi,
    },
    proxyPermitRouter: {
      address: '0xfEa607c2f74D7ac4ac35360e51f3fe08E319ebA2',
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
