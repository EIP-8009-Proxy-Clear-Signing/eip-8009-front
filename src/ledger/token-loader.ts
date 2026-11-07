import { ClearSignContextType, type ClearSignContext } from "@ledgerhq/context-module";
import {
  decodeFunctionData,
  getAddress,
  isAddressEqual,
  zeroAddress,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";

import { contracts } from "../lib/contracts";
import { DUMMY_DER_SIGNATURE, ERC8009_CHAIN_ID, findErc8009Binding, strip0x } from "./binding";

export type KnownToken = {
  readonly chainId: number;
  readonly address: Address;
  readonly ticker: string;
  readonly decimals: number;
};

export const KNOWN_TOKENS: readonly KnownToken[] = [
  {
    chainId: ERC8009_CHAIN_ID,
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    ticker: "USDC",
    decimals: 6,
  },
  {
    chainId: ERC8009_CHAIN_ID,
    address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    ticker: "WETH",
    decimals: 18,
  },
];

const ERC20_SELECTORS: ReadonlySet<string> = new Set([
  "0x095ea7b3",
  "0xa9059cbb",
]);

const MAX_TOKENS_PER_TX = 2;

const hex = (n: number, bytes: number) => n.toString(16).padStart(bytes * 2, "0");

export function tokenPayload(token: KnownToken): string {
  const ticker = new TextEncoder().encode(token.ticker);
  return (
    hex(ticker.length, 1) +
    Array.from(ticker, (b) => hex(b, 1)).join("") +
    strip0x(token.address).toLowerCase() +
    hex(token.decimals, 4) +
    hex(token.chainId, 4) +
    DUMMY_DER_SIGNATURE
  );
}

function knownToken(chainId: number, address: string): KnownToken | undefined {
  return KNOWN_TOKENS.find(
    (t) => t.chainId === chainId && isAddressEqual(t.address, address as Address),
  );
}

type BalanceArg = { token: Address };
type ApprovalArg = { balance: BalanceArg };

const GUARD_ARGS: ReadonlySet<string> = new Set(["postBalances", "balances", "diffs"]);

export function erc8009LookupCandidates(chainId: number, to: string, data: Hex): Address[] {
  const binding = findErc8009Binding(chainId, to, data.slice(0, 10));
  if (!binding) return [];
  const abi = contracts[ERC8009_CHAIN_ID][binding.contract].abi as Abi;
  let decoded;
  try {
    decoded = decodeFunctionData({ abi, data });
  } catch {
    return [];
  }
  const fn = abi.find(
    (item): item is AbiFunction => item.type === "function" && item.name === decoded.functionName,
  );
  if (!fn || !decoded.args) return [];
  const args = decoded.args as readonly unknown[];
  const named = (predicate: (name: string) => boolean) =>
    fn.inputs.flatMap((input, i) => (input.name && predicate(input.name) ? [args[i]] : []));

  const guardTokens = named((n) => GUARD_ARGS.has(n)).flatMap((list) =>
    (list as readonly BalanceArg[]).map((b) => b.token),
  );
  const pullTokens =
    binding.contract === "proxy"
      ? []
      : named((n) => n === "approvals").flatMap((list) =>
          (list as readonly ApprovalArg[]).map((a) => a.balance.token),
        );
  const hasMeta = fn.inputs.some((input) => input.name === "meta");
  const candidates = hasMeta
    ? pullTokens.filter((p) => !guardTokens.some((g) => isAddressEqual(g, p)))
    : [...guardTokens, ...pullTokens];

  const out: Address[] = [];
  for (const token of candidates) {
    if (isAddressEqual(token, zeroAddress)) continue;
    if (!out.some((t) => isAddressEqual(t, token))) out.push(getAddress(token));
  }
  return out;
}

export function tokensForTransaction(input: {
  chainId: number;
  to: string;
  data: string;
  selector: string;
}): KnownToken[] {
  const selector = input.selector.toLowerCase();
  if (ERC20_SELECTORS.has(selector)) {
    const token = knownToken(input.chainId, input.to);
    return token ? [token] : [];
  }
  return erc8009LookupCandidates(input.chainId, input.to, input.data as Hex)
    .map((address) => knownToken(input.chainId, address))
    .filter((t): t is KnownToken => t !== undefined)
    .slice(0, MAX_TOKENS_PER_TX);
}

type TxInput = { to: string; data: string; selector: string; chainId: number };

export const isTransactionInput = (input: unknown): input is TxInput => {
  if (typeof input !== "object" || input === null) return false;
  const i = input as Record<string, unknown>;
  return (
    typeof i.to === "string" &&
    typeof i.data === "string" &&
    typeof i.selector === "string" &&
    typeof i.chainId === "number"
  );
};

export const tokenLoader = {
  canHandle: (input: unknown, expectedTypes: ClearSignContextType[]): input is TxInput =>
    isTransactionInput(input) && expectedTypes.includes(ClearSignContextType.ETHEREUM_TOKEN),
  load: async (input: TxInput): Promise<ClearSignContext[]> =>
    tokensForTransaction(input).map((token) => ({
      type: ClearSignContextType.ETHEREUM_TOKEN,
      payload: tokenPayload(token),
    })),
};
