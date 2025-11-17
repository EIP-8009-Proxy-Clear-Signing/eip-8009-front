import { PublicClient, parseAbi, WalletClient } from 'viem';

const PERMIT_ABI = parseAbi([
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function name() view returns (string)',
]);

/**
 * Check if a token supports EIP-2612 permit
 * @param tokenAddress The token contract address
 * @param publicClient The viem public client
 * @returns true if the token supports permit, false otherwise
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
 * Get the current nonce for an address
 * @param tokenAddress The token contract address
 * @param owner The owner address
 * @param publicClient The viem public client
 * @returns The current nonce
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
 * Get the domain separator for permit signing
 * @param tokenAddress The token contract address
 * @param publicClient The viem public client
 * @returns The domain separator
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

export interface PermitData {
  deadline: bigint;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

/**
 * Generate permit signature data using EIP-2612
 * @param tokenAddress The token contract address
 * @param owner The owner address (user's wallet)
 * @param spender The spender address (contract that will spend tokens)
 * @param value The amount to approve
 * @param deadline The permit deadline (unix timestamp)
 * @param publicClient The viem public client
 * @param walletClient The viem wallet client for signing
 * @returns The permit signature data (v, r, s)
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

  console.log('🔏 Generating permit signature:', {
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

  console.log('✅ Permit signature generated:', { v, r, s, signature });

  return {
    deadline,
    v,
    r,
    s,
  };
}

/**
 * Generate permit signatures for multiple tokens
 * @param tokens Array of token approvals with amount and decimals
 * @param spender The spender address (usually a router contract)
 * @param owner The owner address (user's wallet)
 * @param publicClient The viem public client
 * @param walletClient The viem wallet client
 * @param deadline Optional deadline (defaults to 1 hour from now)
 * @returns Array of permit signatures (null for tokens that don't support permit)
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
