import { sepolia } from 'viem/chains';
import { proxyAbi } from './proxy.abi';
import { universalRouterAbi } from './universal-router.abi';
import { proxyApproveRouterAbi } from './proxy-approve-router';

export const contracts = {
  [sepolia.id]: {
    proxy: {
      address: '0x9De9838426d3eA23102A96fbe030D581311603DF' as const,
      abi: proxyAbi,
    },
    proxyApproveRouter: {
      address: '0xC7d6f2085A3aF5Fb9060fF9bb14D6676aA1d2450',
      abi: proxyApproveRouterAbi,
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

export const getProxyApproveRouterContract = (chainId: number | undefined) => {
  if (chainId !== sepolia.id)
    throw new Error(`ChainId ${chainId} not supported`);

  return {
    address: contracts[chainId].proxyApproveRouter.address,
    abi: contracts[chainId].proxyApproveRouter.abi,
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
