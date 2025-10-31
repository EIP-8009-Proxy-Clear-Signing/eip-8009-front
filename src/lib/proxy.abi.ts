export const proxyAbi = [
  {
    inputs: [
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'CallFailed',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'int256', name: 'balance', type: 'int256' },
      { internalType: 'uint256', name: 'actual', type: 'uint256' },
    ],
    name: 'InsufficientBalance',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'string', name: 'expectedSymbol', type: 'string' },
      { internalType: 'uint8', name: 'expectedDecimals', type: 'uint8' },
      { internalType: 'string', name: 'actualSymbol', type: 'string' },
      { internalType: 'uint8', name: 'actualDecimals', type: 'uint8' },
    ],
    name: 'InvalidMetadata',
    type: 'error',
  },
  {
    inputs: [
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'int256', name: 'expected', type: 'int256' },
      { internalType: 'int256', name: 'actual', type: 'int256' },
    ],
    name: 'UnexpectedBalanceDiff',
    type: 'error',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'postBalances',
        type: 'tuple[]',
      },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'preBalances',
        type: 'tuple[]',
      },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCall',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'postBalances',
        type: 'tuple[]',
      },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'preBalances',
        type: 'tuple[]',
      },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCallCalldata',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'diffs',
        type: 'tuple[]',
      },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCallCalldataDiffs',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'diffs',
        type: 'tuple[]',
      },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'int256', name: 'balance', type: 'int256' },
        ],
        internalType: 'struct IBalanceProxy.Balance[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCallDiffs',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'postBalances',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'preBalances',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCallMetadata',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'postBalances',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'preBalances',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCallMetadataCalldata',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'diffs',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCallMetadataCalldataDiffs',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'diffs',
        type: 'tuple[]',
      },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'approvals',
        type: 'tuple[]',
      },
      { internalType: 'address', name: 'target', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
      {
        components: [
          {
            components: [
              { internalType: 'address', name: 'target', type: 'address' },
              { internalType: 'address', name: 'token', type: 'address' },
              { internalType: 'int256', name: 'balance', type: 'int256' },
            ],
            internalType: 'struct IBalanceProxy.Balance',
            name: 'balance',
            type: 'tuple',
          },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
        ],
        internalType: 'struct IBalanceProxy.BalanceMetadata[]',
        name: 'withdrawals',
        type: 'tuple[]',
      },
    ],
    name: 'proxyCallMetadataDiffs',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'payable',
    type: 'function',
  },
  { stateMutability: 'payable', type: 'receive' },
] as const;
