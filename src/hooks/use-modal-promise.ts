import { Address, Hex } from 'viem';
import { create } from 'zustand';

export type UseModalPromise = {
  isAdvanced: boolean;
  modalOpen: boolean;
  usePermitRouter: boolean;
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
  toggleAdvanced: () => void;
  setUsePermitRouter: (value: boolean) => void;
};

export const useModalPromise = create<UseModalPromise>((set, get) => ({
  isAdvanced: false,
  modalOpen: false,
  usePermitRouter: (() => {
    const saved = localStorage.getItem('usePermitRouter');
    return saved !== null ? saved === 'true' : true;
  })(),
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
      reject(new Error('Modal closed'));
    } else {
      console.error('No reject function found');
    }
    set({ modalOpen: false, resolve: null, reject: null, tx: null });
  },
  hideModal: () => {
    set({ modalOpen: false, resolve: null, reject: null, tx: null });
  },
  toggleAdvanced: () => {
    set((state) => ({ isAdvanced: !state.isAdvanced }));
  },
  setUsePermitRouter: (value: boolean) => {
    localStorage.setItem('usePermitRouter', String(value));
    set({ usePermitRouter: value });
  },
}));
