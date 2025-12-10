import { sepolia } from 'viem/chains';
import { proxyAbi } from './abis/proxy.abi';
import { universalRouterAbi } from './abis/universal-router.abi';
import { proxyApproveRouterAbi } from './abis/proxy-approve-router.abi';
import { proxyPermitRouterAbi } from './abis/proxy-permit-router.abi';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0x730e3Eb045EB47EA11C7F435F012062090D57DD7',
      abi: proxyAbi,
    },
    proxyApproveRouter: {
      address: '0x2273229675D3307aE2eC47Fd0952A5Dc232829cf',
      abi: proxyApproveRouterAbi,
    },
    proxyPermitRouter: {
      address: '0x9F3E56820fae2d21390da09BB337cA0B96e3602f',
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
