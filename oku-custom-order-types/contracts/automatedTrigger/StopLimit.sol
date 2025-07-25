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

///@notice This contract owns and handles all logic associated with STOP_LIMIT orders
///STOP_LIMIT orders create a new Bracket order order with the same order ID once filled
contract StopLimit is Ownable, IStopLimit, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    IAutomationMaster public immutable MASTER;
    IBracket public immutable BRACKET_CONTRACT;
    IPermit2 public immutable permit2;

    mapping(uint96 => Order) public orders;
    EnumerableSet.UintSet private dataSet;

    constructor(
        IAutomationMaster _master,
        IBracket _bracket,
        IPermit2 _permit2,
        address owner
    ) {
        MASTER = _master;
        BRACKET_CONTRACT = _bracket;
        permit2 = _permit2;
        _transferOwnership(owner);
    }

    modifier paysFee() {
        uint256 orderFee = MASTER.orderFee();
        require(msg.value >= orderFee, "Insufficient funds for order fee");
        _;
        // Transfer the fee to the master contract
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

    ///@notice this should never be called inside of a write function due to high gas usage
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
            (bool inRange, uint256 exchangeRate) = checkInRange(order);
            if (inRange) {
                return (
                    true,
                    abi.encode(
                        MasterUpkeepData({
                            orderType: OrderType.STOP_LIMIT,
                            target: address(this),
                            txData: abi.encode(order.swapOnFill), //specify if swapOnFill is true
                            pendingOrderIdx: i,
                            orderId: order.orderId,
                            tokenIn: order.tokenIn,
                            tokenOut: order.tokenOut,
                            slippage: order.swapSlippage,
                            amountIn: order.amountIn,
                            exchangeRate: exchangeRate
                        })
                    )
                );
            }
        }
    }

    function performUpkeep(
        bytes calldata performData
    ) external override nonReentrant whenNotPaused {
        MasterUpkeepData memory data = abi.decode(
            performData,
            (MasterUpkeepData)
        );
        uint96 orderIdFromSet = uint96(dataSet.at(data.pendingOrderIdx));
        require(orderIdFromSet == data.orderId, "Order Fill Mismatch");
        Order memory order = orders[uint96(dataSet.at(data.pendingOrderIdx))];

        //confirm order is in range to prevent improper fill
        (bool inRange, ) = checkInRange(order);
        require(inRange, "order ! in range");

        //remove from pending dataSet
        require(dataSet.remove(order.orderId), "order not active");

        //approve
        order.tokenIn.safeIncreaseAllowance(
            address(BRACKET_CONTRACT),
            order.amountIn
        );

        bytes memory swapPayload;
        IERC20 tokenIn = order.tokenIn;
        IERC20 tokenOut = order.tokenOut;
        if (order.swapOnFill) {
            //for swap on fill, we expect to be paid out in the same asset we provided
            //so the resulting order tokenIn and tokenOut are inverted relative to our original swap limit order
            SwapParams memory params = SwapParams({
                swapTokenIn: order.tokenIn,
                swapAmountIn: order.amountIn,
                swapTarget: data.target,
                swapSlippage: order.swapSlippage,
                txData: data.txData
            });
            swapPayload = abi.encode(params);

            tokenIn = order.tokenOut;
            tokenOut = order.tokenIn;
        }

        //create bracket order
        BRACKET_CONTRACT.fillStopLimitOrder(
            swapPayload,
            order.takeProfit,
            order.stopPrice,
            order.amountIn,
            order.orderId,
            tokenIn,
            tokenOut,
            order.recipient,
            order.feeBips,
            order.takeProfitSlippage,
            order.stopSlippage
        );

        //approve 0
        order.tokenIn.safeDecreaseAllowance(
            address(BRACKET_CONTRACT),
            (order.tokenIn.allowance(address(this), address(BRACKET_CONTRACT)))
        );

        emit StopLimitOrderProcessed(order.orderId);
    }

    ///@notice see @IStopLimit
    function createOrder(
        uint256 stopLimitPrice,
        uint256 takeProfit,
        uint256 stopPrice,
        uint256 amountIn,
        IERC20 tokenIn,
        IERC20 tokenOut,
        address recipient,
        uint16 feeBips,
        uint16 takeProfitSlippage,
        uint16 stopSlippage,
        uint16 swapSlippage,
        bool swapOnFill,
        bytes calldata permitPayload
    ) external payable override nonReentrant whenNotPaused paysFee {
        if (permitPayload.length > 0) {
            require(amountIn < type(uint160).max, "uint160 overflow");
            IAutomation.Permit2Payload memory payload = abi.decode(
                permitPayload,
                (IAutomation.Permit2Payload)
            );

            require(payload.permitTransferFrom.permitted.token == address(tokenIn), "permit token mismatch");

            IPermit2.SignatureTransferDetails memory transferDetails = IPermit2.SignatureTransferDetails({
                to: address(this),
                requestedAmount: amountIn
            });

            permit2.permitTransferFrom(
                payload.permitTransferFrom,
                transferDetails,
                msg.sender,
                payload.signature
            );
        } else {
            //take asset, assume prior approval
            tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        }

        MASTER.checkMinOrderSize(tokenIn, amountIn);

        _createOrder(
            stopLimitPrice,
            takeProfit,
            stopPrice,
            amountIn,
            tokenIn,
            tokenOut,
            recipient,
            feeBips,
            takeProfitSlippage,
            stopSlippage,
            swapSlippage,
            swapOnFill
        );
    }

    ///@notice see @IStopLimit
    function modifyOrder(
        uint96 orderId,
        uint256 _stopLimitPrice,
        uint256 _takeProfit,
        uint256 _stopPrice,
        uint256 _amountInDelta,
        IERC20 _tokenOut,
        address _recipient,
        uint16 _takeProfitSlippage,
        uint16 _stopSlippage,
        uint16 _swapSlippage,
        bool _swapOnFill,
        bool increasePosition,
        bytes calldata permitPayload
    ) external payable override nonReentrant whenNotPaused paysFee {
        //get existing order
        Order memory order = orders[orderId];
        require(dataSet.contains(order.orderId), "order not active");
        //only order owner
        require(msg.sender == order.recipient, "only order owner");
        require(_recipient != address(0), "recipient == zero address");

        //deduce any amountIn changes
        uint256 newAmountIn = order.amountIn;
        if (_amountInDelta != 0) {
            if (increasePosition) {
                newAmountIn += _amountInDelta;
                //take funds via permit2 or legacy transfer
                if (permitPayload.length > 0) {
                    require(
                        _amountInDelta < type(uint160).max,
                        "uint160 overflow"
                    );
                    IAutomation.Permit2Payload memory payload = abi.decode(
                        permitPayload,
                        (IAutomation.Permit2Payload)
                    );

                    require(payload.permitTransferFrom.permitted.token == address(order.tokenIn), "permit token mismatch");

                    IPermit2.SignatureTransferDetails memory transferDetails = IPermit2.SignatureTransferDetails({
                        to: address(this),
                        requestedAmount: _amountInDelta
                    });

                    permit2.permitTransferFrom(
                        payload.permitTransferFrom,
                        transferDetails,
                        order.recipient,
                        payload.signature
                    );
                } else {
                    //legacy transfer, assume prior approval
                    order.tokenIn.safeTransferFrom(
                        order.recipient,
                        address(this),
                        _amountInDelta
                    );
                }
            } else {
                //ensure delta is valid
                require(_amountInDelta <= order.amountIn, "invalid delta");

                //set new amountIn for accounting
                newAmountIn -= _amountInDelta;

                //check min order size for new amount
                MASTER.checkMinOrderSize(order.tokenIn, newAmountIn);

                //refund position partially
                order.tokenIn.safeTransfer(order.recipient, _amountInDelta);
            }
        }

        //check slippage
        require(
            _takeProfitSlippage <= 10000 &&
                _stopSlippage <= 10000 &&
                _swapSlippage <= 10000,
            "BIPS > 10k"
        );

        require(order.tokenIn != _tokenOut, "tokenIn == tokenOut");

        //check for oracles
        if (_tokenOut != order.tokenOut) {
            require(
                address(MASTER.oracles(_tokenOut)) != address(0),
                "Oracle !exist"
            );
        }

        //construct order
        Order memory newOrder = Order({
            orderId: orderId,
            stopLimitPrice: _stopLimitPrice,
            takeProfit: _takeProfit,
            stopPrice: _stopPrice,
            amountIn: newAmountIn,
            tokenIn: order.tokenIn,
            tokenOut: _tokenOut,
            feeBips: order.feeBips,
            takeProfitSlippage: _takeProfitSlippage,
            stopSlippage: _stopSlippage,
            swapSlippage: _swapSlippage,
            recipient: _recipient,
            direction: MASTER.getExchangeRate(order.tokenIn, _tokenOut) >
                _stopLimitPrice,
            swapOnFill: _swapOnFill
        });

        //store new order
        orders[orderId] = newOrder;

        emit StopLimitOrderModified(orderId);
    }

    ///@notice allow administrator to cancel any order
    ///@notice once cancelled, any funds associated with the order are returned to the order recipient
    ///@notice only pending orders can be cancelled
    ///NOTE if @param refund is false, then the order's tokens will not be refunded and will be stuck on this contract possibly forever
    ///@notice ONLY SET @param refund TO FALSE IN THE CASE OF A BROKEN ORDER CAUSING cancelOrder() TO REVERT
    function adminCancelOrder(
        uint96 orderId,
        bool refund
    ) external onlyOwner nonReentrant {
        Order memory order = orders[orderId];
        _cancelOrder(order, refund);
    }

    ///@notice only the order recipient can cancel their order
    ///@notice only pending orders can be cancelled
    function cancelOrder(uint96 orderId) external nonReentrant whenNotPaused {
        Order memory order = orders[orderId];
        require(msg.sender == order.recipient, "Only Order Owner");
        _cancelOrder(order, true);
    }

    function _createOrder(
        uint256 stopLimitPrice,
        uint256 takeProfit,
        uint256 stopPrice,
        uint256 amountIn,
        IERC20 tokenIn,
        IERC20 tokenOut,
        address recipient,
        uint16 feeBips,
        uint16 takeProfitSlippage,
        uint16 stopSlippage,
        uint16 swapSlippage,
        bool swapOnFill
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
            takeProfitSlippage <= 10000 &&
                stopSlippage <= 10000 &&
                swapSlippage <= 10000 &&
                feeBips <= 10000,
            "BIPS > 10k"
        );
        require(tokenIn != tokenOut, "tokenIn == tokenOut");
        require(amountIn != 0, "amountIn == 0");
        require(recipient != address(0), "recipient == zero address");

        uint96 orderId = MASTER.generateOrderId(msg.sender);

        orders[orderId] = Order({
            orderId: orderId,
            stopLimitPrice: stopLimitPrice,
            stopPrice: stopPrice,
            takeProfit: takeProfit,
            amountIn: amountIn,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            takeProfitSlippage: takeProfitSlippage,
            feeBips: feeBips,
            stopSlippage: stopSlippage,
            swapSlippage: swapSlippage,
            recipient: recipient,
            direction: MASTER.getExchangeRate(tokenIn, tokenOut) >
                stopLimitPrice, //compare to stop price for this order's direction
            swapOnFill: swapOnFill
        });

        //store pending order
        dataSet.add(orderId);

        //emit
        emit StopLimitOrderCreated(orderId);
    }

    function _cancelOrder(Order memory order, bool refund) internal {
        //remove from pending set
        require(dataSet.remove(order.orderId), "order not active");

        //refund tokenIn amountIn to recipient
        if (refund) {
            order.tokenIn.safeTransfer(order.recipient, order.amountIn);
        }
        //emit event
        emit StopLimitOrderCancelled(order.orderId);
    }

    ///@notice check if the order is fillable
    function checkInRange(
        Order memory order
    ) internal view returns (bool inRange, uint256 exchangeRate) {
        exchangeRate = MASTER.getExchangeRate(order.tokenIn, order.tokenOut);
        if (order.direction) {
            if (exchangeRate <= order.stopLimitPrice) {
                inRange = true;
            }
        } else {
            if (exchangeRate >= order.stopLimitPrice) {
                inRange = true;
            }
        }
    }
}
