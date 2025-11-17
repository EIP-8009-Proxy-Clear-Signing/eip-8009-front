import { sepolia } from 'viem/chains';
import { proxyAbi } from './proxy.abi';
import { universalRouterAbi } from './universal-router.abi';
import { proxyApproveRouterAbi } from './proxy-approve-router';
import { proxyPermitRouterAbi } from './proxy-permit-router';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0x02F9b9381C6dfaE6e2CE609110C0527A6B6d1159',
      abi: proxyAbi,
    },
    proxyApproveRouter: {
      address: '0x63e33dE3aAe1EC74638cced9D74b32C69acCFADA',
      abi: proxyApproveRouterAbi,
    },
    proxyPermitRouter: {
      address: '0xFcC9Ab4f090bbddbf9D3447B2A3e8F2c30B9F269',
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
