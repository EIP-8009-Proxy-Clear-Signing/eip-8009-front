// Quick reference for USDC permit domain parameters
// USDC on Ethereum mainnet and most chains uses version "2" not "1"

export const USDC_PERMIT_CONFIG = {
  // USDC uses version "2" for EIP-712 domain
  version: '2',

  // USDC uses "USD Coin" as the name
  name: 'USD Coin',
};

// Some tokens use different versions:
// - Most ERC20Permit tokens: version "1"
// - USDC: version "2"
// - DAI: has custom permit implementation with different type structure

export const PERMIT_VERSIONS: Record<string, string> = {
  // Default
  default: '1',

  // Known overrides (by token name or symbol)
  'USD Coin': '2',
  USDC: '2',
};

/**
 * Helper to verify permit signature parameters match what the contract expects
 * This can be used for debugging permit signature failures
 */
export function logPermitDebugInfo(params: {
  tokenName: string;
  tokenAddress: string;
  owner: string;
  spender: string;
  value: string;
  nonce: string;
  deadline: string;
  chainId: number;
  version: string;
}) {
  console.group('🔍 Permit Signature Debug Info');
  console.log('Token:', params.tokenName, `(${params.tokenAddress})`);
  console.log('Owner:', params.owner);
  console.log('Spender:', params.spender);
  console.log('Value:', params.value);
  console.log('Nonce:', params.nonce);
  console.log(
    'Deadline:',
    params.deadline,
    new Date(Number(params.deadline) * 1000).toISOString()
  );
  console.log('Chain ID:', params.chainId);
  console.log('Version:', params.version);
  console.groupEnd();
}
