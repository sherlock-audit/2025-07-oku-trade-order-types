# Oku Trade Order Types contest details

- Join [Sherlock Discord](https://discord.gg/MABEWyASkp)
- Submit findings using the **Issues** page in your private contest repo (label issues as **Medium** or **High**)
- [Read for more details](https://docs.sherlock.xyz/audits/watsons)

# Q&A

### Q: On what chains are the smart contracts going to be deployed?
Optimism 
___

### Q: If you are integrating tokens, are you allowing only whitelisted tokens to work with the codebase or any complying with the standard? Are they assumed to have certain properties, e.g. be non-reentrant? Are there any types of [weird tokens](https://github.com/d-xo/weird-erc20) you want to integrate?
Only standard tokens and USDT are considered in-scope.
___

### Q: Are there any limitations on values set by admins (or other roles) in the codebase, including restrictions on array lengths?
Owner is trusted. 

TargetSetter is a trusted role, that will set targets. 

Off-chain automation shouldn't be able to steal any user funds. If they are, this can be viewed as the a valid issue.
___

### Q: Are there any limitations on values set by admins (or other roles) in protocols you integrate with, including restrictions on array lengths?
No
___

### Q: Is the codebase expected to comply with any specific EIPs?
No
___

### Q: Are there any off-chain mechanisms involved in the protocol (e.g., keeper bots, arbitrage bots, etc.)? We assume these mechanisms will not misbehave, delay, or go offline unless otherwise specified.
There will be an off chain mechanism for executing transactions in an automated way. This system has no privileged access to the contracts, and anyone can perform it's duties if desired.
___

### Q: What properties/invariants do you want to hold even if breaking them has a low/unknown impact?
No
___

### Q: Please discuss any design choices you made.
We are incorporating an optional permit2 flow, so it is possible to use either legacy ERC20 approve or permit2. 
No native tokens. 

Due to the arbitrary nature of the external calls made by these contracts, there are multiple layers of checks and controls, some of which are costly in gas to perform. We chose to forgo gas savings and efficiency in favor of having this robustness against failure or loss of funds. 

This system is not intended to be a decentralized protocol but instead a centralized trading platform, managed by a US based company. As such, any issues related to compromised admins, incorrectly whitelisted targets or tokens, etc, should be considered operational security requirements and as such should be an informational finding at most. 
___

### Q: Please provide links to previous audits (if any) and all the known issues or acceptable risks.
https://audits.sherlock.xyz/contests/641?filter=questions
https://github.com/ObsidianAudits/audits/blob/main/2025-07-Oku-Obsidian-Audit.pdf
___

### Q: Please list any relevant protocol resources.
https://docs.oku.trade/home/advanced-orders

The readme has lots of good info
___

### Q: Additional audit information.
1. The intent is to place zero trust in the data returned by off chain automation, such that the contracts control all aspects of security. 
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



# Audit scope

[oku-custom-order-types @ 391d2843794e31d61090a87660a52e703c112463](https://github.com/gfx-labs/oku-custom-order-types/tree/391d2843794e31d61090a87660a52e703c112463)
- [oku-custom-order-types/contracts/automatedTrigger/AutomationMaster.sol](oku-custom-order-types/contracts/automatedTrigger/AutomationMaster.sol)
- [oku-custom-order-types/contracts/automatedTrigger/Bracket.sol](oku-custom-order-types/contracts/automatedTrigger/Bracket.sol)
- [oku-custom-order-types/contracts/automatedTrigger/IAutomation.sol](oku-custom-order-types/contracts/automatedTrigger/IAutomation.sol)
- [oku-custom-order-types/contracts/automatedTrigger/OracleLess.sol](oku-custom-order-types/contracts/automatedTrigger/OracleLess.sol)
- [oku-custom-order-types/contracts/automatedTrigger/StopLimit.sol](oku-custom-order-types/contracts/automatedTrigger/StopLimit.sol)


