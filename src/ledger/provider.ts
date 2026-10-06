import type {
  DeviceActionIntermediateValue,
  DmkError,
  ExecuteDeviceActionReturnType,
} from "@ledgerhq/device-management-kit";
import {
  concat,
  createPublicClient,
  custom,
  getAddress,
  hexToBigInt,
  hexToBytes,
  hexToNumber,
  http,
  isAddress,
  isAddressEqual,
  isHex,
  numberToHex,
  pad,
  serializeTransaction,
  stringToBytes,
  type Address,
  type Hex,
  type TransactionSerializableEIP1559,
} from "viem";
import { estimateFeesPerGas, estimateGas, getTransactionCount, sendRawTransaction } from "viem/actions";
import { sepolia } from "viem/chains";

import { isErc8009Contract } from "./binding";
import {
  openLedgerSession,
  runDeviceAction,
  Erc8009SignGate,
  type ApduTrace,
  type LedgerSession,
  type LedgerTransportConfig,
} from "./dmk";

export const LEDGER_DERIVATION_PATH = "44'/60'/0'/0/0";
const CHAIN_ID_HEX = "0xaa36a7"; // Sepolia, 11155111

export const READ_METHODS: ReadonlySet<string> = new Set([
  "eth_call",
  "eth_estimateGas",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_getLogs",
  "eth_getStorageAt",
  "net_version",
  "web3_clientVersion",
]);

const STEP_WEB3_CHECKS_OPT_IN = "signer.eth.steps.web3ChecksOptIn";
const STEP_BLIND_SIGN_FALLBACK = "signer.eth.steps.blindSignTransactionFallback";

export class LedgerProviderRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "LedgerProviderRpcError";
    this.code = code;
    this.data = data;
  }
}

export type LedgerProviderEvent =
  | { type: "hint"; message: string }
  | { type: "step"; method: string; step: string }
  | { type: "apdu"; trace: ApduTrace }
  | { type: "fallback-blocked"; to: Address; status?: string };

export type RequestFn = (args: { method: string; params?: unknown }) => Promise<unknown>;

export type LedgerProviderOptions = {
  transport: LedgerTransportConfig;
  rpcUrl?: string;
  rpc?: { request: RequestFn };
  broadcast: boolean;
  onEvent?: (event: LedgerProviderEvent) => void;
};

type Listener = (...args: unknown[]) => void;

export type LedgerProvider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: Listener): void;
  removeListener(event: string, listener: Listener): void;
  disconnect(): Promise<void>;
};

type RpcTransactionRequest = {
  from?: Address;
  to?: Address | null;
  value?: Hex;
  data?: Hex;
  input?: Hex;
  gas?: Hex;
  nonce?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  gasPrice?: Hex;
  chainId?: Hex;
  accessList?: TransactionSerializableEIP1559["accessList"];
};

type DmkSignature = { r: Hex; s: Hex; v: number };

const hint = (message: string) => console.info(`[ledger] ${message}`);

export function createLedgerProvider(options: LedgerProviderOptions): LedgerProvider {
  const onEvent = options.onEvent ?? ((e) => e.type === "hint" && hint(e.message));
  const client = createPublicClient({
    chain: sepolia,
    transport: options.rpc ? custom(options.rpc) : http(options.rpcUrl),
  });
  const gate = new Erc8009SignGate();
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queue.then(fn, fn);
    queue = result.catch(() => undefined);
    return result;
  };
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, ...args: unknown[]) =>
    listeners.get(event)?.forEach((listener) => listener(...args));

  let state: { session: LedgerSession; address: Address } | null = null;
  let pending: Promise<{ session: LedgerSession; address: Address }> | null = null;

  async function ensure() {
    if (state) return state;
    pending ??= (async () => {
      const session = await openLedgerSession(options.transport, {
        gate,
        onApdu: (trace) => onEvent({ type: "apdu", trace }),
        onClosed: () => {
          if (state?.session === session) state = null;
        },
      });
      let ready: { session: LedgerSession; address: Address };
      try {
        const { address } = await run(
          "eth_requestAccounts",
          session,
          session.signer.getAddress(LEDGER_DERIVATION_PATH, { checkOnDevice: false }),
        );
        ready = { session, address: getAddress(address) };
      } catch (error) {
        await session.close();
        throw error;
      }
      state = ready;
      emit("connect", { chainId: CHAIN_ID_HEX });
      emit("accountsChanged", [ready.address]);
      return ready;
    })().finally(() => {
      pending = null;
    });
    return pending;
  }

  function run<Output>(
    method: string,
    session: LedgerSession,
    action: ExecuteDeviceActionReturnType<Output, DmkError, DeviceActionIntermediateValue>,
    boundTo?: Address,
  ): Promise<Output> {
    return runDeviceAction(session.kit, action, (step) => {
      onEvent({ type: "step", method, step });
      if (step === STEP_WEB3_CHECKS_OPT_IN) {
        onEvent({
          type: "hint",
          message:
            "The device asks «Enable Transaction Check?»: answer «Maybe later» (keep «Transaction Check» OFF).",
        });
      }
      if (boundTo && step === STEP_BLIND_SIGN_FALLBACK) {
        const f = gate.failure;
        onEvent({ type: "fallback-blocked", to: boundTo, status: f ? `${f.command}:${f.status}` : "no-plugin-context" });
        return gateError(step);
      }
    }).catch((error: unknown) => {
      const e = error as { errorCode?: unknown } | undefined;
      if (boundTo && e?.errorCode !== "6985" && (gate.failure || gate.blocked > 0)) {
        throw error instanceof LedgerProviderRpcError ? error : gateError();
      }
      throw toRpcError(error);
    });
  }

  function gateError(step?: string): LedgerProviderRpcError {
    const f = gate.failure;
    const names: Record<string, string> = { e004: "E0 04", e00a: "E0 0A", e012: "E0 12" };
    const why = !f
      ? "the device never accepted the ERC8009 plugin context for this call (no E0 12 = 9000)"
      : f.command === "e004"
        ? `the ERC8009 plugin refused it (E0 04 status ${f.status})`
        : `the device rejected its signing context (${names[f.command] ?? f.command} status ${f.status})`;
    return new LedgerProviderRpcError(
      -32603,
      `Ledger refused the ERC-8009 transaction: ${why}. Blind signing was blocked and nothing was signed. ` +
        "Check that the ERC8009 plugin is installed and that «Debug smart contracts» is OFF in the Ethereum app settings.",
      { failure: f, blockedApdus: gate.blocked, step },
    );
  }

  function toRpcError(error: unknown): unknown {
    if (error instanceof LedgerProviderRpcError) return error;
    const e = error as { errorCode?: unknown; _tag?: string; message?: string } | undefined;
    if (e?.errorCode === "6985") {
      return new LedgerProviderRpcError(4001, "Rejected on the Ledger device", e);
    }
    const detail = e?.errorCode ? ` (status ${String(e.errorCode)})` : "";
    return new LedgerProviderRpcError(
      -32603,
      `Ledger: ${e?.message ?? e?._tag ?? String(error)}${detail}`,
      e,
    );
  }

  async function account(requested: unknown): Promise<{ session: LedgerSession; address: Address }> {
    const s = await ensure();
    if (
      typeof requested === "string" &&
      !(isAddress(requested, { strict: false }) && isAddressEqual(requested, s.address))
    ) {
      throw new LedgerProviderRpcError(4100, `Ledger: unknown account ${requested}`);
    }
    return s;
  }

  async function buildTransaction(
    request: RpcTransactionRequest,
    from: Address,
  ): Promise<TransactionSerializableEIP1559 & { to: Address }> {
    if (!request.to) {
      throw new LedgerProviderRpcError(-32602, "Ledger: contract creation is not supported");
    }
    const to = getAddress(request.to);
    const value = request.value ? hexToBigInt(request.value) : 0n;
    const data = request.data ?? request.input ?? "0x";
    const nonce =
      request.nonce !== undefined
        ? hexToNumber(request.nonce)
        : await getTransactionCount(client, { address: from, blockTag: "pending" });
    let maxFeePerGas = request.maxFeePerGas ? hexToBigInt(request.maxFeePerGas) : undefined;
    let maxPriorityFeePerGas = request.maxPriorityFeePerGas
      ? hexToBigInt(request.maxPriorityFeePerGas)
      : undefined;
    if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) {
      const fees = await estimateFeesPerGas(client, { type: "eip1559" });
      maxFeePerGas ??= fees.maxFeePerGas;
      maxPriorityFeePerGas ??= fees.maxPriorityFeePerGas;
    }
    const gas =
      request.gas !== undefined
        ? hexToBigInt(request.gas)
        : ((await estimateGas(client, { account: from, to, data, value })) * 12n) / 10n;
    return {
      type: "eip1559",
      chainId: sepolia.id,
      nonce,
      to,
      value,
      data,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
      accessList: request.accessList ?? [],
    };
  }

  async function signTransaction(params: unknown): Promise<Hex> {
    const request = (Array.isArray(params) ? params[0] : undefined) as RpcTransactionRequest | undefined;
    if (!request) throw new LedgerProviderRpcError(-32602, "Ledger: missing transaction");
    if (request.chainId !== undefined && hexToNumber(request.chainId) !== sepolia.id) {
      throw new LedgerProviderRpcError(4901, `Ledger: only Sepolia (${sepolia.id}) is supported`);
    }
    const { session, address } = await account(request.from);
    const tx = await buildTransaction(request, address);
    const bound = isErc8009Contract(tx.to);
    const signature = await exclusive(() => {
      gate.begin(bound ? { address: tx.to, selector: (tx.data ?? "0x").slice(0, 10) } : undefined);
      return run<DmkSignature>(
        "eth_signTransaction",
        session,
        session.signer.signTransaction(LEDGER_DERIVATION_PATH, hexToBytes(serializeTransaction(tx))),
        bound ? tx.to : undefined,
      );
    });
    const yParity = signature.v >= 27 ? (signature.v - 27) % 2 : signature.v;
    return serializeTransaction(tx, { r: signature.r, s: signature.s, yParity });
  }

  const encodeSignature = ({ r, s, v }: DmkSignature): Hex =>
    concat([pad(r, { size: 32 }), pad(s, { size: 32 }), numberToHex(v < 27 ? v + 27 : v, { size: 1 })]);

  async function signTypedData(params: unknown): Promise<Hex> {
    const [from, raw] = (Array.isArray(params) ? params : []) as [unknown, unknown];
    let typedData: { domain?: { chainId?: number | string | bigint } } | null;
    try {
      typedData = typeof raw === "string" ? JSON.parse(raw) : (raw as typeof typedData);
    } catch {
      throw new LedgerProviderRpcError(-32602, "Ledger: typed data is not valid JSON");
    }
    if (!typedData || typeof typedData !== "object") {
      throw new LedgerProviderRpcError(-32602, "Ledger: missing typed data");
    }
    const domain = typedData.domain;
    if (domain?.chainId !== undefined) {
      let chainId: number;
      try {
        chainId = Number(BigInt(domain.chainId));
      } catch {
        throw new LedgerProviderRpcError(-32602, `Ledger: invalid domain.chainId ${String(domain.chainId)}`);
      }
      if (chainId !== sepolia.id) {
        throw new LedgerProviderRpcError(
          4901,
          `Ledger: typed data for chain ${chainId} refused; only Sepolia (${sepolia.id}) is supported`,
        );
      }
      domain.chainId = chainId;
    }
    const { session } = await account(from);
    const signature = await exclusive(() =>
      run<DmkSignature>(
        "eth_signTypedData_v4",
        session,
        session.signer.signTypedData(
          LEDGER_DERIVATION_PATH,
          typedData as Parameters<LedgerSession["signer"]["signTypedData"]>[1],
        ),
      ),
    );
    return encodeSignature(signature);
  }

  async function personalSign(params: unknown): Promise<Hex> {
    let [message, from] = (Array.isArray(params) ? params : []) as [unknown, unknown];
    const isAddressLike = (v: unknown) => typeof v === "string" && isHex(v) && v.length === 42;
    if (isAddressLike(message) && !isAddressLike(from)) [message, from] = [from, message];
    if (typeof message !== "string") throw new LedgerProviderRpcError(-32602, "Ledger: missing message");
    const { session } = await account(from);
    const bytes = isHex(message) ? hexToBytes(message) : stringToBytes(message);
    const signature = await exclusive(() =>
      run<DmkSignature>("personal_sign", session, session.signer.signMessage(LEDGER_DERIVATION_PATH, bytes)),
    );
    return encodeSignature(signature);
  }

  async function request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts":
        return [(await ensure()).address];
      case "eth_accounts":
        return state ? [state.address] : [];
      case "eth_chainId":
        return CHAIN_ID_HEX;
      case "wallet_switchEthereumChain": {
        const [target] = (Array.isArray(params) ? params : []) as [{ chainId?: string } | undefined];
        if (target?.chainId && hexToNumber(target.chainId as Hex) === sepolia.id) return null;
        throw new LedgerProviderRpcError(4902, "Ledger: only Sepolia is supported");
      }
      case "eth_signTransaction":
        return signTransaction(params);
      case "eth_sendTransaction": {
        const signed = await signTransaction(params);
        if (options.broadcast !== true) {
          throw new LedgerProviderRpcError(
            4100,
            "Ledger: transaction signed but NOT sent — broadcasting is disabled (VITE_LEDGER_BROADCAST is not \"1\").",
            { signedTransaction: signed },
          );
        }
        return sendRawTransaction(client, { serializedTransaction: signed });
      }
      case "eth_signTypedData_v4":
        return signTypedData(params);
      case "personal_sign":
        return personalSign(params);
      default:
        if (READ_METHODS.has(method)) return client.request({ method, params } as never);
        throw new LedgerProviderRpcError(4200, `Ledger: method ${method} is not supported`);
    }
  }

  return {
    request,
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    async disconnect() {
      const current = state ?? (pending ? await pending.catch(() => null) : null);
      state = null;
      if (current) await current.session.close();
      emit("accountsChanged", []);
      emit("disconnect", new LedgerProviderRpcError(4900, "Ledger disconnected"));
    },
  };
}
