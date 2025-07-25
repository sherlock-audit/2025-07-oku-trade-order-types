# Automated Order System Contracts

This repository contains the smart contracts for an automated trading system, designed to execute orders as they come within range. There are two primary types of orders supported by the system: **Bracket Orders** and **Stop Limit Orders**.

See the [full docs](https://docs.oku.trade/home/advanced-orders) for more information.


## Automation

The Automation Master contract is designed to be monitored by Chainlink Automation-type systems. Anyone can fill any of the orders as long as the order is eligible and they provide the necessary assets to satisfy the slippage requirements. The token-out assets are sent to the user as part of the upkeep function.

## Order Types

### 1. Bracket Orders
A **Bracket Order** executes an automated swap when either the `takeProfit` or `stopPrice` conditions are met. The purpose of a Bracket Order is to allow traders to define both a profit target (`takeProfit`) and a stop loss (`stopPrice`) in a single transaction. The order is filled when either of these price conditions is reached, swapping the input token (`tokenIn`) for the output token (`tokenOut`).

- **`takeProfit`**: The execution price at which a profit target is reached.
- **`stopPrice`**: The price at which the order is closed to limit losses.

### 2. Stop Limit Orders
A **Stop Limit Order** is used to trigger the creation of a new Bracket Order when the `stopLimitPrice` condition is met. Once the stop limit price is reached, a Bracket Order is automatically created using the same unique `orderId` and parameters such as `takeProfit` and `stopPrice`. 

- **Shared Order ID**: Both the Stop Limit Order and the resulting Bracket Order share the same `orderId` for easy tracking and management.

### 3. Additional Order Types

By manipulating the `stopPrice` or the `takeProfit` in a **Bracket Order**, two more order types can be functionally replicated. 

1. **Limit Order**: By setting the `stopPrice` to 0, the system will have functionally created a standard **limit order**. This order type will only execute when the `takeProfit` is reached.
  
2. **Stop Loss Order**: By setting the `takeProfit` to the maximum possible value (`2 ** 256 - 1`), the system will have functionally created a **stop loss order**. This order type executes when the `stopPrice` is reached to minimize potential losses.

## Example Orders

For all examples, assume `WETH` price is `$3000`

### Bracket Order
1. User holds `1 WETH` and creates a **Bracket Order**, with a `takeProfit` set to `3200` and a `stopPrice` set to `2500`.
2. If either of these are reached, the user's `1 WETH` will be automaticly swapped to how ever much `USDC` can be bought at that price

### Take Profit Order
1. User holds `1 WETH` and creates a **Bracket Order**, with a `takeProfit` set to `3200` and a `stopPrice` set to `0`.
2. In this scenario, the user will never sell their `WETH` until the `takeProfit` is reached

### Stop Loss Order
1. User holds `1 WETH` and creates a **Bracket Order**, with a `takeProfit` set to `(2^256) - 1` and a `stopPrice` set to `2800`.
2. In this scenario, the user will hold their `WETH` until the price has dropped to the `stopPrice`, at which point they will sell for `USDC`

### Stop Limit Order
1. User holds `3000 USDC` and creates a **Stop Limit Order**  with a `stopLimitPrice` set to `2800`
2. Once this price is reached, the **Stop Limit Order** is filled, creating a new **Bracket Order**. This new **Bracket Order** will share the same `orderId` as the **Stop Limit Order**
3. Suppose this new **Bracket Order** has a `stopPrice` at `2500`, and `WETH` continues to fall to this price. 
4. Once this price is reached, the **Bracket Order** will be filled, and the user's `USDC` will be swapped to `WETH`

### Stop Limit Order with 'Swap-On-Fill'
1. User holds `2800 USDC` and creates a **Stop Limit Order**  with a `stopLimitPrice` set to `2800` and `swapOnFill` set to `true`
2. Once this price is reached, the **Stop Limit Order** is filled, swapping the `2800 USDC` for `1 WETH` and creating a new **Bracket Order**. This new **Bracket Order** will share the same `orderId` as the **Stop Limit Order**
3. Suppose this new **Bracket Order** has a `takeProfit` at `3000`, and `WETH` bounces back to this price. 
4. Once this price is reached, the **Bracket Order** will be filled, and the user's `1 WETH` will be swapped back to `3000 USDC`, and the user has profited ~`200 USDC`


## Order Creation

- **Bracket Order Creation**:
    ```solidity
    function createOrder(
        bytes calldata swapPayload,     // Optional data for executing a swap when the Stop Limit order is filled
        uint256 takeProfit,             // Price to trigger take-profit.
        uint256 stopPrice,              // Price to trigger stop-loss.
        uint256 amountIn,               // Amount of tokenIn to sell when conditions are met.
        IERC20 tokenIn,                 // Token to sell
        IERC20 tokenOut,                // Token to buy.
        address recipient,              // Address to receive tokenOut once the order is filled.
        uint16 takeProfitSlippage,      // Slippage tolerance for take-profit price, defined simply in basis points.
        uint16 stopSlippage,            // Slippage tolerance for stop-loss price, defined simply in basis points.
        bool permit,                    // Indicates whether Permit2 is used for token approvals.
        bytes calldata permitPayload    // Permit2 signature payload for approval-less token transfers.
    ) external;
    ```

- **Stop Limit Order Creation**:
    ```solidity
    function createOrder(
        uint256 stopLimitPrice,         // Price to trigger the Stop Limit order.
        uint256 takeProfit,             // Target price for the resulting Bracket Order to take profit.
        uint256 stopPrice,              // Stop-loss price for the resulting Bracket Order.
        uint256 amountIn,               // Amount of tokenIn to sell when conditions are met.
        IERC20 tokenIn,                 // Token to sell.
        IERC20 tokenOut,                // Token to buy.
        address recipient,              // Address to receive tokenOut once the order is filled.
        uint16 takeProfitSlippage,      // Slippage tolerance for the take-profit price in the Bracket Order.
        uint16 stopSlippage,            // Slippage tolerance for the stop-loss price in the Bracket Order.
        uint16 swapSlippage,            // Slippage tolerance for the initial swap when the Stop Limit order is filled.
        bool swapOnFill,                // Determines if the tokens should be swapped immediately after the Stop Limit order is filled.
        bool permit,                    // Indicates whether Permit2 is used for token approvals.
        bytes calldata permitPayload    // Permit2 signature payload for approval-less token transfers.
    ) external;
    ```

## Oracles

Oracles are expected to return a USD price in 1e8 terms, so the price of USDC should be returned as ~1e8 or ~`100000000`

## Testing

Tests are performed as if on Optimism.

In order to run the tests, create a .env file and add a MAINNET_URL and OP_URL and assign these to the appropriate RPC addresses. Here is an example .env file: 

```
MAINNET_URL="https://rpc.ankr.com/eth"
OP_URL="https://rpc.ankr.com/optimismi"
```
Then the tests can then be run by ```npm run test```

## Audit Scope

### Primary Concerns
1. The intent is to place zero trust in the data returned by off chain automation, such that the contracts control all aspects of security. This is the primary concern: Is there any ability for mailicious `target` or `txData` to be used to compromise user funds? This would be a critical vulnerability. 
2. Issues related to `maxPendingOrders` with regard to denial of service attacks. There are mechanisms to mitigate these risks, it is unclear if they are sufficient (order creation fee, checkUpkeep optionally being able to skip stale orders, etc)


### General Notes
1. The mechanism to determine `direction`, as well as the terms `takeProfitPrice` and `stopPrice` are intentionally arbitrary, the contract intentionally has no concept of what a "good" trade vs a "bad" one, and these can be used interchangibly. 
2. The owner of these contracts will be an Oku company multisig wallet. 
3. There exists a separate permission to whitelist targets, this is to allow more flexible whitelist capability without the need to go through a multisig each time. This permission will be retained by internal personnel to Oku.  
4. Contracts are not intended to be upgradeable. This adds confidence to users as the contracts will not change while their funds are in them. 
5. Orders placed on these contracts are publicly fillable. Any trader, MEV actor, or other automation system may participate in filling orders. Initially, [Adrastia](https://adrastia.io/) is monitoring the contracts for orders with their robust system. Dispite following a ChainLink automation compatible interface, these contracts are not expected to work with off-the-shelf ChainLink keepers. 

### Parameters
1. `maxPendingOrders` is set to 150
2. `orderFee` is generally expected to target around $0.25 in the native gas token, 0.0001 ETH. 
3. `minOrderSize` is defined in USD 1e8 terms (like oracle prices) and is set to $25 

### Scope
1. Gas related issues related to iterating are generally not in scope, as this will only be deployed to high performance L2 networks. 
2. All ERC20 tokens (and USDT) are considered in scope, with the exception of any fee-on-transfer tokens, tax tokens, and rebasing tokens. 
3. The contract is expected to handle all aspects of accounting and verification before and after the swap to ensure the route provided by the caller of `performUpkeep()` is effective at satisfying the fill conditions of the order. 
4. MEV / Frontrunning issues are generally out of scope so long as their risks can be adequately mitigated with the current levers available. To completely deter front running attacks, a slippage of 0 can potentially be used, which will ensure that there is no room to front run, with the consequence of needing a slightly 'better' effective price on the router in order for the order to fill. 
5. Tokens and Routers are whitelisted for security, specifically in order to avoid malicious external calls by manipulating the `target` and/or `txData`. Any potential points of failure that require a malicious `target` or malicious tokens to be listed should likely be considered infomrational, as this point of failure can be considered operational security. 
6. Only orders that can be filled per their user specified parameters (prices, slippage, etc) should be fillable, if any such orders are fillable outside these parameters, then this would be a vulnerability. 
7. Oracle Providers are assumed to serve high quality data, currently only ChainLink on chain oracles are used. Oracles are assumed to return a USD price in 1e8 terms. Issues related to stale or otherwise incorrect responses from external oracles are considered to be out of scope
8. Contract owners should not be able to steal user funds. User funds should only exist on `Bracket`, `StopLimit`, or `OracleLess`. Collected fees should only exist on `AutomationMaster`. There is the option for admins to cancel user orders and waive the refund, this is to remove broken or stale orders, should such issues arise. The funds from orders cancelled in this way will be locked on the contract and are not available to be stolen by anyone. 