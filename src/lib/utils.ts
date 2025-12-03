import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { usePublicClient } from 'wagmi';
import * as viemChains from 'viem/chains';
import { type Chain } from 'viem';

const allChains: Chain[] = Object.values(viemChains);

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatToken = (symbol?: string, address?: string) => {
  return symbol === 'ETH'
    ? '0x0000000000000000000000000000000000000000'
    : address || '';
};

export const formatBalance = (
  value: bigint | undefined,
  decimals: number | undefined
) => {
  return Math.abs(Number(value) || 1) / 10 ** (decimals || 1);
};

export const formatBalancePrecise = (
  value: bigint,
  decimals: number
): string => {
  const valueStr = value.toString();
  const isNegative = valueStr.startsWith('-');
  const absValue = isNegative ? valueStr.slice(1) : valueStr;

  // Pad with zeros if needed
  const paddedValue = absValue.padStart(decimals + 1, '0');

  // Insert decimal point
  const integerPart = paddedValue.slice(0, -decimals) || '0';
  const fractionalPart = paddedValue.slice(-decimals);

  // Remove trailing zeros from fractional part
  const trimmedFractional = fractionalPart.replace(/0+$/, '');

  const result = trimmedFractional
    ? `${integerPart}.${trimmedFractional}`
    : integerPart;

  return isNegative ? `-${result}` : result;
};

export const shortenAddress = (address: string) => {
  return address.slice(0, 6) + '...' + address.slice(-4);
};

function getEnumKeys<E extends object>(
  enm: E
): Array<Extract<keyof E, string>> {
  return Object.keys(enm)
    .filter((k) => isNaN(+k))
    .map((k) => k as Extract<keyof E, string>);
}

export function getEnumValues<E>(enm: { [k: string]: E }): E[] {
  return getEnumKeys(enm).map((k) => enm[k]);
}

export function getEnumEntries<E>(enm: { [k: string]: E }): [keyof E, E][] {
  return getEnumKeys(enm).map((k) => [k, enm[k]] as [keyof E, E]);
}

export async function waitForTx(
  publicClient: ReturnType<typeof usePublicClient>,
  hash: `0x${string}`,
  confirmations = 1
) {
  return publicClient?.waitForTransactionReceipt({
    hash,
    confirmations,
  });
}

export function getExplorerUrl(chainId: number) {
  const chain: Chain | undefined = allChains.find((c) => c.id === chainId);
  return (
    chain?.blockExplorers?.default.url ||
    chain?.blockExplorers?.etherscan?.url ||
    'https://etherscan.io'
  );
}
