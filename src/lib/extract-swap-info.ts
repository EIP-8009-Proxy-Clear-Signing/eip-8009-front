import { decodeAbiParameters, decodeFunctionData, Abi } from 'viem';

/**
 * Extracted swap information from Universal Router calldata
 */
export interface SwapInfo {
  /** Address of the input token being swapped */
  inputToken: `0x${string}`;
  /** Amount of input token (0 for exact output swaps) */
  inputAmount: bigint;
  /** Address of the output token (optional) */
  outputToken?: `0x${string}`;
}

/**
 * Uniswap V4 action identifiers used in swap extraction
 */
const V4_ACTIONS = {
  /** Transfer tokens from user to V4 PoolManager */
  SETTLE: 0x0b,
  /** Transfer tokens from V4 PoolManager to user */
  TAKE: 0x0e,
} as const;

/**
 * Extracts swap information from Universal Router calldata
 *
 * This function parses Universal Router transactions to determine:
 * - Which token is being swapped (input token)
 * - How much is being swapped (input amount)
 *
 * **Why We Need This**:
 * The proxy system needs to know the input token and amount to:
 * 1. Determine approval requirements
 * 2. Pre-transfer tokens to the router
 * 3. Validate balance sufficiency
 *
 * **Supported Swap Types**:
 * - **V4 Swaps** (0x10): Uniswap V4 with hooks
 * - **V3 Swaps** (0x00, 0x01): V3 concentrated liquidity
 * - **V2 Swaps** (0x08, 0x09): V2 AMM pools
 *
 * **Priority Order** (tries in sequence):
 * 1. V4_SWAP - Extracts from SETTLE action
 * 2. V3_SWAP - Extracts from swap parameters
 * 3. V2_SWAP - Extracts from path array
 *
 * **Fallback Behavior**:
 * If extraction fails or no swap commands found, returns null.
 * Caller should handle this case (e.g., use full balance for approval).
 *
 * @param txData - Universal Router transaction calldata
 * @param routerAbi - Universal Router contract ABI
 * @returns Swap info with input token and amount, or null if extraction fails
 *
 * @example
 * // Example: V3 swap (USDC → ETH)
 * const info = extractSwapInfo(txData, routerAbi);
 * // info: {
 * //   inputToken: "0xA0b86991..." (USDC address),
 * //   inputAmount: 1000000n (1 USDC with 6 decimals)
 * // }
 *
 * @example
 * // Example: V4 swap with hooks
 * const info = extractSwapInfo(txData, routerAbi);
 * // info: {
 * //   inputToken: "0xC02aaA39..." (WETH address),
 * //   inputAmount: 1000000000000000000n (1 WETH)
 * // }
 */
export function extractSwapInfo(
  txData: string,
  routerAbi: Abi
): SwapInfo | null {
  try {
    const decoded = decodeFunctionData({
      abi: routerAbi,
      data: txData as `0x${string}`,
    });

    if (decoded.functionName !== 'execute') {
      return null;
    }

    const [commands, inputs] = decoded.args as [string, string[]];

    // Parse commands to find swap types
    const commandList: number[] = [];
    const commandsHex = commands.slice(2);
    for (let i = 0; i < commandsHex.length; i += 2) {
      commandList.push(parseInt(commandsHex.slice(i, i + 2), 16));
    }

    // Try to extract from V4_SWAP (0x10)
    const v4Index = commandList.indexOf(0x10);
    if (v4Index !== -1) {
      const v4Info = extractV4SwapInfo(inputs[v4Index]);
      if (v4Info) return v4Info;
    }

    // Try to extract from V3_SWAP_EXACT_IN (0x00) or V3_SWAP_EXACT_OUT (0x01)
    const v3InIndex = commandList.indexOf(0x00);
    const v3OutIndex = commandList.indexOf(0x01);
    const v3Index = v3InIndex !== -1 ? v3InIndex : v3OutIndex;

    if (v3Index !== -1) {
      const v3Info = extractV3SwapInfo(inputs[v3Index]);
      if (v3Info) return v3Info;
    }

    // Try to extract from V2_SWAP_EXACT_IN (0x08) or V2_SWAP_EXACT_OUT (0x09)
    const v2InIndex = commandList.indexOf(0x08);
    const v2OutIndex = commandList.indexOf(0x09);
    const v2Index = v2InIndex !== -1 ? v2InIndex : v2OutIndex;

    if (v2Index !== -1) {
      const v2Info = extractV2SwapInfo(inputs[v2Index]);
      if (v2Info) return v2Info;
    }

    return null;
  } catch (error) {
    console.error('Failed to extract swap info:', error);
    return null;
  }
}

/**
 * Extracts swap information from Uniswap V4 swap command
 *
 * **V4 Architecture**:
 * V4 swaps use a "plan" structure with:
 * - **actions**: Array of action IDs (SWAP, SETTLE, TAKE, etc.)
 * - **params**: Encoded parameters for each action
 *
 * **SETTLE Action Structure**:
 * - currency (address): Token being settled
 * - amount (uint256): Amount to settle (0 = use open delta)
 * - payerIsUser (bool): Whether user pays or router pays
 *
 * **Special V4 Amounts**:
 * - `0`: Use contract balance / open delta from previous actions
 * - Non-zero: Explicit amount to settle
 *
 * **Why SETTLE?**:
 * SETTLE actions transfer input tokens from user → PoolManager.
 * This tells us which token is being spent and how much.
 *
 * @param v4Input - Encoded V4 plan (actions + params)
 * @returns Swap info with input token from SETTLE action, or null if not found
 *
 * @example
 * const info = extractV4SwapInfo(v4PlanBytes);
 * // info: {
 * //   inputToken: "0xA0b86991..." (USDC),
 * //   inputAmount: 1000000n
 * // }
 */
function extractV4SwapInfo(v4Input: string): SwapInfo | null {
  try {
    const planDecoded = decodeAbiParameters(
      [
        { name: 'actions', type: 'bytes' },
        { name: 'params', type: 'bytes[]' },
      ],
      v4Input as `0x${string}`
    );

    const actionsBytes = planDecoded[0];
    const params = planDecoded[1];

    // Parse actions
    const actions: number[] = [];
    const actionsHex = actionsBytes.slice(2);
    for (let j = 0; j < actionsHex.length; j += 2) {
      actions.push(parseInt(actionsHex.slice(j, j + 2), 16));
    }

    // Find SETTLE action to get input token and amount
    for (let j = 0; j < actions.length; j++) {
      if (actions[j] === V4_ACTIONS.SETTLE) {
        try {
          const settleParams = decodeAbiParameters(
            [
              { name: 'currency', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'payerIsUser', type: 'bool' },
            ],
            params[j] as `0x${string}`
          );

          const [currency, amount] = settleParams;

          console.log('V4 SETTLE decoded:', {
            currency,
            amount,
            amountHex: '0x' + amount.toString(16),
          });

          // V4 uses special sentinel values:
          // 0 means "use contract balance" (open delta from previous actions)
          // We need to check the actual swap amount from elsewhere
          return {
            inputToken: currency as `0x${string}`,
            inputAmount: amount as bigint,
          };
        } catch (error) {
          console.error('Failed to decode SETTLE params:', error);
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to extract V4 swap info:', error);
    return null;
  }
}

/**
 * Extracts swap information from Uniswap V3 swap command
 *
 * **V3 Swap Parameter Structure** (ABI-encoded):
 * - recipient (address): Who receives output tokens - 32 bytes
 * - amountIn (uint256): Input token amount - 32 bytes
 * - amountOutMin (uint256): Minimum output (slippage protection) - 32 bytes
 * - path (bytes): Encoded swap path with pool fees - dynamic
 * - payerIsUser (bool): Who provides input tokens - 32 bytes
 *
 * **V3 Path Format**:
 * The path is encoded as: `[token0][fee0][token1][fee1][token2]...`
 * - First 20 bytes (40 hex chars) = input token address
 * - Next 3 bytes = pool fee tier
 * - Next 20 bytes = intermediate/output token
 *
 * **Extraction Process**:
 * 1. Read amountIn from bytes 66-130
 * 2. Find path offset to locate path data
 * 3. Extract first 20 bytes of path = input token
 *
 * @param v3Input - Encoded V3 swap parameters
 * @returns Swap info with input token and amount, or null if decode fails
 *
 * @example
 * const info = extractV3SwapInfo(v3SwapBytes);
 * // info: {
 * //   inputToken: "0xA0b86991..." (USDC - first token in path),
 * //   inputAmount: 1000000n (amountIn parameter)
 * // }
 */
function extractV3SwapInfo(v3Input: string): SwapInfo | null {
  try {
    // V3 swap structure: (address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser)
    const inputData = '0x' + v3Input.slice(2);

    const amountIn = BigInt('0x' + inputData.slice(66, 130));
    const pathOffset = parseInt('0x' + inputData.slice(194, 258), 16);

    // Extract path to get input token
    const pathLengthHex = inputData.slice(
      2 + pathOffset * 2,
      2 + pathOffset * 2 + 64
    );
    const pathLength = parseInt(pathLengthHex, 16);
    const pathData = inputData.slice(
      2 + pathOffset * 2 + 64,
      2 + pathOffset * 2 + 64 + pathLength * 2
    );

    // First 20 bytes (40 hex chars) of path is the input token
    const inputToken = ('0x' + pathData.slice(0, 40)) as `0x${string}`;

    return {
      inputToken,
      inputAmount: amountIn,
    };
  } catch (error) {
    console.error('Failed to extract V3 swap info:', error);
    return null;
  }
}

/**
 * Extracts swap information from Uniswap V2 swap command
 *
 * **V2 Swap Parameter Structure** (ABI-encoded):
 * - recipient (address): Who receives output tokens - 32 bytes
 * - amountIn (uint256): Input token amount - 32 bytes
 * - amountOutMin (uint256): Minimum output (slippage protection) - 32 bytes
 * - path (address[]): Array of token addresses - dynamic array
 * - payerIsUser (bool): Who provides input tokens - 32 bytes
 *
 * **V2 Path Format**:
 * Unlike V3 (which encodes fees), V2 uses a simple address array:
 * - `[tokenA, tokenB, tokenC]` for multi-hop swaps
 * - First element = input token
 * - Last element = output token
 * - Intermediate elements = hop tokens
 *
 * **Extraction Process**:
 * 1. Read amountIn from bytes 66-130
 * 2. Find path offset to locate array data
 * 3. Read array length
 * 4. Extract first address from array = input token
 *
 * @param v2Input - Encoded V2 swap parameters
 * @returns Swap info with input token and amount, or null if decode fails
 *
 * @example
 * // Single-hop swap: USDC → WETH
 * const info = extractV2SwapInfo(v2SwapBytes);
 * // info: {
 * //   inputToken: "0xA0b86991..." (USDC - first in path array),
 * //   inputAmount: 1000000n (amountIn parameter)
 * // }
 *
 * @example
 * // Multi-hop swap: DAI → USDC → WETH
 * const info = extractV2SwapInfo(v2SwapBytes);
 * // info: {
 * //   inputToken: "0x6B175474..." (DAI - first in path [DAI, USDC, WETH]),
 * //   inputAmount: 1000000000000000000n
 * // }
 */
function extractV2SwapInfo(v2Input: string): SwapInfo | null {
  try {
    // V2 swap structure: (address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser)
    const inputData = '0x' + v2Input.slice(2);

    const amountIn = BigInt('0x' + inputData.slice(66, 130));
    const pathOffset = parseInt('0x' + inputData.slice(194, 258), 16);

    // Extract path array to get input token (first element)
    const pathArrayOffsetInData = 2 + pathOffset * 2;
    const pathArrayLength = parseInt(
      inputData.slice(pathArrayOffsetInData, pathArrayOffsetInData + 64),
      16
    );

    if (pathArrayLength > 0) {
      // First address in the path array
      const firstTokenHex = inputData.slice(
        pathArrayOffsetInData + 64 + 24,
        pathArrayOffsetInData + 64 + 64
      );
      const inputToken = ('0x' + firstTokenHex) as `0x${string}`;

      return {
        inputToken,
        inputAmount: amountIn,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to extract V2 swap info:', error);
    return null;
  }
}
