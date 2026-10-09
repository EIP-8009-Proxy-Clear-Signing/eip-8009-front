import {
  bytesToHex,
  getAddress,
  isAddressEqual,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";

import { contracts } from "../lib/contracts";

export const ERC8009_PLUGIN_NAME = "ERC8009";
export const ERC8009_CHAIN_ID = 11155111;

export const DUMMY_DER_SIGNATURE =
  "3044" + "0220" + "11".repeat(32) + "0220" + "22".repeat(32);

export const ERC8009_CONTRACT_NAMES = [
  "proxy",
  "proxyApproveRouter",
  "proxyPermitRouter",
  "safeRouter",
] as const;

export type Erc8009ContractName = (typeof ERC8009_CONTRACT_NAMES)[number];

const EXCLUDED_FUNCTIONS: ReadonlySet<string> = new Set(["executeSafeTransaction"]);

export type Erc8009Binding = {
  readonly chainId: number;
  readonly contract: Erc8009ContractName;
  readonly address: Address;
  readonly functionName: string;
  readonly selector: Hex;
};

let bindings: readonly Erc8009Binding[] | undefined;

export function getErc8009Bindings(): readonly Erc8009Binding[] {
  if (!bindings) {
    const deployed = contracts[ERC8009_CHAIN_ID];
    bindings = ERC8009_CONTRACT_NAMES.flatMap((contract) =>
      (deployed[contract].abi as Abi)
        .filter(
          (item): item is AbiFunction =>
            item.type === "function" &&
            item.stateMutability !== "view" &&
            item.stateMutability !== "pure" &&
            !EXCLUDED_FUNCTIONS.has(item.name),
        )
        .map((item) => ({
          chainId: ERC8009_CHAIN_ID,
          contract,
          address: getAddress(deployed[contract].address),
          functionName: item.name,
          selector: toFunctionSelector(item),
        })),
    );
  }
  return bindings;
}

export function isErc8009Contract(address: string | null | undefined): boolean {
  if (!address) return false;
  return ERC8009_CONTRACT_NAMES.some((contract) =>
    isAddressEqual(contracts[ERC8009_CHAIN_ID][contract].address, address as Address),
  );
}

export function findErc8009Binding(
  chainId: number,
  address: string,
  selector: string,
): Erc8009Binding | undefined {
  const sel = selector.toLowerCase();
  return getErc8009Bindings().find(
    (b) =>
      b.chainId === chainId &&
      isAddressEqual(b.address, address as Address) &&
      b.selector === sel,
  );
}

export const strip0x = (value: string) => (value.startsWith("0x") ? value.slice(2) : value);

export function externalPluginPayload(address: string, selector: string): string {
  const name = new TextEncoder().encode(ERC8009_PLUGIN_NAME);
  return (
    name.length.toString(16).padStart(2, "0") +
    strip0x(bytesToHex(name)) +
    strip0x(address).toLowerCase() +
    strip0x(selector).toLowerCase() +
    DUMMY_DER_SIGNATURE
  );
}
