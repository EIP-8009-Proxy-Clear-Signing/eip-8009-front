export const proxyAbi = [
  {
    inputs: [
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
        internalType: 'bytes',
        name: 'returnData',
        type: 'bytes',
      },
    ],
    name: 'CallFailed',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
      {
        internalType: 'int256',
        name: 'balance',
        type: 'int256',
      },
      {
        internalType: 'uint256',
        name: 'actual',
        type: 'uint256',
      },
    ],
    name: 'InsufficientBalance',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
    ],
    name: 'MaliciousApproveTarget',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'int256',
        name: 'amount',
        type: 'int256',
      },
    ],
    name: 'NegativeApprovalAmount',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ReentrancyGuardReentrantCall',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
      {
        internalType: 'int256',
        name: 'expected',
        type: 'int256',
      },
      {
        internalType: 'int256',
        name: 'actual',
        type: 'int256',
      },
    ],
    name: 'UnexpectedBalanceDiff',
    type: 'error',
  },
  {
    inputs: [
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
    name: 'proxyCall',
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
    name: 'proxyCallDiffs',
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
            internalType: 'string',
            name: 'symbol',
            type: 'string',
          },
          {
            internalType: 'uint8',
            name: 'decimals',
            type: 'uint8',
          },
        ],
        internalType: 'struct BalanceMetadata[]',
        name: 'meta',
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
    name: 'proxyCallDiffsMeta',
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
            internalType: 'string',
            name: 'symbol',
            type: 'string',
          },
          {
            internalType: 'uint8',
            name: 'decimals',
            type: 'uint8',
          },
        ],
        internalType: 'struct BalanceMetadata[]',
        name: 'meta',
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
    name: 'proxyCallMeta',
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
    stateMutability: 'payable',
    type: 'receive',
  },
] as const;
