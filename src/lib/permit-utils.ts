import { PublicClient, parseAbi, WalletClient } from 'viem';

/**
 * ABI for EIP-2612 permit functions
 *
 * EIP-2612 adds gasless approval functionality to ERC-20 tokens via
 * off-chain signatures. This ABI includes the core permit functions.
 */
const PERMIT_ABI = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function name() view returns (string)',
]);

/**
 * Checks if a token supports EIP-2612 permit
 *
 * EIP-2612 is an extension to ERC-20 that allows approvals via signatures
 * instead of transactions. Not all tokens support it.
 *
 * **Detection Method**:
 * - Attempts to read `DOMAIN_SEPARATOR()` from the token contract
 * - If call succeeds and returns a value, token supports permit
 * - If call fails, token doesn't support permit
 *
 * **Common Tokens With Permit Support**:
 * - USDC (uses version "2")
 * - DAI (uses version "1")
 * - WETH (uses version "1")
 *
 * **Common Tokens Without Permit Support**:
 * - Some older ERC-20 tokens
 * - Tokens deployed before EIP-2612 was standardized
 *
 * @param tokenAddress - Token contract address to check
 * @param publicClient - Viem public client for blockchain queries
 * @returns True if token supports EIP-2612 permit, false otherwise
 *
 * @example
 * const canPermit = await supportsPermit(USDC, publicClient);
 * // canPermit: true (USDC supports EIP-2612)
 *
 * if (canPermit) {
 *   // Use permit flow (gasless approval)
 * } else {
 *   // Use standard approval (requires transaction)
 * }
 */
export async function supportsPermit(
  tokenAddress: `0x${string}`,
  publicClient: PublicClient
): Promise<boolean> {
  try {
    // Try to read the permit function signature and DOMAIN_SEPARATOR
    const [domainSeparator] = await publicClient.multicall({
      contracts: [
        {
          address: tokenAddress,
          abi: PERMIT_ABI,
          functionName: 'DOMAIN_SEPARATOR',
          args: [],
        },
      ],
      allowFailure: true,
    });

    // If DOMAIN_SEPARATOR exists and didn't fail, the token likely supports permit
    return domainSeparator.status === 'success' && !!domainSeparator.result;
  } catch (error) {
    console.warn(`Token ${tokenAddress} does not support permit:`, error);
    return false;
  }
}

/**
 * Gets the current nonce for permit signing
 *
 * Each permit signature requires a nonce to prevent replay attacks. The nonce
 * increments with each permit used, similar to transaction nonces.
 *
 * **Why Nonces Matter**:
 * - Prevents signature reuse (replay attacks)
 * - Each permit signature is unique and can only be used once
 * - Nonce automatically increments when permit is executed
 *
 * @param tokenAddress - Token contract address
 * @param owner - Owner address whose nonce to check
 * @param publicClient - Viem public client
 * @returns Current nonce value
 *
 * @example
 * const nonce = await getPermitNonce(USDC, userAddress, publicClient);
 * // nonce: 0n (user hasn't used permits before)
 * // After first permit: 1n
 * // After second permit: 2n
 */
export async function getPermitNonce(
  tokenAddress: `0x${string}`,
  owner: `0x${string}`,
  publicClient: PublicClient
): Promise<bigint> {
  const nonce = await publicClient.readContract({
    address: tokenAddress,
    abi: PERMIT_ABI,
    functionName: 'nonces',
    args: [owner],
  });

  return nonce;
}

/**
 * Gets the EIP-712 domain separator for permit signing
 *
 * The domain separator is a hash that uniquely identifies a contract on a
 * specific chain. It prevents permit signatures from being used on different
 * contracts or chains.
 *
 * @param tokenAddress - Token contract address
 * @param publicClient - Viem public client
 * @returns Domain separator bytes32 hash
 *
 * @example
 * const separator = await getDomainSeparator(USDC, publicClient);
 * // separator: "0x..." (unique hash for USDC on this chain)
 */
export async function getDomainSeparator(
  tokenAddress: `0x${string}`,
  publicClient: PublicClient
): Promise<`0x${string}`> {
  const domainSeparator = await publicClient.readContract({
    address: tokenAddress,
    abi: PERMIT_ABI,
    functionName: 'DOMAIN_SEPARATOR',
    args: [],
  });

  return domainSeparator;
}

/**
 * Permit signature data (v, r, s components)
 *
 * EIP-2612 permits use ECDSA signatures split into three components:
 * - **v**: Recovery ID (27 or 28)
 * - **r**: First 32 bytes of signature
 * - **s**: Second 32 bytes of signature
 */
export interface PermitData {
  /** Signature deadline (Unix timestamp) */
  deadline: bigint;
  /** Signature recovery ID (27 or 28) */
  v: number;
  /** First 32 bytes of signature */
  r: `0x${string}`;
  /** Second 32 bytes of signature */
  s: `0x${string}`;
}

/**
 * Generates an EIP-2612 permit signature for gasless token approval
 *
 * **What is EIP-2612 Permit?**
 * Instead of sending an approval transaction (costs gas), users sign a message
 * off-chain that grants approval. The signature is then submitted along with
 * the actual transaction, allowing approve + action in a single transaction.
 *
 * **Benefits**:
 * - ✅ No separate approval transaction needed
 * - ✅ No gas cost for approval
 * - ✅ Better UX (one transaction instead of two)
 * - ✅ Works across different wallets and dApps
 *
 * **EIP-712 Typed Data Structure**:
 * The signature is for a structured message containing:
 * - **Domain**: Token name, version, chainId, verifyingContract
 * - **Permit**: owner, spender, value, nonce, deadline
 *
 * **Version Detection**:
 * - USDC uses version "2"
 * - Most other tokens use version "1"
 * - Version must match what the contract expects or signature will fail
 *
 * **Signature Components**:
 * - The signed message produces a 65-byte signature
 * - Split into: r (32 bytes), s (32 bytes), v (1 byte)
 * - v is normalized to 27 or 28 (Ethereum standard)
 *
 * @param tokenAddress - Token contract address
 * @param owner - Token owner (user signing the permit)
 * @param spender - Address that will be approved to spend tokens
 * @param value - Amount to approve
 * @param deadline - Signature expiration (Unix timestamp)
 * @param publicClient - Viem public client for contract queries
 * @param walletClient - Viem wallet client for signing
 * @returns Permit signature data (v, r, s, deadline)
 *
 * @example
 * const permit = await generatePermitSignature(
 *   USDC,
 *   userAddress,
 *   permitRouterAddress,
 *   1000000n, // 1 USDC (6 decimals)
 *   BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour deadline
 *   publicClient,
 *   walletClient
 * );
 * // permit: { deadline: 1234567890n, v: 27, r: "0x...", s: "0x..." }
 *
 * // Use in transaction:
 * await permitRouter.permitProxyCall([permit], ...);
 * // Approval happens automatically via signature verification
 */
export async function generatePermitSignature(
  tokenAddress: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`,
  value: bigint,
  deadline: bigint,
  publicClient: PublicClient,
  walletClient: WalletClient
): Promise<PermitData> {
  // Get the nonce
  const nonce = await getPermitNonce(tokenAddress, owner, publicClient);

  // Get token name for EIP-712 domain
  const tokenName = await publicClient.readContract({
    address: tokenAddress,
    abi: PERMIT_ABI,
    functionName: 'name',
    args: [],
  });

  // Get chain ID
  const chainId = await publicClient.getChainId();

  // Determine version - USDC uses "2", most others use "1"
  const version = tokenName === 'USD Coin' || tokenName === 'USDC' ? '2' : '1';

  // EIP-712 typed data for permit
  const typedData = {
    domain: {
      name: tokenName,
      version,
      chainId,
      verifyingContract: tokenAddress,
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit' as const,
    message: {
      owner,
      spender,
      value,
      nonce,
      deadline,
    },
  };

  console.log('Generating permit signature:', {
    tokenAddress,
    tokenName,
    version,
    owner,
    spender,
    value: value.toString(),
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    chainId,
  });

  // Sign the typed data
  const signature = await walletClient.signTypedData({
    account: owner,
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });

  // Parse signature into v, r, s components
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  let v = parseInt(signature.slice(130, 132), 16);

  // Normalize v to 27 or 28 if it's 0 or 1
  if (v < 27) {
    v += 27;
  }

  // console.log('Permit signature generated:', { v, r, s, signature });

  return {
    deadline,
    v,
    r,
    s,
  };
}

/**
 * Generates permit signatures for multiple tokens
 *
 * Batch version of `generatePermitSignature()` that handles multiple tokens.
 * Useful when a transaction requires approvals for multiple tokens.
 *
 * **Behavior**:
 * - Checks each token for permit support
 * - Generates signature for tokens that support it
 * - Returns null for tokens that don't support permit
 * - Continues on errors (doesn't fail entire batch)
 *
 * **Use Case**:
 * Multi-hop swaps where you need approvals for intermediate tokens.
 * Example: DAI → USDC → WETH (need permit for DAI)
 *
 * @param tokens - Array of token approvals (token address + amount)
 * @param spender - Address that will be approved to spend tokens
 * @param owner - Token owner (user signing permits)
 * @param publicClient - Viem public client
 * @param walletClient - Viem wallet client for signing
 * @param deadline - Optional deadline (defaults to 1 hour from now)
 * @returns Array of permit signatures (null for unsupported tokens or errors)
 *
 * @example
 * const permits = await generatePermitSignatures(
 *   [
 *     { token: USDC, amount: 1000000n },
 *     { token: DAI, amount: 1000000000000000000n }
 *   ],
 *   permitRouterAddress,
 *   userAddress,
 *   publicClient,
 *   walletClient
 * );
 * // permits: [
 * //   { deadline: ..., v: 27, r: "0x...", s: "0x..." }, // USDC permit
 * //   { deadline: ..., v: 28, r: "0x...", s: "0x..." }  // DAI permit
 * // ]
 */
export async function generatePermitSignatures(
  tokens: Array<{
    token: `0x${string}`;
    amount: bigint;
  }>,
  spender: `0x${string}`,
  owner: `0x${string}`,
  publicClient: PublicClient,
  walletClient: WalletClient,
  deadline?: bigint
): Promise<(PermitData | null)[]> {
  const defaultDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
  const permitDeadline = deadline ?? defaultDeadline;

  const signatures: (PermitData | null)[] = [];

  for (const { token, amount } of tokens) {
    try {
      // Check if token supports permit
      const supportsPermitFlag = await supportsPermit(token, publicClient);

      if (!supportsPermitFlag) {
        console.log(`Token ${token} does not support permit`);
        signatures.push(null);
        continue;
      }

      // Generate permit signature
      const signature = await generatePermitSignature(
        token,
        owner,
        spender,
        amount,
        permitDeadline,
        publicClient,
        walletClient
      );

      signatures.push(signature);
    } catch (error) {
      console.error(`Failed to generate permit for token ${token}:`, error);
      signatures.push(null);
    }
  }

  return signatures;
}
