import { sepolia } from 'viem/chains';
import { proxyAbi } from './proxy.abi';
import { universalRouterAbi } from './universal-router.abi';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0x94af70F88602C256a6976eB6Fe0C99a7084E9a17' as const,
      abi: proxyAbi,
    },
    uniswapRouter: {
      address: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b' as const,
      abi: universalRouterAbi,
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

export const getUniswapRouterContract = (chainId: number | undefined) => {
  if (chainId !== sepolia.id)
    throw new Error(`ChainId ${chainId} not supported`);

  return {
    address: contracts[chainId].uniswapRouter.address,
    abi: contracts[chainId].uniswapRouter.abi,
  };
};
