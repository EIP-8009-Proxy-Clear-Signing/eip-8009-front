import { create } from "zustand";

export type Check = {
  token: string;
  balance: number;
  target: string;
};

export type UseChecks = {
  checks: {
    preTransfer: Check[];
    approvals: Check[];
    withdrawals: Check[];
    postTransfer: Check[];
  };
  createPreTransferCheck: () => void;
  changePreTransferCheck: (index: number, check: Check) => void;
  removePreTransferCheck: (index: number) => void;
  createApprovalCheck: () => void;
  changeApprovalCheck: (index: number, check: Check) => void;
  removeApprovalCheck: (index: number) => void;
  createWithdrawalCheck: () => void;
  changeWithdrawalCheck: (index: number, check: Check) => void;
  removeWithdrawalCheck: (index: number) => void;
  createPostTransferCheck: () => void;
  changePostTransferCheck: (index: number, check: Check) => void;
  removePostTransferCheck: (index: number) => void;
};

export const useChecks = create<UseChecks>((set) => ({
  checks: {
    preTransfer: [],
    approvals: [],
    withdrawals: [],
    postTransfer: [],
  },
  createPreTransferCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        preTransfer: [
          ...state.checks.preTransfer,
          {
            token: "",
            balance: 0,
            target: "",
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
  createApprovalCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        approvals: [
          ...state.checks.approvals,
          {
            token: "",
            balance: 0,
            target: "",
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
            token: "",
            balance: 0,
            target: "",
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
            token: "",
            balance: 0,
            target: "",
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
}));
