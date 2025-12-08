# EIP-8009 Proxy Frontend

A secure DeFi transaction wrapper that intercepts, modifies, and validates transactions before execution. This frontend implements the EIP-8009 Balance Proxy standard, enabling seamless integration with existing DeFi protocols (like Uniswap) while adding comprehensive balance checks and approval management.

**Documentation**: [Docs](https://erc8009.xyz/) - Official EIP-8009 Proxy Standard Documentation

## 🎯 Overview

This application acts as a **Safe Apps SDK-compatible interface** that wraps DeFi transactions (currently optimized for Uniswap Universal Router) with security checks and balance validations through a proxy contract. It modifies transaction calldata to redirect token flows through the proxy while preserving the original transaction intent.

### Key Features

- **Transaction Interception**: Captures transactions from embedded DApps (via iframe)
- **Calldata Modification**: Rewrites transaction data to work with proxy contracts
- **Two-Phase Simulation**: Validates original and modified transactions
- **Balance Validation**: Enforces pre/post-transaction balance checks
- **Approval Management**: Handles ERC-20 approvals, transfers, and EIP-2612 permits
- **Multi-Mode Support**: Diffs mode (balance changes) and Pre/Post mode (absolute balances)
- **Gas Estimation**: Accurate gas calculation for ETH balance checks
- **Safe Integration**: Compatible with Safe (Gnosis Safe) multisig wallets

---

## 🔄 Transaction Flow

### Architecture Overview

```
User → Embedded DApp (Uniswap) → Proxy Interception → Transaction Modification → Balance Validation → Execution
```

### Step-by-Step Process

#### 1. **Transaction Capture** (`impersonator-iframe.tsx`)

The application embeds DApps in an iframe and impersonates a Safe wallet:

```typescript
// Listens for Safe Apps SDK messages from the iframe
handleMessage(event) → {
  getSafeInfo: Returns mock/real Safe info
  sendTransactions: Intercepts transaction requests
  rpcCall: Proxies RPC calls to wallet
  signMessage/signTypedData: Handles signatures
}
```

When a user initiates a swap on Uniswap, the transaction is captured via `sendTransactions` method.

#### 2. **Transaction Analysis** (`setDataToForm` in `tx-options.tsx`)

**Phase 1: Original Transaction Simulation**
- Simulates the original Uniswap transaction to extract approval amounts
- May fail due to Permit2 validation (expected)
- Extracts token addresses and swap parameters

```typescript
// Step 2: Simulate ORIGINAL transaction
const { success, result } = await simulateOriginalTransaction({
  publicClient, address, tx
});

// Step 4: Extract swap info
const swapInfo = extractSwapInfo(tx.data, uniswapRouter.abi);
const { approvalAmount, inputTokenAddress } = await determineApprovalAmount({
  hasOriginalSimulation, originalSimRes, swapInfo
});
```

**Phase 2: Calldata Modification**
- For Uniswap Universal Router, modifies the calldata to work with proxy
- Replaces user address with proxy address in recipient fields
- Modifies V3/V4 swap parameters to use proxy as payer

```typescript
// Step 3: Modify transaction calldata
if (isUniversalRouter) {
  modifiedData = modifyUniversalRouterCalldata(tx.data, uniswapRouter, address);
}
```

**Key Modification**: For V4 swaps, the `SETTLE` action's `payerIsUser` flag is changed from `true` to `false`, redirecting token flow through the proxy.

#### 3. **Router Selection** (`tx-options.tsx`)

The system selects the appropriate router based on transaction requirements:

```typescript
// Priority order:
// 1. PermitRouter - All tokens support EIP-2612 permit (gasless)
// 2. ApproveRouter - Tokens need transfers (Universal Router)
// 3. Proxy - Basic approval-only flow (fallback)

if (shouldUsePermitRouter) {
  // Uses permitProxyCallDiffsMeta / permitProxyCallWithMeta
} else if (shouldUseApproveRouter) {
  // Uses approveProxyCallDiffsWithMeta / approveProxyCallWithMeta
} else {
  // Uses proxyCallDiffsMeta / proxyCallMeta
}
```

#### 4. **Modified Transaction Simulation** (`simulation-utils.ts`)

Simulates the modified transaction through the proxy to get actual balance changes:

```typescript
const simRes = await simulateModifiedTransaction({
  publicClient,
  address,
  simulationContract, // permitRouter, approveRouter, or proxy
  simulationData,     // Encoded function call with empty checks
  txValue
});

// Extract asset changes
const { from, to, gasUsed } = extractAssetChanges(simRes);
```

The simulation returns:
- `from`: Token being spent (address, symbol, decimals, pre/post/diff values)
- `to`: Token being received (address, symbol, decimals, pre/post/diff values)
- `gasUsed`: Gas consumed by the transaction

#### 5. **Balance Validation Setup** (`form-utils.ts`)

Based on the selected mode, the system creates balance checks:

**Diffs Mode** (balance changes):
```typescript
// Check 1: Minimum received tokens (with slippage)
requiredReceived = diff * (1 - slippage)

// Check 2: Maximum spent tokens (with slippage)
requiredSpent = -diff * (1 + slippage)
```

**Pre/Post Mode** (absolute balances):
```typescript
// Pre-transfer checks (UI only - not validated on-chain)
preCheck[0] = to.value.pre   // Initial balance of received token
preCheck[1] = from.value.pre // Initial balance of spent token

// Post-transfer checks (validated on-chain)
postCheck[0] = pre + diff * (1 - slippage) // Min final balance received
postCheck[1] = pre + diff * (1 + slippage) - gasUsed // Min final balance spent (ETH only)
```

**Gas Accounting**: For ETH transactions in Pre/Post mode, gas fees are subtracted from the expected final balance:
```typescript
if (isFromEth) {
  minFinalBalance = pre + maxExpectedLoss - estimatedGas;
}
```

#### 6. **Approval/Permit Handling** (`approval-utils.ts`)

**Standard Approval Flow**:
```typescript
// Check current allowance
const currentAllowance = await publicClient.readContract({
  address: tokenAddress,
  functionName: 'allowance',
  args: [userAddress, spenderAddress]
});

// Request approval if needed
if (currentAllowance < requiredAmount) {
  await sendTransactionAsync({
    to: tokenAddress,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spenderAddress, requiredAmount]
    })
  });
}
```

**EIP-2612 Permit Flow** (gasless):
```typescript
// Generate permit signature
const permitData = await generatePermitSignature(
  tokenAddress,
  owner,
  spender,
  amount,
  deadline,
  publicClient,
  walletClient
);

// Permit signature includes: v, r, s, deadline
// Submitted alongside transaction, no separate approval tx needed
```

#### 7. **Transaction Execution** (`handleSave` in `tx-options.tsx`)

**For Regular Wallets**:
```typescript
// Example: Diffs mode with Approve Router
await writeContractAsync({
  address: approveRouter.address,
  functionName: 'approveProxyCallDiffsWithMeta',
  args: [
    proxy.address,
    diffs,              // Balance change checks
    approvals,          // Token approvals with useTransfer flags
    tx.to,              // Original target (Uniswap Router)
    modifiedData,       // Modified calldata
    withdrawals         // Withdrawal instructions
  ],
  value: ethValue
});
```

**For Safe Wallets**:
```typescript
await safe.txs.send({
  txs: [{
    to: targetContract.address,
    data: encodedFunctionCall,
    value: ethValue
  }]
});
// Returns safeTxHash - transaction queued for multisig approval
```

#### 8. **On-Chain Execution** (Proxy Contract)

The proxy contract executes in this order:

1. **Apply Approvals**: 
   - If `useTransfer=true`: Transfers tokens from user to proxy
   - If `useTransfer=false`: Approves target contract to spend proxy's tokens

2. **Execute Transaction**: Calls the target contract (Uniswap Router) with modified calldata

3. **Validate Diffs/Post-Checks**: 
   - Compares actual balance changes vs expected
   - Reverts if checks fail (slippage exceeded, insufficient balance)

4. **Execute Withdrawals**: Transfers specified tokens back to user

---

## 📦 Project Structure

```
src/
├── components/
│   ├── tx-options.tsx              # Main transaction UI & orchestration
│   ├── impersonator-iframe.tsx     # DApp embedding & Safe SDK emulation
│   └── ui/                          # UI components (shadcn/ui)
│
├── lib/
│   ├── simulation-utils.ts          # Transaction simulation logic
│   ├── approval-utils.ts            # ERC-20 approval & permit handling
│   ├── balance-utils.ts             # Balance checking & validation
│   ├── form-utils.ts                # Check population & gas calculation
│   ├── token-utils.ts               # Token metadata fetching
│   ├── simulation-data-builder.ts   # Proxy call encoding
│   ├── uniswap-router.ts            # Universal Router calldata modification
│   ├── extract-swap-info.ts         # Swap parameter extraction
│   ├── permit-utils.ts              # EIP-2612 permit signatures
│   └── contracts.ts                 # Contract ABIs & addresses
│
├── hooks/
│   ├── use-checks.ts                # Balance check state management
│   └── use-modal-promise.ts         # Transaction modal control
│
└── providers/
    └── safe-app-provider.tsx        # Safe Apps SDK integration
```

### Key Modules

| Module | Purpose |
|--------|---------|
| `simulation-utils.ts` | Simulates original & modified transactions, extracts balance changes |
| `uniswap-router.ts` | Parses and modifies Universal Router calldata (V3/V4 swaps) |
| `approval-utils.ts` | Manages ERC-20 approvals and EIP-2612 permits |
| `form-utils.ts` | Populates balance checks with slippage, handles ETH gas accounting |
| `simulation-data-builder.ts` | Encodes proxy function calls for different routers |

---

## 🛠️ Technical Details

### Slippage System

The application uses **dual slippage** based on mode:

- **Diffs Mode**: 0.5% default (snapshots balance at execution time)
- **Pre/Post Mode**: 3.0% default (accounts for pool state drift between simulation and execution)

Higher slippage in Pre/Post mode is necessary because:
- Simulation captures balance at block N
- Execution happens at block N+X
- AMM pool state changes between simulation and execution
- Pre/Post checks use simulation-time balances, creating 1%+ deviation

### Gas Estimation

Gas is estimated from the **original transaction** (not the proxy call):

```typescript
estimatedGas = await publicClient.estimateGas({
  account: address,
  to: tx.to,           // Original target (Uniswap Router)
  data: tx.data,       // Original calldata
  value: BigInt(tx.value || 0)
});
```

This provides accurate gas for the underlying transaction. The proxy overhead is minimal.

### Transaction Modes

#### Diffs Mode
- **Validates**: Token balance changes (deltas)
- **Best for**: Most swaps, simpler logic
- **On-chain**: `proxyCallDiffsMeta`, `approveProxyCallDiffsWithMeta`, `permitProxyCallDiffsWithMeta`

#### Pre/Post Mode
- **Validates**: Absolute token balances before/after
- **Best for**: Complex multi-step transactions
- **On-chain**: `proxyCallMeta`, `approveProxyCallWithMeta`, `permitProxyCallWithMeta`
- **UI Only**: Pre-transfer checks display initial balances (not sent to contract)
- **Validated**: Post-transfer checks enforce minimum final balances

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A wallet (MetaMask, Rabby, etc.)
- Access to Ethereum testnet or mainnet

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Usage

1. **Connect Wallet**: Click "Connect" in the top-right
2. **Enter DApp URL**: Default is `https://app.uniswap.org/swap`
3. **Configure Slippage**: Adjust in settings (0.5% for diffs, 3% for pre/post recommended)
4. **Execute Swap**: 
   - Perform swap in embedded Uniswap
   - Review balance checks in modal
   - Confirm transaction

---

## 🔍 Debugging

### Common Issues

**"Gas estimation failed"**: 
- The original transaction requires approvals that don't exist yet
- Solution: System falls back to simulation gas estimate

**"Execution reverted: ERC20: transfer amount exceeds allowance"**:
- Token hasn't been approved for proxy
- Solution: Approve token in the UI before executing

**Pre/Post checks fail with low slippage**:
- Pool state changed between simulation and execution
- Solution: Increase slippage to 1-3% for pre/post mode

### Console Debugging

Enable detailed logs by checking the browser console:

```javascript
// Transaction simulation
"Simulating original transaction..."
"Simulating modified transaction through proxy..."

// Calldata modification
"🔵 Modifying V4_SWAP at index X"
"Universal Router commands: [0x00, 0x10, 0x0b]"

// Balance checks
{ slippage, minExpectedGain, pre, minFinalBalanceTo, gasUsed, gasConst }
```
