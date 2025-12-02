import { encodeFunctionData, Abi } from 'viem';
import { PermitData } from './permit-utils';

export interface BuildSimulationDataParams {
  willUsePermit: boolean;
  shouldUseApproveRouter: boolean;
  permitSignature: PermitData | null;
  proxy: { address: string; abi: Abi };
  permitRouter: { abi: Abi };
  targetContract: { abi: Abi };
  approvals: Array<{
    balance: {
      target: `0x${string}`;
      token: `0x${string}`;
      balance: bigint;
    };
    useTransfer: boolean;
  }>;
  txTo: string;
  modifiedData: string;
}

/**
 * Builds the simulation data based on which router is being used
 * Returns the encoded function data for simulation
 */
export function buildSimulationData(
  params: BuildSimulationDataParams
): `0x${string}` {
  const {
    willUsePermit,
    shouldUseApproveRouter,
    permitSignature,
    proxy,
    permitRouter,
    targetContract,
    approvals,
    txTo,
    modifiedData,
  } = params;

  console.log('📋 Simulation config:', {
    shouldUseApproveRouter,
    willUsePermit,
    hasPermitSignature: !!permitSignature,
    approvals: approvals.map((a) => ({
      target: a.balance.target,
      token: a.balance.token,
      balance: a.balance.balance.toString(),
      useTransfer: a.useTransfer,
    })),
    txTo: txTo,
    modifiedDataLength: modifiedData.length,
  });

  if (willUsePermit && permitSignature) {
    // Use PermitRouter for simulation with the permit signature
    return encodeFunctionData({
      abi: permitRouter.abi,
      functionName: 'permitProxyCallDiffsWithMeta',
      args: [
        proxy.address,
        [],
        approvals,
        [permitSignature],
        txTo,
        modifiedData,
        [],
      ],
    }) as `0x${string}`;
  } else if (shouldUseApproveRouter && approvals.length > 0) {
    // Use ApproveRouter for simulation since we have approvals now
    return encodeFunctionData({
      abi: targetContract.abi,
      functionName: 'approveProxyCallDiffsWithMeta',
      args: [proxy.address, [], approvals, txTo, modifiedData, []],
    }) as `0x${string}`;
  } else {
    // Use basic proxy
    return encodeFunctionData({
      abi: proxy.abi,
      functionName: 'proxyCallDiffsMeta',
      args: [[], approvals, txTo, modifiedData, []],
    }) as `0x${string}`;
  }
}
