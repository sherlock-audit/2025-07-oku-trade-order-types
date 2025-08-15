import { AutomationMaster__factory, StopLimit__factory, IERC20__factory, PlaceholderOracle__factory } from "../../typechain-types"
import { expect } from "chai"
import { stealMoney } from "../../util/money"
import { decodeUpkeepData, generateUniTx, MasterUpkeepData } from "../../util/msc"
import { s } from "./scope"
import { DeployContract } from "../../util/deploy"
import { ethers } from "hardhat"
import { a } from "../../util/addresser"

describe("StopLimit Contract Edge Cases", () => {

    let currentPrice: bigint
    const testAmount = ethers.parseEther("0.1")
    const smallAmount = ethers.parseEther("0.001")

    before(async () => {
        await s.wethOracle.setPrice(s.initialEthPrice)
        currentPrice = await s.Master.getExchangeRate(await s.WETH.getAddress(), await s.USDC.getAddress())

        // Fund test accounts
        await stealMoney(s.wethWhale, await s.Oscar.getAddress(), await s.WETH.getAddress(), ethers.parseEther("10"))
        await stealMoney(s.usdcWhale, await s.Oscar.getAddress(), await s.USDC.getAddress(), ethers.parseUnits("50000", 6))
    })

    describe("Input Validation", () => {
        it("Should revert with zero recipient address", async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)

            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                "0x0000000000000000000000000000000000000000",
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("recipient == zero address")
        })

        it("Should revert with same tokenIn and tokenOut", async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)

            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.WETH.getAddress(), // Same as tokenIn
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("tokenIn == tokenOut")
        })

        it("Should revert with zero amountIn", async () => {
            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                0, // Zero amount
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("order too small")//enforced by minOrderSize on master
        })

        it("Should revert with slippage > 10000 bips", async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)

            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                15000, // > 10000 bips
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("BIPS > 10k")
        })

        it("Should revert with insufficient fee", async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)

            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee - 1n } // Insufficient fee
            )).to.be.revertedWith("Insufficient funds for order fee")
        })

        it("Should revert when oracle doesn't exist", async () => {
            const fakeToken = await new PlaceholderOracle__factory(s.Frank).deploy(await s.WETH.getAddress())
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)

            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await fakeToken.getAddress(), // No oracle registered
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("Oracle !exist")
        })
    })

    describe("Order Limits", () => {
        it("Should revert when max pending orders reached", async () => {
            const originalMax = await s.Master.maxPendingOrders()
            await s.Master.connect(s.Frank).setMaxPendingOrders(0) // Set to 0 to test limit

            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)

            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("Max Order Count Reached")

            // Restore original max
            await s.Master.connect(s.Frank).setMaxPendingOrders(originalMax)
        })
    })

    describe("Order Direction Logic", () => {
        let bullishOrderId: bigint
        let bearishOrderId: bigint

        before(async () => {
            // Create bullish order (current price > stop limit price, so direction = true)
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8), // Stop limit price below current
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )

            let filter = s.StopLimit.filters.StopLimitOrderCreated
            let events = await s.StopLimit.queryFilter(filter, -1)
            bullishOrderId = events[0].args[0]

            // Create bearish order (current price < stop limit price, so direction = false)
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice + ethers.parseUnits("100", 8), // Stop limit price above current
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )

            filter = s.StopLimit.filters.StopLimitOrderCreated
            events = await s.StopLimit.queryFilter(filter, -1)
            bearishOrderId = events[0].args[0]
        })

        it("Should set direction correctly for bullish order", async () => {
            const order = await s.StopLimit.orders(bullishOrderId)
            expect(order.direction).to.be.true // Current price > stop limit price
        })

        it("Should set direction correctly for bearish order", async () => {
            const order = await s.StopLimit.orders(bearishOrderId)
            expect(order.direction).to.be.false // Current price < stop limit price
        })

        it("Should trigger bullish order when price falls below stop limit", async () => {
            const order = await s.StopLimit.orders(bullishOrderId)

            // Set price below stop limit
            await s.wethOracle.setPrice(order.stopLimitPrice - ethers.parseUnits("1", 8))

            const result = await s.StopLimit.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true

            // Check that it's the bullish order
            const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)
            expect(data.orderId).to.eq(bullishOrderId)
        })

        it("Should trigger bearish order when price rises above stop limit", async () => {
            // Reset price first
            await s.wethOracle.setPrice(s.initialEthPrice)

            const order = await s.StopLimit.orders(bearishOrderId)

            // Set price above stop limit
            await s.wethOracle.setPrice(order.stopLimitPrice + ethers.parseUnits("1", 8))

            const result = await s.StopLimit.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true

            // Check that it's the bearish order (should be second in the list)
            const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)
            expect(data.orderId).to.eq(bearishOrderId)
        })

        after(async () => {
            // Clean up
            await s.wethOracle.setPrice(s.initialEthPrice)
            try {
                await s.StopLimit.connect(s.Oscar).cancelOrder(bullishOrderId)
                await s.StopLimit.connect(s.Oscar).cancelOrder(bearishOrderId)
            } catch (e) {
                // Orders might be filled
            }
        })
    })

    describe("Order Retrieval", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )

            const filter = s.StopLimit.filters.StopLimitOrderCreated
            const events = await s.StopLimit.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        it("Should get all pending orders", async () => {
            const pendingOrders = await s.StopLimit.getPendingOrders()
            expect(pendingOrders.length).to.be.gte(1)
            expect(pendingOrders[pendingOrders.length - 1].orderId).to.eq(orderId)
        })

        it("Should get specific pending orders with bounds checking", async () => {
            const totalOrders = (await s.StopLimit.getPendingOrders()).length

            // Test normal range
            const orders1 = await s.StopLimit.getSpecificPendingOrders(0, 1)
            expect(orders1.length).to.eq(1)

            // Test end beyond bounds
            const orders2 = await s.StopLimit.getSpecificPendingOrders(0, totalOrders + 10)
            expect(orders2.length).to.eq(totalOrders)

            // Test start beyond bounds
            const orders3 = await s.StopLimit.getSpecificPendingOrders(totalOrders + 1, 1)
            expect(orders3.length).to.eq(0)
        })

        after(async () => {
            // Clean up
            await s.StopLimit.connect(s.Oscar).cancelOrder(orderId)
        })
    })

    describe("Order Modification Edge Cases", () => {
        let orderId: bigint

        beforeEach(async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )

            const filter = s.StopLimit.filters.StopLimitOrderCreated
            const events = await s.StopLimit.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        afterEach(async () => {
            // Clean up if order still exists
            try {
                await s.StopLimit.connect(s.Oscar).cancelOrder(orderId)
            } catch (e) {
                // Order might already be cancelled/filled
            }
        })

        it("Should revert when non-owner tries to modify", async () => {
            const order = await s.StopLimit.orders(orderId)

            await expect(s.StopLimit.connect(s.Bob).modifyOrder(
                orderId,
                order.stopLimitPrice,
                order.takeProfit,
                order.stopPrice,
                0,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                order.swapSlippage,
                order.swapOnFill,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("only order owner")
        })

        it("Should revert when modifying inactive order", async () => {
            await s.StopLimit.connect(s.Oscar).cancelOrder(orderId)

            await expect(s.StopLimit.connect(s.Oscar).modifyOrder(
                orderId,
                currentPrice - ethers.parseUnits("50", 8),//stopLimitPrice
                currentPrice + ethers.parseUnits("150", 8),//takeProfit
                currentPrice - ethers.parseUnits("150", 8),//stopPrice
                0,//amountInDelta
                await s.USDC.getAddress(),//tokenOut
                await s.Oscar.getAddress(),//recipient
                500,//takeProfitBips
                500,//stopBips
                500,//swapBips (not used)
                false,//swapOnFill
                false,//increase position
                "0x",//permit payload
                { value: s.fee }
            )).to.be.revertedWith("order not active")
        })

        it("Should revert when modifying with zero recipient", async () => {
            const order = await s.StopLimit.orders(orderId)

            await expect(s.StopLimit.connect(s.Oscar).modifyOrder(
                orderId,
                order.stopLimitPrice,
                order.takeProfit,
                order.stopPrice,
                0,
                order.tokenOut,
                "0x0000000000000000000000000000000000000000", // Zero address
                order.takeProfitSlippage,
                order.stopSlippage,
                order.swapSlippage,
                order.swapOnFill,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("recipient == zero address")
        })

        it("Should revert when decreasing position by invalid delta", async () => {
            const order = await s.StopLimit.orders(orderId)

            await expect(s.StopLimit.connect(s.Oscar).modifyOrder(
                orderId,
                order.stopLimitPrice,
                order.takeProfit,
                order.stopPrice,
                order.amountIn + 1n, // Delta larger than current amount
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                order.swapSlippage,
                order.swapOnFill,
                false, // Decrease position
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("invalid delta")
        })

        it("Should handle position increase correctly", async () => {
            const order = await s.StopLimit.orders(orderId)
            const delta = ethers.parseEther("0.01")
            const initialBalance = await s.WETH.balanceOf(await s.Oscar.getAddress())

            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), delta)
            await s.StopLimit.connect(s.Oscar).modifyOrder(
                orderId,
                order.stopLimitPrice,
                order.takeProfit,
                order.stopPrice,
                delta,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                order.swapSlippage,
                order.swapOnFill,
                true, // Increase position
                "0x",
                { value: s.fee }
            )

            const finalBalance = await s.WETH.balanceOf(await s.Oscar.getAddress())
            expect(finalBalance).to.eq(initialBalance - delta)

            const modifiedOrder = await s.StopLimit.orders(orderId)
            expect(modifiedOrder.amountIn).to.eq(order.amountIn + delta)
        })

        it("Should handle position decrease correctly", async () => {
            const order = await s.StopLimit.orders(orderId)
            const delta = ethers.parseEther("0.01")
            const initialBalance = await s.WETH.balanceOf(await s.Oscar.getAddress())

            await s.StopLimit.connect(s.Oscar).modifyOrder(
                orderId,
                order.stopLimitPrice,
                order.takeProfit,
                order.stopPrice,
                delta,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                order.swapSlippage,
                order.swapOnFill,
                false, // Decrease position
                "0x",
                { value: s.fee }
            )

            const finalBalance = await s.WETH.balanceOf(await s.Oscar.getAddress())
            expect(finalBalance).to.eq(initialBalance + delta)

            const modifiedOrder = await s.StopLimit.orders(orderId)
            expect(modifiedOrder.amountIn).to.eq(order.amountIn - delta)
        })

        it("Should update direction when stop limit price changes", async () => {
            const order = await s.StopLimit.orders(orderId)

            // Change stop limit price to above current price (should make direction false)
            await s.StopLimit.connect(s.Oscar).modifyOrder(
                orderId,
                currentPrice + ethers.parseUnits("50", 8), // Above current price
                order.takeProfit,
                order.stopPrice,
                0,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                order.swapSlippage,
                order.swapOnFill,
                false,
                "0x",
                { value: s.fee }
            )

            const modifiedOrder = await s.StopLimit.orders(orderId)
            expect(modifiedOrder.direction).to.be.false // Current price < new stop limit price
        })
    })

    describe("Swap on Fill Functionality", () => {
        let swapOrderId: bigint

        before(async () => {
            await s.USDC.connect(s.Oscar).approve(await s.StopLimit.getAddress(), ethers.parseUnits("1000", 6))
            await s.StopLimit.connect(s.Oscar).createOrder(
                ethers.parseUnits("0.0003", 8), // Stop limit price in USDC => WETH terms
                ethers.parseUnits("3200", 8), // Take profit in WETH => USDC terms 
                ethers.parseUnits("2800", 8), // Stop price in WETH => USDC terms
                ethers.parseUnits("1000", 6), // USDC amount
                await s.USDC.getAddress(),
                await s.WETH.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                5000, // High slippage for swap
                true, // Swap on fill
                "0x",
                { value: s.fee }
            )

            const filter = s.StopLimit.filters.StopLimitOrderCreated
            const events = await s.StopLimit.queryFilter(filter, -1)
            swapOrderId = events[0].args[0]
        })

        it("Should create swap on fill order correctly", async () => {
            const order = await s.StopLimit.orders(swapOrderId)
            expect(order.swapOnFill).to.be.true
            expect(order.tokenIn).to.eq(await s.USDC.getAddress())
            expect(order.tokenOut).to.eq(await s.WETH.getAddress())
        })

        it("Should include swap flag in checkUpkeep data when swap on fill", async () => {

            // Set price to trigger
            await s.wethOracle.setPrice(ethers.parseUnits("3000", 8))

            const result = await s.StopLimit.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true

            const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)
            expect(data.orderId).to.eq(swapOrderId)

            // Decode txData to check swap flag
            const swapFlag = ethers.AbiCoder.defaultAbiCoder().decode(["bool"], data.txData)[0]
            expect(swapFlag).to.be.true
        })

        after(async () => {
            // Clean up
            try {
                await s.StopLimit.connect(s.Oscar).cancelOrder(swapOrderId)
            } catch (e) {
                // Order might be filled
            }
        })
    })

    describe("CheckUpkeep Edge Cases", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )

            const filter = s.StopLimit.filters.StopLimitOrderCreated
            const events = await s.StopLimit.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        it("Should handle checkData with custom range", async () => {
            const totalOrders = (await s.StopLimit.getPendingOrders()).length
            const abi = ethers.AbiCoder.defaultAbiCoder()

            // Check range that exceeds bounds
            const encodedData = abi.encode(["uint96", "uint96"], [0, totalOrders + 100])
            const result = await s.StopLimit.checkUpkeep(encodedData)
            expect(result.upkeepNeeded).to.be.false // No orders in range for execution
        })

        it("Should handle empty checkData", async () => {
            const result = await s.StopLimit.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.false // Order not in trigger range
        })

        after(async () => {
            await s.StopLimit.connect(s.Oscar).cancelOrder(orderId)
        })
    })

    describe("PerformUpkeep Edge Cases", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )

            const filter = s.StopLimit.filters.StopLimitOrderCreated
            const events = await s.StopLimit.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        it("Should revert when order ID doesn't exist", async () => {
            // Set price to trigger
            await s.wethOracle.setPrice(currentPrice - ethers.parseUnits("99", 8))

            const result = await s.StopLimit.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true
            
            // Decode and modify the data to create mismatch
            const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)
            data.orderId = 999999n // Wrong order ID

            const badData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8,address,address,address,uint96,uint16,uint88,uint256,uint256,bytes)"],
                [[
                    data.orderType, 
                    data.target, 
                    await data.tokenIn.getAddress(), 
                    await data.tokenOut.getAddress(), 
                    data.orderId, 
                    data.pendingOrderIdx, 
                    data.bips, 
                    data.amountIn, 
                    data.exchangeRate, 
                    data.txData
                ]]
            )

            await expect(s.StopLimit.performUpkeep(badData)).to.be.revertedWith("order not active")
        })

        it("Should revert when order not in range", async () => {
            // Get the order details to understand its stop limit price and direction
            const order = await s.StopLimit.orders(orderId)
            console.log("Order direction:", order.direction, "Stop limit price:", order.stopLimitPrice.toString())
            
            // Set price based on direction to make order not in range
            if (order.direction) {
                // For bullish order (direction = true), it triggers when price <= stopLimitPrice
                // So setting price above stopLimitPrice will make it not in range
                await s.wethOracle.setPrice(order.stopLimitPrice + ethers.parseUnits("500", 8))
            } else {
                // For bearish order (direction = false), it triggers when price >= stopLimitPrice  
                // So setting price below stopLimitPrice will make it not in range
                await s.wethOracle.setPrice(order.stopLimitPrice - ethers.parseUnits("500", 8))
            }

            // Verify the order is actually not in range now
            const checkResult = await s.StopLimit.checkUpkeep("0x")
            expect(checkResult.upkeepNeeded).to.be.false

            // Get the current order to get the correct pending order index
            const pendingOrders = await s.StopLimit.getPendingOrders()
            const orderIndex = pendingOrders.findIndex(order => order.orderId === orderId)
            
            // Try to perform upkeep with stale data from when order was in range
            const data: MasterUpkeepData = {
                orderType: 0,
                target: await s.StopLimit.getAddress(),
                txData: ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [false]),
                pendingOrderIdx: BigInt(orderIndex),
                orderId: orderId,
                tokenIn: s.WETH,
                tokenOut: s.USDC,
                amountIn: testAmount,
                exchangeRate: currentPrice,
                bips: 400n
            }

            const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8,address,address,address,uint96,uint16,uint88,uint256,uint256,bytes)"],
                [[
                    data.orderType,
                    data.target,
                    await data.tokenIn.getAddress(),  
                    await data.tokenOut.getAddress(),  
                    data.orderId,
                    data.pendingOrderIdx,
                    data.bips, 
                    data.amountIn,
                    data.exchangeRate,
                    data.txData
                ]]
            )

            await expect(s.StopLimit.performUpkeep(encodedData)).to.be.revertedWith("order ! in range")
        })

        after(async () => {
            // Clean up
            try {
                await s.StopLimit.connect(s.Oscar).cancelOrder(orderId)
            } catch (e) {
                // Order might be filled
            }
        })
    })

    describe("Admin Functions", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )

            const filter = s.StopLimit.filters.StopLimitOrderCreated
            const events = await s.StopLimit.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        it("Should allow admin to cancel order with refund", async () => {
            const initialBalance = await s.WETH.balanceOf(await s.Oscar.getAddress())

            await s.StopLimit.connect(s.Frank).adminCancelOrder(orderId)

            const finalBalance = await s.WETH.balanceOf(await s.Oscar.getAddress())
            expect(finalBalance).to.eq(initialBalance + testAmount)

            const pendingOrders = await s.StopLimit.getPendingOrders()
            expect(pendingOrders.find(order => order.orderId === orderId)).to.be.undefined
        })


        it("Should revert when non-admin tries to admin cancel", async () => {
            await expect(s.StopLimit.connect(s.Bob).adminCancelOrder(1))
                .to.be.revertedWith("Ownable: caller is not the owner")
        })
    })

    describe("Pausable Edge Cases", () => {
        it("Should revert createOrder when paused", async () => {
            await s.StopLimit.connect(s.Frank).pause(true)

            await s.WETH.connect(s.Oscar).approve(await s.StopLimit.getAddress(), testAmount)
            await expect(s.StopLimit.connect(s.Oscar).createOrder(
                currentPrice - ethers.parseUnits("100", 8),
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Oscar.getAddress(),
                100,
                500,
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWithCustomError(s.StopLimit, "EnforcedPause")

            await s.StopLimit.connect(s.Frank).pause(false)
        })

        it("Should allow master and owner to pause", async () => {
            // Ensure contract is not paused first
            if (await s.StopLimit.paused()) {
                await s.StopLimit.connect(s.Frank).pause(false)
            }

            // Test owner pause
            await s.StopLimit.connect(s.Frank).pause(true)
            expect(await s.StopLimit.paused()).to.be.true
            await s.StopLimit.connect(s.Frank).pause(false)

            // Test master pause (through pauseAll)
            await s.Master.connect(s.Frank).pauseAll(true)
            expect(await s.StopLimit.paused()).to.be.true
            await s.Master.connect(s.Frank).pauseAll(false)
        })

        it("Should revert when unauthorized user tries to pause", async () => {
            await expect(s.StopLimit.connect(s.Bob).pause(true))
                .to.be.revertedWith("Not Authorized")
        })
    })
})