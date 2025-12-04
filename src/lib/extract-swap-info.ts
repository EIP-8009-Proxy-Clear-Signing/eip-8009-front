import { decodeAbiParameters, decodeFunctionData, Abi } from 'viem';

export interface SwapInfo {
  inputToken: `0x${string}`;
  inputAmount: bigint;
  outputToken?: `0x${string}`;
}

const V4_ACTIONS = {
  SETTLE: 0x0b,
  TAKE: 0x0e,
} as const;

/**
 * Extract token and amount information from Universal Router calldata
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
