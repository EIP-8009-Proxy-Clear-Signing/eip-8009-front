import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatToken = (symbol?: string, address?: string) => {
  return symbol === "ETH"
    ? "0x0000000000000000000000000000000000000000"
    : address || "";
};

export const formatBalance = (
  value: bigint | undefined,
  decimals: number | undefined,
) => {
  return Math.abs(Number(value) || 1) / 10 ** (decimals || 1);
};

export const shortenAddress = (address: string) => {
  return address.slice(0, 6) + "..." + address.slice(-4);
};

function getEnumKeys<E extends object>(
  enm: E,
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
