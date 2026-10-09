import { createConnector } from "@wagmi/core";
import { getAddress, type Address } from "viem";
import { sepolia } from "viem/chains";

import { createLedgerProvider, type LedgerProvider, type LedgerProviderOptions } from "./provider";

const LEDGER_USB_VENDOR_ID = 0x2c97;

type HidApi = {
  requestDevice(options: { filters: { vendorId: number }[] }): Promise<unknown[]>;
  getDevices(): Promise<{ vendorId: number }[]>;
};

const hid = (): HidApi | undefined =>
  (globalThis.navigator as (Navigator & { hid?: HidApi }) | undefined)?.hid;

function requestUsbDevice(): Promise<unknown[]> {
  const api = hid();
  if (!api) {
    return Promise.reject(
      new Error("Ledger (USB) needs WebHID: use Chrome or Edge on http://localhost or https"),
    );
  }
  return api.requestDevice({ filters: [{ vendorId: LEDGER_USB_VENDOR_ID }] });
}

async function hasGrantedUsbDevice(): Promise<boolean> {
  const devices = (await hid()?.getDevices()) ?? [];
  return devices.some((d) => d.vendorId === LEDGER_USB_VENDOR_ID);
}

type CommonOptions = Omit<LedgerProviderOptions, "transport">;

export function ledgerUsb(options: CommonOptions) {
  return ledgerConnector("ledgerUsb", "Ledger (USB)", { ...options, transport: { kind: "webhid" } });
}

export function ledgerSpeculos({ url, ...options }: CommonOptions & { url: string }) {
  return ledgerConnector("ledgerSpeculos", "Ledger (Speculos)", {
    ...options,
    transport: { kind: "speculos", url },
  });
}

type StorageItem = { [key: `${string}.connected`]: true };

function ledgerConnector(id: string, name: string, options: LedgerProviderOptions) {
  const usb = options.transport.kind === "webhid";
  const connectedKey = `${id}.connected` as const;
  let provider: LedgerProvider | undefined;
  let onAccountsChanged: ((accounts: unknown) => void) | undefined;
  let onDisconnect: (() => void) | undefined;

  return createConnector<LedgerProvider, Record<string, unknown>, StorageItem>((config) => ({
    id,
    name,
    type: "ledger",

    async connect({ isReconnecting } = {}) {
      if (usb && !isReconnecting) {
        const picked = await requestUsbDevice();
        if (picked.length === 0) throw new Error("Ledger (USB): no device selected");
      }
      const p = await this.getProvider();
      const accounts = ((await p.request({ method: "eth_requestAccounts" })) as string[]).map(
        (a) => getAddress(a),
      );
      if (!onAccountsChanged) {
        onAccountsChanged = (a) => this.onAccountsChanged(a as string[]);
        onDisconnect = () => this.onDisconnect();
        p.on("accountsChanged", onAccountsChanged);
        p.on("disconnect", onDisconnect);
      }
      await config.storage?.setItem(connectedKey, true);
      return { accounts, chainId: sepolia.id };
    },

    async disconnect() {
      await config.storage?.removeItem(connectedKey);
      if (provider) {
        if (onAccountsChanged) provider.removeListener("accountsChanged", onAccountsChanged);
        if (onDisconnect) provider.removeListener("disconnect", onDisconnect);
        onAccountsChanged = onDisconnect = undefined;
        await provider.disconnect();
      }
    },

    async getAccounts() {
      const p = await this.getProvider();
      return ((await p.request({ method: "eth_accounts" })) as string[]).map((a) => getAddress(a));
    },

    async getChainId() {
      return sepolia.id;
    },

    async getProvider() {
      provider ??= createLedgerProvider(options);
      return provider;
    },

    async isAuthorized() {
      if (!(await config.storage?.getItem(connectedKey))) return false;
      return usb ? hasGrantedUsbDevice() : true;
    },

    async switchChain({ chainId }) {
      const chain = config.chains.find((c) => c.id === chainId);
      if (chainId !== sepolia.id || !chain) throw new Error(`${name}: only Sepolia is supported`);
      return chain;
    },

    onAccountsChanged(accounts) {
      if (accounts.length === 0) this.onDisconnect();
      else config.emitter.emit("change", { accounts: accounts.map((a) => getAddress(a) as Address) });
    },

    onChainChanged(chainId) {
      config.emitter.emit("change", { chainId: Number(chainId) });
    },

    async onDisconnect() {
      await config.storage?.removeItem(connectedKey);
      config.emitter.emit("disconnect");
    },
  }));
}
