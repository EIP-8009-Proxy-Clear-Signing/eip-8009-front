import { sepolia } from 'viem/chains';
import { proxyAbi } from './abis/proxy.abi';
import { universalRouterAbi } from './abis/universal-router.abi';
import { proxyApproveRouterAbi } from './abis/proxy-approve-router.abi';
import { proxyPermitRouterAbi } from './abis/proxy-permit-router.abi';
import { safeRouterAbi } from './abis/safe-router.abi';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0x800B36cc16C7572E1d600506a0d7d30890fF35f4',
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
    safeRouter: {
      address: '0xE5908249E7701CD8Ed1558676DF7ccA823c891D9',
      abi: safeRouterAbi,
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
