import {
  decodeFunctionData,
  encodeFunctionData,
  encodeAbiParameters,
  decodeAbiParameters,
  Abi,
} from 'viem';
import { toast } from 'sonner';

export interface UniversalRouterContract {
  address: string;
  abi: Abi;
}

export const COMMAND_IDS = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  PERMIT2_TRANSFER_FROM: 0x02,
  PERMIT2_PERMIT_BATCH: 0x03,
  SWEEP: 0x04,
  TRANSFER: 0x05,
  PAY_PORTION: 0x06,
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,
  PERMIT2_PERMIT: 0x0a,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  PERMIT2_TRANSFER_FROM_BATCH: 0x0d,
  V4_SWAP: 0x10,
  LOOKS_RARE_721: 0x11,
} as const;

const V4_ACTIONS = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SWAP_EXACT_OUT_SINGLE: 0x08,
  SWAP_EXACT_OUT: 0x09,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
  TAKE_PORTION: 0x10,
  TAKE_PAIR: 0x11,
} as const;

export function isUniversalRouterTransaction(
  txTo: string | undefined,
  routerAddress: string
): boolean {
  return txTo?.toLowerCase() === routerAddress.toLowerCase();
}

export function parseCommands(commandsHex: string): number[] {
  const commandBytes = commandsHex.slice(2);
  const commandList: number[] = [];
  for (let i = 0; i < commandBytes.length; i += 2) {
    commandList.push(parseInt(commandBytes.substr(i, 2), 16));
  }
  return commandList;
}

export function checkIfHasWrapEthCommand(
  txData: `0x${string}`,
  routerAbi: Abi
): boolean {
  try {
    const decoded = decodeFunctionData({
      abi: routerAbi,
      data: txData as `0x${string}`,
    });
    if (decoded.functionName === 'execute' && decoded.args) {
      const [commands] = decoded.args as [string, string[], bigint];
      const commandBytes = commands.slice(2);
      for (let i = 0; i < commandBytes.length; i += 2) {
        if (parseInt(commandBytes.substr(i, 2), 16) === 0x0b) {
          return true;
          break;
        }
      }
    }
  } catch {
    // Ignore decode errors
  }

  return false;
}

export function logUniversalRouterCommands(
  txData: `0x${string}`,
  routerAbi: Abi
): void {
  try {
    const decoded = decodeFunctionData({
      abi: routerAbi,
      data: txData,
    });

    if (decoded?.functionName === 'execute' && decoded.args) {
      const [commands] = decoded.args as [string, string[], bigint];
      const commandList = parseCommands(commands);
      console.log('Universal Router commands:', commandList);
    }
  } catch {
    console.warn('Failed to decode Universal Router calldata');
  }
}

function modifyV4Swap(
  v4Input: string,
  index: number
): { modified: boolean; newInput: string } {
  try {
    console.log('🔵 Modifying V4_SWAP at index', index);

    const planDecoded = decodeAbiParameters(
      [
        { name: 'actions', type: 'bytes' },
        { name: 'params', type: 'bytes[]' },
      ],
      v4Input as `0x${string}`
    );

    const actionsBytes = planDecoded[0];
    const params = planDecoded[1];

    const actions: number[] = [];
    const actionsHex = actionsBytes.slice(2);
    for (let j = 0; j < actionsHex.length; j += 2) {
      actions.push(parseInt(actionsHex.slice(j, j + 2), 16));
    }

    const modifiedParams: `0x${string}`[] = [];
    let modified = false;

    for (let j = 0; j < actions.length; j++) {
      const action = actions[j];
      const param = params[j];

      if (action === V4_ACTIONS.SETTLE) {
        try {
          const settleParams = decodeAbiParameters(
            [
              { name: 'currency', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'payerIsUser', type: 'bool' },
            ],
            param as `0x${string}`
          );

          const [currency, amount] = settleParams;

          const newParam = encodeAbiParameters(
            [
              { name: 'currency', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'payerIsUser', type: 'bool' },
            ],
            [currency, amount, false]
          );

          modifiedParams.push(newParam);
          modified = true;
        } catch (error) {
          console.error('Failed to decode/modify SETTLE action:', error);
          modifiedParams.push(param as `0x${string}`);
        }
      } else {
        modifiedParams.push(param as `0x${string}`);
      }
    }

    if (modified) {
      const newV4Input = encodeAbiParameters(
        [
          { name: 'actions', type: 'bytes' },
          { name: 'params', type: 'bytes[]' },
        ],
        [actionsBytes, modifiedParams]
      );
      return { modified: true, newInput: newV4Input };
    } else {
      console.warn('⚠️ No SETTLE actions found or modified in V4 plan');
      toast.error(
        'V4 transaction may fail: No SETTLE actions could be modified for pre-transfer.'
      );
      return { modified: false, newInput: v4Input };
    }
  } catch (error) {
    console.error('❌ Failed to process V4_SWAP:', error);
    toast.error(
      'Failed to process V4 swap. The transaction may still work with pre-transfer.'
    );
    return { modified: false, newInput: v4Input };
  }
}

function modifyV3Swap(
  swapInput: string,
  index: number,
  shouldKeepInRouter: boolean,
  userAddress: string,
  commandName: string
): string {
  console.log(`🔄 Modifying ${commandName} at index ${index}`);

  const inputData = '0x' + swapInput.slice(2);

  const recipient = '0x' + inputData.slice(2, 66).slice(24);
  const amount1 = '0x' + inputData.slice(66, 130);
  const amount2 = '0x' + inputData.slice(130, 194);
  const pathOffset = '0x' + inputData.slice(194, 258);
  const payerIsUserOld = BigInt('0x' + inputData.slice(258, 322)) === 1n;

  console.log('Old recipient:', recipient);
  console.log('Old payerIsUser:', payerIsUserOld);

  const pathOffsetInt = parseInt(pathOffset, 16);
  const pathLengthHex = inputData.slice(
    2 + pathOffsetInt * 2,
    2 + pathOffsetInt * 2 + 64
  );
  const pathLength = parseInt(pathLengthHex, 16);
  const pathData = inputData.slice(
    2 + pathOffsetInt * 2 + 64,
    2 + pathOffsetInt * 2 + 64 + pathLength * 2
  );

  let newRecipient: string;
  if (shouldKeepInRouter) {
    newRecipient =
      '0000000000000000000000000000000000000000000000000000000000000002';
    console.log(
      'New recipient: ADDRESS_THIS (0x02) - tokens will be processed by downstream commands'
    );
  } else {
    newRecipient = userAddress.slice(2).toLowerCase().padStart(64, '0');
    console.log('New recipient:', '0x' + newRecipient.slice(24));
  }
  const newPayerIsUser = '0'.padStart(64, '0');

  console.log('New payerIsUser:', false);

  const newInput =
    '0x' +
    newRecipient +
    amount1.slice(2) +
    amount2.slice(2) +
    pathOffset.slice(2) +
    newPayerIsUser +
    pathLengthHex +
    pathData;

  console.log(`✅ Modified ${commandName} input`);
  return newInput;
}

function modifyV2Swap(
  swapInput: string,
  index: number,
  shouldKeepInRouter: boolean,
  userAddress: string,
  commandName: string
): string {
  console.log(`🔄 Modifying ${commandName} at index ${index}`);

  const inputData = '0x' + swapInput.slice(2);

  const recipient = '0x' + inputData.slice(2, 66).slice(24);
  const amount1 = '0x' + inputData.slice(66, 130);
  const amount2 = '0x' + inputData.slice(130, 194);
  const pathOffset = '0x' + inputData.slice(194, 258);
  const payerIsUserOld = BigInt('0x' + inputData.slice(258, 322)) === 1n;

  console.log('Old recipient:', recipient);
  console.log('Old payerIsUser:', payerIsUserOld);

  const pathOffsetInt = parseInt(pathOffset, 16);
  const pathArrayLengthHex = inputData.slice(
    2 + pathOffsetInt * 2,
    2 + pathOffsetInt * 2 + 64
  );
  const pathArrayLength = parseInt(pathArrayLengthHex, 16);
  const pathArrayData = inputData.slice(
    2 + pathOffsetInt * 2 + 64,
    2 + pathOffsetInt * 2 + 64 + pathArrayLength * 64
  );

  let newRecipient: string;
  if (shouldKeepInRouter) {
    newRecipient =
      '0000000000000000000000000000000000000000000000000000000000000002';
    console.log(
      'New recipient: ADDRESS_THIS (0x02) - tokens will be processed by downstream commands'
    );
  } else {
    newRecipient = userAddress.slice(2).toLowerCase().padStart(64, '0');
    console.log('New recipient:', '0x' + newRecipient.slice(24));
  }
  const newPayerIsUser = '0'.padStart(64, '0');

  console.log('New payerIsUser:', false);

  const newInput =
    '0x' +
    newRecipient +
    amount1.slice(2) +
    amount2.slice(2) +
    pathOffset.slice(2) +
    newPayerIsUser +
    pathArrayLengthHex +
    pathArrayData;

  console.log(`✅ Modified ${commandName} input`);
  return newInput;
}

export function modifyUniversalRouterCalldata(
  txData: `0x${string}`,
  router: UniversalRouterContract,
  userAddress: string
): `0x${string}` {
  console.group('🔧 Modifying Universal Router calldata');

  try {
    const decoded = decodeFunctionData({
      abi: router.abi,
      data: txData,
    });

    if (decoded.functionName === 'execute' && decoded.args) {
      const [commands, inputs, deadline] = decoded.args as [
        string,
        string[],
        bigint,
      ];

      const commandList = parseCommands(commands);

      console.log(
        'Original commands:',
        commandList.map((c) => '0x' + c.toString(16).padStart(2, '0'))
      );
      console.log('Original inputs count:', inputs.length);

      const newCommands = [...commandList];
      const newInputs = [...inputs];

      const permit2PermitIndex = commandList.indexOf(
        COMMAND_IDS.PERMIT2_PERMIT
      );
      if (permit2PermitIndex !== -1) {
        console.log(
          `🗑️  Removing PERMIT2_PERMIT command at index ${permit2PermitIndex}`
        );
        newCommands.splice(permit2PermitIndex, 1);
        newInputs.splice(permit2PermitIndex, 1);
      }

      const hasUnwrapWeth = newCommands.includes(COMMAND_IDS.UNWRAP_WETH);
      const hasWrapEth = newCommands.includes(COMMAND_IDS.WRAP_ETH);
      const hasPayPortion = newCommands.includes(COMMAND_IDS.PAY_PORTION);
      const hasSweep = newCommands.includes(COMMAND_IDS.SWEEP);

      const shouldKeepInRouter = hasUnwrapWeth || hasPayPortion || hasSweep;

      console.log(`Has UNWRAP_WETH: ${hasUnwrapWeth}`);
      console.log(`Has WRAP_ETH: ${hasWrapEth}`);
      console.log(`Has PAY_PORTION: ${hasPayPortion}`);
      console.log(`Has SWEEP: ${hasSweep}`);
      console.log(`Should keep tokens in router: ${shouldKeepInRouter}`);

      for (let i = 0; i < newCommands.length; i++) {
        const command = newCommands[i];

        if (command === COMMAND_IDS.V4_SWAP) {
          const { modified, newInput } = modifyV4Swap(newInputs[i], i);
          if (modified) {
            newInputs[i] = newInput;
          }
          continue;
        }

        if (
          command === COMMAND_IDS.V3_SWAP_EXACT_IN ||
          command === COMMAND_IDS.V3_SWAP_EXACT_OUT
        ) {
          const commandName =
            command === COMMAND_IDS.V3_SWAP_EXACT_IN
              ? 'V3_SWAP_EXACT_IN'
              : 'V3_SWAP_EXACT_OUT';
          newInputs[i] = modifyV3Swap(
            newInputs[i],
            i,
            shouldKeepInRouter,
            userAddress,
            commandName
          );
        }

        if (
          command === COMMAND_IDS.V2_SWAP_EXACT_IN ||
          command === COMMAND_IDS.V2_SWAP_EXACT_OUT
        ) {
          const commandName =
            command === COMMAND_IDS.V2_SWAP_EXACT_IN
              ? 'V2_SWAP_EXACT_IN'
              : 'V2_SWAP_EXACT_OUT';
          newInputs[i] = modifyV2Swap(
            newInputs[i],
            i,
            shouldKeepInRouter,
            userAddress,
            commandName
          );
        }
      }

      const newCommandsHex =
        '0x' + newCommands.map((c) => c.toString(16).padStart(2, '0')).join('');

      console.log('New commands:', newCommandsHex);
      console.log('New inputs count:', newInputs.length);

      const newData = encodeFunctionData({
        abi: router.abi,
        functionName: 'execute',
        args: [
          newCommandsHex as `0x${string}`,
          newInputs as `0x${string}`[],
          deadline,
        ],
      });

      console.log('✅ Successfully modified calldata');
      console.log('Old data length:', txData.length);
      console.log('New data length:', newData.length);

      console.groupEnd();
      return newData;
    }

    console.groupEnd();
    return txData;
  } catch (error) {
    console.error('❌ Failed to modify Universal Router calldata:', error);
    console.error(error);
    console.groupEnd();
    return txData;
  }
}
