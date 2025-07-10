import { create } from "zustand";

export type Check = {
  token: string;
  diff: number;
  target: string;
  decimals?: number;
  symbol?: string;
};

export type UseChecks = {
  checks: {
    diffs: Check[];
    approvals: Check[];
    withdrawals: Check[];
  };
  createDiffsCheck: () => void;
  changeDiffsCheck: (index: number, check: Check) => void;
  removeDiffsCheck: (index: number) => void;
  createApprovalCheck: () => void;
  changeApprovalCheck: (index: number, check: Check) => void;
  removeApprovalCheck: (index: number) => void;
  createWithdrawalCheck: () => void;
  changeWithdrawalCheck: (index: number, check: Check) => void;
  removeWithdrawalCheck: (index: number) => void;
};

export const useChecks = create<UseChecks>((set) => ({
  checks: {
    approvals: [],
    withdrawals: [],
    diffs: [],
  },
  createDiffsCheck: () => {
    set((state) => ({
      checks: {
        ...state.checks,
        diffs: [
          ...state.checks.diffs,
          {
            token: "",
            diff: 0,
            target: "",
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
            token: "",
            diff: 0,
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
          i === index ? check : c,
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
            diff: 0,
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
          i === index ? check : c,
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
}));
