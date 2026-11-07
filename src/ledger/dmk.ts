import type {
  DeviceActionIntermediateValue,
  DeviceActionState,
  DeviceManagementKit,
  DeviceSessionId,
  DmkError,
  ExecuteDeviceActionReturnType,
  SendApduResult,
  Transport,
  TransportConnectedDevice,
  TransportFactory,
} from "@ledgerhq/device-management-kit";
import type { SignerEth } from "@ledgerhq/device-signer-kit-ethereum";

export type LedgerTransportConfig = { kind: "webhid" } | { kind: "speculos"; url: string };

export type ApduTrace = { command: string; status?: string; blocked?: boolean };

const DISCOVERY_TIMEOUT_MS = 15_000;
const CLA = 0xe0;
const INS_SIGN_TRANSACTION = 0x04;
const INS_PROVIDE_ERC20 = 0x0a;
const INS_SET_EXTERNAL_PLUGIN = 0x12;
const P1_FIRST_CHUNK = 0x00;
const PLUGIN_NAME = "ERC8009";

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export type GateFailure = { command: string; status: string };

export class Erc8009SignGate {
  private expected: { address: string; selector: string } | undefined;
  private pluginAccepted = false;
  private started = false;
  private failed: GateFailure | undefined;
  private blockedCount = 0;

  begin(bound: { address: string; selector: string } | undefined): void {
    this.expected = bound && {
      address: bound.address.toLowerCase().replace(/^0x/, ""),
      selector: bound.selector.toLowerCase().replace(/^0x/, ""),
    };
    this.pluginAccepted = false;
    this.started = false;
    this.failed = undefined;
    this.blockedCount = 0;
  }

  get failure(): GateFailure | undefined {
    return this.failed;
  }

  get blocked(): number {
    return this.blockedCount;
  }

  allows(apdu: Uint8Array): boolean {
    if (!this.expected || apdu[0] !== CLA || apdu[1] !== INS_SIGN_TRANSACTION) return true;
    const first = apdu[2] === P1_FIRST_CHUNK;
    const ok =
      this.failed === undefined && (first ? this.pluginAccepted && !this.started : this.started);
    if (!ok) {
      this.blockedCount += 1;
      return false;
    }
    if (first) this.started = true;
    return true;
  }

  record(apdu: Uint8Array, status: string | undefined): void {
    if (!this.expected || apdu[0] !== CLA) return;
    const ins = apdu[1];
    if (ins !== INS_SIGN_TRANSACTION && ins !== INS_PROVIDE_ERC20 && ins !== INS_SET_EXTERNAL_PLUGIN) {
      return;
    }
    if (status !== "9000") {
      this.failed ??= { command: toHex(apdu.slice(0, 2)), status: status ?? "transport-error" };
      return;
    }
    if (ins === INS_SET_EXTERNAL_PLUGIN && this.isOurPlugin(apdu)) this.pluginAccepted = true;
  }

  private isOurPlugin(apdu: Uint8Array): boolean {
    const data = apdu.slice(5);
    const nameLength = data[0] ?? 0;
    const name = new TextDecoder().decode(data.slice(1, 1 + nameLength));
    const address = toHex(data.slice(1 + nameLength, 21 + nameLength));
    const selector = toHex(data.slice(21 + nameLength, 25 + nameLength));
    return (
      name === PLUGIN_NAME &&
      address === this.expected?.address &&
      selector === this.expected?.selector
    );
  }
}

export class Erc8009GateError extends Error implements DmkError {
  readonly _tag = "Erc8009GateError";
  constructor() {
    super("ERC-8009 gate: E0 04 refused (plugin context not accepted, or retry after a refusal)");
  }
}

async function loadKit(kind: LedgerTransportConfig["kind"]) {
  const [dmk, signer, rxjs, contextModule, transport] = await Promise.all([
    import("@ledgerhq/device-management-kit"),
    import("@ledgerhq/device-signer-kit-ethereum"),
    import("rxjs"),
    import("./context-module"),
    kind === "speculos"
      ? import("@ledgerhq/device-transport-kit-speculos").then((m) => ({
          identifier: m.speculosIdentifier,
          factory: (url: string) => m.speculosTransportFactory(url),
        }))
      : import("@ledgerhq/device-transport-kit-web-hid").then((m) => ({
          identifier: m.webHidIdentifier,
          factory: () => m.webHidTransportFactory,
        })),
  ]);
  return { dmk, signer, rxjs, contextModule, transport };
}

type Kit = Awaited<ReturnType<typeof loadKit>>;

function gateTransport(
  kit: Kit,
  inner: TransportFactory,
  gate: Erc8009SignGate,
  onApdu?: (trace: ApduTrace) => void,
): TransportFactory {
  const wrap = (device: TransportConnectedDevice): TransportConnectedDevice =>
    new kit.dmk.TransportConnectedDevice({
      id: device.id,
      deviceModel: device.deviceModel,
      type: device.type,
      transport: device.transport,
      name: device.name,
      sendApdu: async (apdu, triggersDisconnection, abortTimeout): Promise<SendApduResult> => {
        const command = toHex(apdu.slice(0, 4));
        if (!gate.allows(apdu)) {
          onApdu?.({ command, blocked: true });
          throw new Erc8009GateError();
        }
        let result: SendApduResult;
        try {
          result = await device.sendApdu(apdu, triggersDisconnection, abortTimeout);
        } catch (error) {
          gate.record(apdu, undefined);
          onApdu?.({ command });
          throw error;
        }
        const status = result.caseOf({
          Left: () => undefined,
          Right: (response) => toHex(response.statusCode),
        });
        gate.record(apdu, status);
        onApdu?.({ command, status });
        return result;
      },
    });

  return (args) => {
    const transport = inner(args);
    const originals = new WeakMap<TransportConnectedDevice, TransportConnectedDevice>();
    const guarded: Transport = {
      getIdentifier: () => transport.getIdentifier(),
      isSupported: () => transport.isSupported(),
      startDiscovering: () => transport.startDiscovering(),
      stopDiscovering: () => transport.stopDiscovering(),
      listenToAvailableDevices: () => transport.listenToAvailableDevices(),
      connect: async (params) =>
        (await transport.connect(params)).map((device) => {
          const wrapped = wrap(device);
          originals.set(wrapped, device);
          return wrapped;
        }),
      disconnect: (params) =>
        transport.disconnect({
          connectedDevice: originals.get(params.connectedDevice) ?? params.connectedDevice,
        }),
    };
    return guarded;
  };
}

export type LedgerSession = {
  readonly dmk: DeviceManagementKit;
  readonly sessionId: DeviceSessionId;
  readonly signer: SignerEth;
  readonly kit: Kit;
  close(): Promise<void>;
};

export async function openLedgerSession(
  config: LedgerTransportConfig,
  options: {
    gate: Erc8009SignGate;
    onApdu?: (trace: ApduTrace) => void;
    onClosed: () => void;
  },
): Promise<LedgerSession> {
  const kit = await loadKit(config.kind);
  const { filter, firstValueFrom, timeout } = kit.rxjs;
  const inner = kit.transport.factory(config.kind === "speculos" ? config.url : "");
  const dmk = new kit.dmk.DeviceManagementKitBuilder()
    .addTransport(gateTransport(kit, inner, options.gate, options.onApdu))
    .build();
  try {
    const devices = await firstValueFrom(
      dmk
        .listenToAvailableDevices({ transport: kit.transport.identifier })
        .pipe(
          filter((list) => list.length > 0),
          timeout({ first: DISCOVERY_TIMEOUT_MS }),
        ),
    ).catch(() => {
      throw new Error(
        config.kind === "speculos"
          ? `Ledger: no Speculos device at ${config.url} (is the stand running?)`
          : "Ledger: no authorised USB device (connect it, unlock it, open Ethereum, then use «Ledger (USB)» again)",
      );
    });
    const sessionId = await dmk.connect({
      device: devices[0],
      sessionRefresherOptions:
        config.kind === "speculos" ? { isRefresherDisabled: true } : undefined,
    });
    dmk.getDeviceSessionState({ sessionId }).subscribe({
      complete: options.onClosed,
      error: options.onClosed,
    });
    const signer = new kit.signer.SignerEthBuilder({ dmk, sessionId })
      .withContextModule(kit.contextModule.createErc8009ContextModule())
      .build();
    return {
      dmk,
      sessionId,
      signer,
      kit,
      async close() {
        await dmk.disconnect({ sessionId }).catch(() => undefined);
        dmk.close();
      },
    };
  } catch (error) {
    dmk.close();
    throw error;
  }
}

export function runDeviceAction<Output, E extends DmkError, IV extends DeviceActionIntermediateValue>(
  kit: Kit,
  action: ExecuteDeviceActionReturnType<Output, E, IV>,
  onStep: (step: string) => Error | void,
): Promise<Output> {
  const { DeviceActionStatus } = kit.dmk;
  return new Promise<Output>((resolve, reject) => {
    let lastStep: string | undefined;
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };
    action.observable.subscribe({
      next: (state: DeviceActionState<Output, E, IV>) => {
        switch (state.status) {
          case DeviceActionStatus.Pending: {
            const step = (state.intermediateValue as { step?: string } | undefined)?.step;
            if (step && step !== lastStep) {
              lastStep = step;
              const cancelReason = onStep(step);
              if (cancelReason) {
                settle(() => reject(cancelReason));
                action.cancel();
              }
            }
            break;
          }
          case DeviceActionStatus.Completed:
            settle(() => resolve(state.output));
            break;
          case DeviceActionStatus.Error:
            settle(() => reject(state.error));
            break;
          case DeviceActionStatus.Stopped:
            settle(() => reject(new Error("Ledger: device action stopped")));
            break;
          default:
            break;
        }
      },
      error: (error: unknown) => settle(() => reject(error)),
    });
  });
}
