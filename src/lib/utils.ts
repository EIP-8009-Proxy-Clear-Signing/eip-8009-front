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
