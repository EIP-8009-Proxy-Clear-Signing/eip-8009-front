import {
  ClearSignContextType,
  type ClearSignContext,
  type ContextModule,
  type TypedDataClearSignContext,
} from "@ledgerhq/context-module";

import { externalPluginPayload, findErc8009Binding } from "./binding";
import { isTransactionInput, tokenLoader } from "./token-loader";

type Loader = {
  canHandle(input: unknown, expectedTypes: ClearSignContextType[]): boolean;
  load(input: never): Promise<ClearSignContext[]>;
};

const bindingLoader = {
  canHandle: (input: unknown, expectedTypes: ClearSignContextType[]) =>
    isTransactionInput(input) &&
    expectedTypes.includes(ClearSignContextType.ETHEREUM_EXTERNAL_PLUGIN),
  load: async (input: {
    to: string;
    selector: string;
    chainId: number;
  }): Promise<ClearSignContext[]> => {
    const binding = findErc8009Binding(input.chainId, input.to, input.selector);
    if (!binding) return [];
    return [
      {
        type: ClearSignContextType.ETHEREUM_EXTERNAL_PLUGIN,
        payload: externalPluginPayload(binding.address, binding.selector),
      },
    ];
  },
};

const LOADERS: readonly Loader[] = [tokenLoader, bindingLoader];

export function createErc8009ContextModule(): ContextModule {
  return {
    async getContexts<TInput>(input: TInput, expectedTypes?: ClearSignContextType[]) {
      if (!isTransactionInput(input)) return [];
      const types = expectedTypes ?? Object.values(ClearSignContextType);
      const active = LOADERS.filter((loader) => loader.canHandle(input, types));
      const loaded = await Promise.all(active.map((loader) => loader.load(input as never)));
      return loaded.flat();
    },
    async getFieldContext(_field: unknown, expectedType: ClearSignContextType) {
      return {
        type: ClearSignContextType.ERROR,
        error: new Error(`ERC-8009 context module: no field loader (${expectedType})`),
      };
    },
    async getTypedDataFilters(): Promise<TypedDataClearSignContext> {
      return { type: "error", error: new Error("ERC-8009 context module: no EIP-712 filters") };
    },
    async report() {},
  };
}
