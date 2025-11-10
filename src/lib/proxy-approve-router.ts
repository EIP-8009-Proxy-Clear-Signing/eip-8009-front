export const proxyApproveRouterAbi = [
  {
    inputs: [
      {
        internalType: 'contract IBalanceProxy',
        name: 'balanceProxy',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'target',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'token',
            type: 'address',
          },
          {
            internalType: 'int256',
            name: 'balance',
            type: 'int256',
          },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'postBalances',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              {
                internalType: 'address',
                name: 'target',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'token',
                type: 'address',
              },
              {
                internalType: 'int256',
                name: 'balance',
                type: 'int256',
              },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          {
            internalType: 'bool',
            name: 'useTransfer',
            type: 'bool',
          },
        ],
        internalType: 'struct IBalanceProxy.Approval[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'target',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'token',
            type: 'address',
          },
          {
            internalType: 'int256',
            name: 'balance',
            type: 'int256',
          },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'approveProxyCall',
    outputs: [
      {
        internalType: 'bytes',
        name: '',
        type: 'bytes',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IBalanceProxy',
        name: 'balanceProxy',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'target',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'token',
            type: 'address',
          },
          {
            internalType: 'int256',
            name: 'balance',
            type: 'int256',
          },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'diffs',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              {
                internalType: 'address',
                name: 'target',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'token',
                type: 'address',
              },
              {
                internalType: 'int256',
                name: 'balance',
                type: 'int256',
              },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          {
            internalType: 'bool',
            name: 'useTransfer',
            type: 'bool',
          },
        ],
        internalType: 'struct IBalanceProxy.Approval[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'target',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'token',
            type: 'address',
          },
          {
            internalType: 'int256',
            name: 'balance',
            type: 'int256',
          },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'approveProxyCallDiffs',
    outputs: [
      {
        internalType: 'bytes',
        name: '',
        type: 'bytes',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;
