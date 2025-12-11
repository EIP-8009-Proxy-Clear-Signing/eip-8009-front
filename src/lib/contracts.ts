import { sepolia } from 'viem/chains';
import { proxyAbi } from './abis/proxy.abi';
import { universalRouterAbi } from './abis/universal-router.abi';
import { proxyApproveRouterAbi } from './abis/proxy-approve-router.abi';
import { proxyPermitRouterAbi } from './abis/proxy-permit-router.abi';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0xa0cB43625E0b5f977a94a7492F407F61F8F44F6b',
      abi: proxyAbi,
    },
    proxyApproveRouter: {
      address: '0x2a6647e2c2acBE2D5791cC21F708321D05845D7c',
      abi: proxyApproveRouterAbi,
    },
    proxyPermitRouter: {
      address: '0x9D168418CcEA8A72C1C33490bEd209E8aFDED7E5',
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
