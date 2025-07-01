import { Address, Hex } from "viem";
import { create } from "zustand";

export type UseModalPromise = {
  modalOpen: boolean;
  tx: {
    to: Address;
    data: Hex;
    value?: number;
  } | null;
  openModal: (tx: {
    to: Address;
    data: Hex;
    value?: number;
  }) => Promise<string>;
  resolve: ((value: string) => void) | null;
  reject: ((reason: unknown) => void) | null;
  closeModal: () => void;
  hideModal: () => void;
};

export const useModalPromise = create<UseModalPromise>((set, get) => ({
  modalOpen: false,
  tx: null,
  openModal: (tx: { to: Address; data: Hex }) => {
    set({ modalOpen: true, tx });
    return new Promise((resolve, reject) => {
      set({ resolve, reject });
    });
  },
  resolve: null,
  reject: null,
  closeModal: () => {
    const { reject } = get();
    if (reject) {
      reject(new Error("Modal closed"));
    } else {
      console.error("No reject function found");
    }
    set({ modalOpen: false, resolve: null, reject: null, tx: null });
  },
  hideModal: () => {
    set({ modalOpen: false, resolve: null, reject: null, tx: null });
  },
}));
