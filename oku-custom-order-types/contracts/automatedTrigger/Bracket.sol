// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IAutomation.sol";
import "../interfaces/uniswapV3/IPermit2.sol";
import "../interfaces/openzeppelin/Ownable.sol";
import "../interfaces/openzeppelin/IERC20.sol";
import "../interfaces/openzeppelin/SafeERC20.sol";
import "../interfaces/openzeppelin/ReentrancyGuard.sol";
import "../interfaces/openzeppelin/Pausable.sol";
import "../interfaces/openzeppelin/EnumerableSet.sol";

///@notice This contract owns and handles all logic associated with the following order types:
/// BRACKET_ORDER - automated fill at a fixed takeProfit price OR stop price, with independent slippage for each option
/// LIMIT_ORDER - BRACKET_ORDER at specified take profit price, with STOP set to 0
/// STOP_ORDER - BRACKET_ORDER at specified stop price, with take profit set to type(uint256).max
/// In order to configure a LIMIT_ORDER or STOP_ORDER, simply set the take profit or stop price to either 0 for the lower bound or 2^256 - 1 for the upper bound
contract Bracket is Ownable, IBracket, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.AddressSet;

    IAutomationMaster public immutable MASTER;
    IPermit2 public immutable permit2;

    mapping(uint96 => Order) public orders;
    EnumerableSet.UintSet private dataSet;

    constructor(IAutomationMaster _master, IPermit2 _permit2, address owner) {
        MASTER = _master;
        permit2 = _permit2;
        _transferOwnership(owner);
    }

    modifier paysFee() {
        uint256 orderFee = MASTER.orderFee();
        require(msg.value == orderFee, "Insufficient funds for order fee");
        _;
        // Transfer the fee to the contract owner
        (bool success, ) = payable(address(MASTER)).call{value: orderFee}("");
        require(success, "Failed to forward fee to master");
    }

    function pause(bool __pause) external override {
        require(
            msg.sender == address(MASTER) || msg.sender == owner(),
            "Not Authorized"
        );
        if (__pause) {
            _pause();
        } else {
            _unpause();
        }
    }

    function getPendingOrders()
        external
        view
        returns (Order[] memory pendingOrders)
    {
        pendingOrders = new Order[](dataSet.length());
        for (uint256 i; i < dataSet.length(); i++) {
            pendingOrders[i] = orders[uint96(dataSet.at(i))];
        }
    }

    function getSpecificPendingOrders(
        uint256 start,
        uint256 count
    ) external view returns (Order[] memory) {
        uint256 len = dataSet.length();
        if (start >= len) {
            return new Order[](0);
        }

        uint256 end = start + count;
        if (end > len) {
            end = len;
        }

        Order[] memory ordersSubset = new Order[](end - start);
        for (uint256 i = start; i < end; i++) {
            ordersSubset[i - start] = orders[uint96(dataSet.at(i))];
        }
        return ordersSubset;
    }

    function checkUpkeep(
        bytes calldata checkData
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint96 i = 0;
        uint96 length = uint96(dataSet.length());
        if (checkData.length == 64) {
            //decode start and end idxs
            (i, length) = abi.decode(checkData, (uint96, uint96));
            if (length > uint96(dataSet.length())) {
                length = uint96(dataSet.length());
            }
        }
        for (i; i < length; i++) {
            Order memory order = orders[uint96(dataSet.at(i))];
            (
                bool inRange,
                bool takeProfit,
                uint256 exchangeRate
            ) = checkInRange(order);
            if (inRange) {
                return (
                    true,
                    abi.encode(
                        MasterUpkeepData({
                            orderType: OrderType.BRACKET,
                            target: address(this),
                            txData: "0x",
                            pendingOrderIdx: i,
                            orderId: order.orderId,
                            tokenIn: order.tokenIn,
                            tokenOut: order.tokenOut,
                            slippage: takeProfit
                                ? order.takeProfitSlippage
                                : order.stopSlippage, //bips based on take profit or stop fill
                            amountIn: order.amountIn,
                            exchangeRate: exchangeRate
                        })
                    )
                );
            }
        }
    }

    ///@notice recipient of swap should be this contract,
    ///as we need to account for tokens received.
    ///This contract will then forward the tokens to the user
    ///target refers to some contract where when we send @param performData,
    ///that contract will exchange our tokenIn for tokenOut with at least minAmountReceived
    ///pendingOrderIdx is the index of the pending order we are executing,
    ///pending order is removed from the active set.
    function performUpkeep(
        bytes calldata performData
    ) external override nonReentrant whenNotPaused {
        MasterUpkeepData memory data = abi.decode(
            performData,
            (MasterUpkeepData)
        );
        require(dataSet.contains(data.orderId), "order not active");
        Order memory order = orders[data.orderId];

        //deduce if we are filling stop or take profit
        (bool inRange, bool takeProfit, ) = checkInRange(order);
        require(inRange, "order ! in range");

        //deduce bips
        uint16 bips = takeProfit
            ? order.takeProfitSlippage
            : order.stopSlippage;

        uint256[] memory initBalances = verifyTokenBalances(
            new uint256[](0),
            order.tokenIn,
            order.tokenOut
        );
        (uint256 swapAmountOut, uint256 tokenInRefund) = execute(
            data.target,
            data.txData,
            order.amountIn,
            order.tokenIn,
            order.tokenOut,
            bips,
            order.feeBips
        );
        verifyTokenBalances(initBalances, order.tokenIn, order.tokenOut);

        //handle accounting
        //remove from pending dataSet
        require(dataSet.remove(order.orderId), "order not active");

        //handle fee
        (uint256 feeAmount, uint256 adjustedAmount) = applyFee(
            swapAmountOut,
            order.feeBips
        );

        if (feeAmount != 0) {
            order.tokenOut.safeTransfer(address(MASTER), feeAmount);
        }

        //send tokenOut to recipient
        order.tokenOut.safeTransfer(order.recipient, adjustedAmount);

        //refund any unspent tokenIn
        //this should generally be 0 when using exact input for swaps, which is recommended
        if (tokenInRefund != 0) {
            order.tokenIn.safeTransfer(order.recipient, tokenInRefund);
        }

        //emit
        emit BracketOrderProcessed(
            order.orderId,
            adjustedAmount,
            tokenInRefund
        );
    }

    function fillStopLimitOrder(
        bytes calldata swapPayload,
        uint256 takeProfit,
        uint256 stopPrice,
        uint256 amountIn,
        uint96 existingOrderId,
        IERC20 tokenIn,
        IERC20 tokenOut,
        address recipient,
        uint16 existingFeeBips,
        uint16 takeProfitSlippage,
        uint16 stopSlippage
    ) external override nonReentrant whenNotPaused {
        require(
            msg.sender == address(MASTER.STOP_LIMIT_CONTRACT()),
            "Only Stop Limit"
        );
        _initializeOrder(
            swapPayload,
            takeProfit,
            stopPrice,
            amountIn,
            existingOrderId,
            tokenIn,
            tokenOut,
            recipient,
            existingFeeBips,
            takeProfitSlippage,
            stopSlippage,
            true, //flag for stop limit order
            new bytes(0)
        );
    }

    ///@notice see @IBracket
    function createOrder(
        bytes calldata swapPayload,
        uint256 takeProfit,
        uint256 stopPrice,
        uint256 amountIn,
        IERC20 tokenIn,
        IERC20 tokenOut,
        address recipient,
        uint16 feeBips,
        uint16 takeProfitSlippage,
        uint16 stopSlippage,
        bytes calldata permitPayload
    ) external payable override nonReentrant whenNotPaused paysFee {
        _initializeOrder(
            swapPayload,
            takeProfit,
            stopPrice,
            amountIn,
            0, //no existing order id
            tokenIn,
            tokenOut,
            recipient,
            feeBips,
            takeProfitSlippage,
            stopSlippage,
            false,
            permitPayload
        );
    }

    ///@notice see @IBracket
    function modifyOrder(
        uint96 orderId,
        uint256 _takeProfit,
        uint256 _stopPrice,
        uint256 amountInDelta,
        IERC20 _tokenOut,
        address _recipient,
        uint16 _takeProfitSlippage,
        uint16 _stopSlippage,
        bool increasePosition,
        bytes calldata permitPayload
    ) external payable override nonReentrant whenNotPaused paysFee {
        //get order
        Order memory order = orders[orderId];
        require(dataSet.contains(order.orderId), "order not active");

        //only order owner
        require(msg.sender == order.recipient, "only order owner");
        require(_recipient != address(0), "recipient == zero address");

        //deduce any amountIn changes
        uint256 newAmountIn = order.amountIn;
        if (amountInDelta != 0) {
            if (increasePosition) {
                newAmountIn += amountInDelta;
                procureTokens(
                    order.tokenIn,
                    amountInDelta,
                    msg.sender,
                    permitPayload
                );
            } else {
                //ensure delta is valid
                require(amountInDelta <= order.amountIn, "invalid delta");

                //set new amountIn for accounting
                newAmountIn -= amountInDelta;

                //check min order size for new amount
                MASTER.checkMinOrderSize(order.tokenIn, newAmountIn);

                //refund position partially
                order.tokenIn.safeTransfer(order.recipient, amountInDelta);
            }
        }

        require(
            _takeProfitSlippage <= 10000 && _stopSlippage <= 10000,
            "BIPS > 10k"
        );

        //check for oracles
        if (_tokenOut != order.tokenOut) {
            require(
                address(MASTER.oracles(_tokenOut)) != address(0),
                "Oracle !exist"
            );
        }
        require(order.tokenIn != _tokenOut, "tokenIn == tokenOut");

        //construct new order
        Order memory newOrder = Order({
            orderId: orderId,
            takeProfit: _takeProfit,
            stopPrice: _stopPrice,
            amountIn: newAmountIn,
            tokenIn: order.tokenIn,
            tokenOut: _tokenOut,
            feeBips: order.feeBips,
            takeProfitSlippage: _takeProfitSlippage,
            stopSlippage: _stopSlippage,
            recipient: _recipient
        });

        //store new order
        orders[orderId] = newOrder;

        emit BracketOrderModified(orderId);
    }

    ///@notice allow administrator to cancel any order
    ///@notice once cancelled, any funds assocaiated with the order are returned to the order recipient
    ///@notice only pending orders can be cancelled
    function adminCancelOrder(
        uint96 orderId
    ) external onlyOwner nonReentrant {
        Order memory order = orders[orderId];
        _cancelOrder(order, true);
    }

    ///@notice only the order recipient can cancel their order
    ///@notice only pending orders can be cancelled
    function cancelOrder(uint96 orderId) external nonReentrant whenNotPaused {
        Order memory order = orders[orderId];
        require(msg.sender == order.recipient, "Only Order Owner");
        _cancelOrder(order, true);
    }

    ///@notice sweep dust accumulated from precision loss in getMinAmountReceived calculations
    ///@notice can only be called when no pending orders exist to prevent theft of user funds
    function sweepDust(IERC20 token, address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        require(dataSet.length() == 0, "Cannot sweep with pending orders");
        
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No funds to sweep");
        
        token.safeTransfer(recipient, balance);
    }

    function procureTokens(
        IERC20 token,
        uint256 amount,
        address tokenOwner,
        bytes memory permitPayload
    ) internal {
        if (permitPayload.length > 0) {
            require(amount < type(uint160).max, "uint160 overflow");
            IAutomation.Permit2Payload memory payload = abi.decode(
                permitPayload,
                (IAutomation.Permit2Payload)
            );

            require(
                payload.permitTransferFrom.permitted.token == address(token),
                "permit token mismatch"
            );

            IPermit2.SignatureTransferDetails memory transferDetails = IPermit2
                .SignatureTransferDetails({
                    to: address(this),
                    requestedAmount: amount
                });

            permit2.permitTransferFrom(
                payload.permitTransferFrom,
                transferDetails,
                tokenOwner,
                payload.signature
            );
        } else {
            token.safeTransferFrom(tokenOwner, address(this), amount);
        }
    }

    function _initializeOrder(
        bytes calldata swapPayload,
        uint256 takeProfit,
        uint256 stopPrice,
        uint256 amountIn,
        uint96 existingOrderId,
        IERC20 tokenIn,
        IERC20 tokenOut,
        address recipient,
        uint16 feeBips,
        uint16 takeProfitSlippage,
        uint16 stopSlippage,
        bool stopLimit,
        bytes memory permitPayload
    ) internal {
        //determine if we are doing a swap first
        if (swapPayload.length != 0) {
            SwapParams memory swapParams = abi.decode(
                swapPayload,
                (SwapParams)
            );
            //procure swap token in
            procureTokens(
                swapParams.swapTokenIn,
                swapParams.swapAmountIn,
                msg.sender,
                permitPayload
            );

            _createOrderWithSwap(
                swapParams,
                takeProfit,
                stopPrice,
                existingOrderId,
                tokenIn,
                tokenOut,
                recipient,
                feeBips,
                takeProfitSlippage,
                stopSlippage,
                stopLimit
            );
        } else {
            //no swap
            procureTokens(tokenIn, amountIn, msg.sender, permitPayload);

            _createOrder(
                takeProfit,
                stopPrice,
                amountIn,
                existingOrderId,
                tokenIn,
                tokenOut,
                recipient,
                feeBips,
                takeProfitSlippage,
                stopSlippage,
                stopLimit
            );
        }
    }

    function _createOrderWithSwap(
        SwapParams memory swapParams,
        uint256 takeProfit,
        uint256 stopPrice,
        uint96 existingOrderId,
        IERC20 tokenIn,
        IERC20 tokenOut,
        address recipient,
        uint16 feeBips,
        uint16 takeProfitSlippage,
        uint16 stopSlippage,
        bool stopLimit
    ) internal {
        require(swapParams.swapSlippage <= 10000, "BIPS > 10k");

        uint256[] memory initBalances = verifyTokenBalances(
            new uint256[](0),
            swapParams.swapTokenIn,
            tokenIn
        );
        //execute the swap
        (uint256 swapAmountOut, uint256 tokenInRefund) = execute(
            swapParams.swapTarget,
            swapParams.txData,
            swapParams.swapAmountIn,
            swapParams.swapTokenIn,
            tokenIn,
            swapParams.swapSlippage,
            0 // No protocol fee applied to initial swap during order creation
        );
        verifyTokenBalances(initBalances, swapParams.swapTokenIn, tokenIn);

        _createOrder(
            takeProfit,
            stopPrice,
            swapAmountOut,
            existingOrderId,
            tokenIn,
            tokenOut,
            recipient,
            feeBips,
            takeProfitSlippage,
            stopSlippage,
            stopLimit
        );
        //refund any unspent tokenIn
        //this should generally be 0 when using exact input for swaps, which is recommended
        if (tokenInRefund != 0) {
            swapParams.swapTokenIn.safeTransfer(recipient, tokenInRefund);
        }
    }

    function _createOrder(
        uint256 takeProfit,
        uint256 stopPrice,
        uint256 amountIn,
        uint96 existingOrderId,
        IERC20 tokenIn,
        IERC20 tokenOut,
        address recipient,
        uint16 feeBips,
        uint16 takeProfitSlippage,
        uint16 stopSlippage,
        bool stopLimit
    ) internal {
        //verify both oracles exist, as we need both to calc the exchange rate
        require(
            address(MASTER.oracles(tokenIn)) != address(0) &&
                address(MASTER.oracles(tokenOut)) != address(0),
            "Oracle !exist"
        );
        require(
            dataSet.length() < MASTER.maxPendingOrders(),
            "Max Order Count Reached"
        );
        require(
            stopSlippage <= 10000 &&
                takeProfitSlippage <= 10000 &&
                feeBips <= 10000,
            "BIPS > 10k"
        );
        require(recipient != address(0), "recipient == zero address");
        require(tokenIn != tokenOut, "tokenIn == tokenOut");
        require(amountIn != 0, "amountIn == 0");

        //don't check minOrderSize when filling stop limit order
        if (!stopLimit) {
            MASTER.checkMinOrderSize(tokenIn, amountIn);
        }

        //generate random but unique order id if there is not an existing orderId from a stop limit order
        if (existingOrderId == 0) {
            existingOrderId = MASTER.generateOrderId(msg.sender);
        }

        //construct order
        orders[existingOrderId] = Order({
            orderId: existingOrderId,
            takeProfit: takeProfit,
            stopPrice: stopPrice,
            amountIn: amountIn,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            recipient: recipient,
            takeProfitSlippage: takeProfitSlippage,
            feeBips: feeBips,
            stopSlippage: stopSlippage
        });

        //store pending order
        dataSet.add(existingOrderId);

        emit BracketOrderCreated(existingOrderId);
    }

    function _cancelOrder(Order memory order, bool refund) internal {
        //remove from pending set
        require(dataSet.remove(order.orderId), "order not active");

        //refund tokenIn amountIn to recipient
        if (refund) {
            order.tokenIn.safeTransfer(order.recipient, order.amountIn);
        }
        //emit event
        emit BracketOrderCancelled(order.orderId);
    }

    ///@notice execute swap transaction
    ///@param target is the contract to which we are sending @param txData to perform the swap
    ///@param tokenIn is the token to sell for @param tokenOut
    ///@param bips ensures that we received at least the minimum amount of @param tokenOut after the swap
    function execute(
        address target,
        bytes memory txData,
        uint256 amountIn,
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint16 bips,
        uint16 feeBips
    ) internal returns (uint256 swapAmountOut, uint256 tokenInRefund) {
        //validate target
        MASTER.validateTarget(target);

        //update accounting
        uint256 initialTokenIn = tokenIn.balanceOf(address(this));
        uint256 initialTokenOut = tokenOut.balanceOf(address(this));

        //approve
        tokenIn.safeIncreaseAllowance(target, amountIn);

        //perform the call
        (bool success, bytes memory result) = target.call(txData);

        if (success) {
            uint256 finalTokenIn = tokenIn.balanceOf(address(this));
            require(finalTokenIn >= initialTokenIn - amountIn, "over spend");
            uint256 finalTokenOut = tokenOut.balanceOf(address(this));

            //if success, we expect tokenIn balance to decrease by amountIn
            //and tokenOut balance to increase by at least minAmountReceived (adjusted for fees)
            uint256 baseMinAmount = MASTER.getMinAmountReceived(
                amountIn,
                tokenIn,
                tokenOut,
                bips
            );
            uint256 feeAdjustedMinAmount = getMinAmountReceivedAfterFee(
                baseMinAmount,
                feeBips
            );
            require(
                finalTokenOut - initialTokenOut >= feeAdjustedMinAmount,
                "Too Little Received"
            );

            swapAmountOut = finalTokenOut - initialTokenOut;
            tokenInRefund = amountIn - (initialTokenIn - finalTokenIn);
        } else {
            //force revert
            revert TransactionFailed(result);
        }

        //approve 0
        tokenIn.safeDecreaseAllowance(
            target,
            (tokenIn.allowance(address(this), target))
        );
    }

    ///@notice determine @param order order is fillable
    function checkInRange(
        Order memory order
    )
        internal
        view
        returns (bool inRange, bool takeProfit, uint256 exchangeRate)
    {
        exchangeRate = MASTER.getExchangeRate(order.tokenIn, order.tokenOut);

        if (order.stopPrice > order.takeProfit) {
            //check for take profit price
            if (exchangeRate <= order.takeProfit) {
                return (true, true, exchangeRate);
            }
            //check for stop price
            if (order.stopPrice <= exchangeRate) {
                return (true, false, exchangeRate);
            }
        } else {
            //check for take profit price
            if (order.takeProfit <= exchangeRate) {
                return (true, true, exchangeRate);
            }
            //check for stop price
            if (exchangeRate <= order.stopPrice) {
                return (true, false, exchangeRate);
            }
        }
    }

    ///@notice compare all balances of all tokens not involved in the swap
    function verifyTokenBalances(
        uint256[] memory initBalances,
        IERC20 tokenIn,
        IERC20 tokenOut
    ) internal view returns (uint256[] memory balances) {
        IERC20[] memory tokens = MASTER.getRegisteredTokens(); // Get all unique registered tokens
        bool check = initBalances.length != 0;

        if (check) {
            require(
                initBalances.length == tokens.length,
                "balance set length mismatch"
            );
        }

        balances = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = tokens[i];
            uint256 balance = token.balanceOf(address(this)); // Get balance of the token held by the contract

            if (check) {
                // Skip balance comparison for tokenIn and tokenOut
                if (token != tokenIn && token != tokenOut) {
                    require(balance == initBalances[i], "balance mismatch");
                }
            }

            balances[i] = balance;
        }
    }

    ///@notice calculate minimum amount needed before fees to ensure user receives at least minAmountOut after fees
    ///@param minAmountOut the minimum amount the user should receive after fees
    ///@param feeBips the fee in basis points that will be applied
    ///@return the minimum amount needed from swap before fee application
    function getMinAmountReceivedAfterFee(
        uint256 minAmountOut,
        uint16 feeBips
    ) internal pure returns (uint256) {
        if (feeBips == 0) {
            return minAmountOut;
        }
        // To ensure user gets minAmountOut after fee, we need:
        // swapAmount * (10000 - feeBips) / 10000 >= minAmountOut
        // Therefore: swapAmount >= minAmountOut * 10000 / (10000 - feeBips)
        return (minAmountOut * 10000) / (10000 - feeBips);
    }

    ///@notice apply the protocol fee to @param amount
    ///@notice fee is in the form of tokenOut after a successful performUpkeep
    function applyFee(
        uint256 amount,
        uint16 feeBips
    ) internal pure returns (uint256 feeAmount, uint256 adjustedAmount) {
        if (feeBips != 0) {
            //determine adjusted amount and fee amount
            adjustedAmount = (amount * (10000 - feeBips)) / 10000;
            feeAmount = amount - adjustedAmount;
        } else {
            return (0, amount);
        }
    }
}
