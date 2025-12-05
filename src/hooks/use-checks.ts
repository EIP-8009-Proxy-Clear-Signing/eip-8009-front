import { create } from 'zustand';

export type Check = {
  token: string;
  balance: number | string; // Allow string to preserve precision for bigint values
  target: string;
  decimals?: number;
  symbol?: string;
};

export enum EMode {
  'diifs' = 'diffs',
  'pre/post' = 'pre/post',
}

export type UseChecks = {
  checks: {
    diffs: Check[];
    approvals: Check[];
    withdrawals: Check[];
    preTransfer: Check[];
    postTransfer: Check[];
  };
  slippage: number;
  setSlippage: (slippage: number) => void;
  slippagePrePost: number;
  setSlippagePrePost: (slippage: number) => void;
  createDiffsCheck: () => void;
  changeDiffsCheck: (index: number, check: Check) => void;
  removeDiffsCheck: (index: number) => void;
  createApprovalCheck: () => void;
  changeApprovalCheck: (index: number, check: Check) => void;
  removeApprovalCheck: (index: number) => void;
  createWithdrawalCheck: () => void;
  changeWithdrawalCheck: (index: number, check: Check) => void;
  removeWithdrawalCheck: (index: number) => void;

  createPreTransferCheck: () => void;
  changePreTransferCheck: (index: number, check: Check) => void;
  removePreTransferCheck: (index: number) => void;

  createPostTransferCheck: () => void;
  changePostTransferCheck: (index: number, check: Check) => void;
  removePostTransferCheck: (index: number) => void;

  mode: EMode;
  setMode: (mode: EMode) => void;
};

export const MIN_SLIPPAGE = 0;
export const MAX_SLIPPAGE = 100;
export const DEFAULT_SLIPPAGE = 0.001;
export const DEFAULT_SLIPPAGE_PREPOST = 1.0;

export const useChecks = create<UseChecks>((set) => ({
  mode: EMode.diifs,
  checks: {
    preTransfer: [],
    postTransfer: [],
    approvals: [],
    withdrawals: [],
    diffs: [],
  },
  slippage: DEFAULT_SLIPPAGE,
  slippagePrePost: DEFAULT_SLIPPAGE_PREPOST,
  setMode: (mode: EMode) =>
    set(() => ({
      mode,
    })),
  setSlippage: (slippage) => {
    if (slippage >= MIN_SLIPPAGE && MAX_SLIPPAGE >= slippage) {
      return set(() => ({ slippage }));
    } else {
      if (slippage < MIN_SLIPPAGE) {
        return set(() => ({ slippage: MIN_SLIPPAGE }));
      } else if (MAX_SLIPPAGE < slippage) {
        return set(() => ({ slippage: MAX_SLIPPAGE }));
      }
    }
  },
  setSlippagePrePost: (slippagePrePost) => {
    if (slippagePrePost >= MIN_SLIPPAGE && MAX_SLIPPAGE >= slippagePrePost) {
      return set(() => ({ slippagePrePost }));
    } else {
      if (slippagePrePost < MIN_SLIPPAGE) {
        return set(() => ({ slippagePrePost: MIN_SLIPPAGE }));
      } else if (MAX_SLIPPAGE < slippagePrePost) {
        return set(() => ({ slippagePrePost: MAX_SLIPPAGE }));
      }
    }
  },
  createDiffsCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        diffs: [
          ...state.checks.diffs,
          {
            token: '',
            balance: 0,
            target: '',
          },
        ],
      },
    }));
  },
  changeDiffsCheck: (index: number, check: Check) => {
    set((state) => ({
      checks: {
        ...state.checks,
        diffs: state.checks.diffs.map((c, i) => (i === index ? check : c)),
      },
    }));
  },
  removeDiffsCheck: (index: number) => {
    set((state) => ({
      checks: {
        ...state.checks,
        diffs: state.checks.diffs.filter((_, i) => i !== index),
      },
    }));
  },
  createApprovalCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        approvals: [
          ...state.checks.approvals,
          {
            token: '',
            balance: 0,
            target: '',
          },
        ],
      },
    }));
  },
  changeApprovalCheck: (index: number, check: Check) => {
    set((state) => ({
      checks: {
        ...state.checks,
        approvals: state.checks.approvals.map((c, i) =>
          i === index ? check : c
        ),
      },
    }));
  },
  removeApprovalCheck: (index: number) => {
    set((state) => ({
      checks: {
        ...state.checks,
        approvals: state.checks.approvals.filter((_, i) => i !== index),
      },
    }));
  },
  createWithdrawalCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        withdrawals: [
          ...state.checks.withdrawals,
          {
            token: '',
            balance: 0,
            target: '',
          },
        ],
      },
    }));
  },
  changeWithdrawalCheck: (index: number, check: Check) => {
    set((state) => ({
      checks: {
        ...state.checks,
        withdrawals: state.checks.withdrawals.map((c, i) =>
          i === index ? check : c
        ),
      },
    }));
  },
  removeWithdrawalCheck: (index: number) => {
    set((state) => ({
      checks: {
        ...state.checks,
        withdrawals: state.checks.withdrawals.filter((_, i) => i !== index),
      },
    }));
  },

  createPostTransferCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        postTransfer: [
          ...state.checks.postTransfer,
          {
            token: '',
            balance: 0,
            target: '',
          },
        ],
      },
    }));
  },
  changePostTransferCheck: (index: number, check: Check) => {
    set((state) => ({
      checks: {
        ...state.checks,
        postTransfer: state.checks.postTransfer.map((c, i) =>
          i === index ? check : c
        ),
      },
    }));
  },
  removePostTransferCheck: (index: number) => {
    set((state) => ({
      checks: {
        ...state.checks,
        postTransfer: state.checks.postTransfer.filter((_, i) => i !== index),
      },
    }));
  },

  createPreTransferCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        preTransfer: [
          ...state.checks.preTransfer,
          {
            token: '',
            balance: 0,
            target: '',
          },
        ],
      },
    }));
  },
  changePreTransferCheck: (index: number, check: Check) => {
    set((state) => ({
      checks: {
        ...state.checks,
        preTransfer: state.checks.preTransfer.map((c, i) =>
          i === index ? check : c
        ),
      },
    }));
  },
  removePreTransferCheck: (index: number) => {
    set((state) => ({
      checks: {
        ...state.checks,
        preTransfer: state.checks.preTransfer.filter((_, i) => i !== index),
      },
    }));
  },
}));
