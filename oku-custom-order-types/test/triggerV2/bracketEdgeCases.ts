import { AutomationMaster__factory, Bracket__factory, IERC20__factory, PlaceholderOracle__factory } from "../../typechain-types"
import { expect } from "chai"
import { stealMoney } from "../../util/money"
import { decodeUpkeepData, generateUniTx, generateUniTxData, MasterUpkeepData } from "../../util/msc"
import { s, SwapParams } from "./scope"
import { DeployContract } from "../../util/deploy"
import { ethers } from "hardhat"
import { a } from "../../util/addresser"

describe("Bracket Contract Edge Cases", () => {

    let currentPrice: bigint
    const testAmount = ethers.parseEther("0.1")
    const smallAmount = ethers.parseEther("0.001")

    before(async () => {
        await s.wethOracle.setPrice(s.initialEthPrice)
        currentPrice = await s.Master.getExchangeRate(await s.WETH.getAddress(), await s.USDC.getAddress())
        await s.Master.setOrderFee(s.fee)

        // Fund test accounts
        await stealMoney(s.wethWhale, await s.Gary.getAddress(), await s.WETH.getAddress(), ethers.parseEther("10"))
        await stealMoney(s.usdcWhale, await s.Gary.getAddress(), await s.USDC.getAddress(), ethers.parseUnits("50000", 6))
    })

    describe("Input Validation", () => {
        it("Should revert with zero recipient address", async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)

            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                "0x0000000000000000000000000000000000000000", // Zero address
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("recipient == zero address")
        })

        it("Should revert with same tokenIn and tokenOut", async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)

            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.WETH.getAddress(), // Same as tokenIn
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("tokenIn == tokenOut")
        })

        it("Should revert with zero amountIn", async () => {
            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                0, // Zero amount
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("amountIn == 0")
        })

        it("Should revert with slippage > 10000 bips", async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)

            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                15000, // > 10000 bips
                500,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("BIPS > 10k")
        })

        it("Should revert with insufficient fee", async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee - 1n } // Insufficient fee
            )).to.be.revertedWith("Insufficient funds for order fee")
        })

        it("Should revert when oracle doesn't exist", async () => {
            const fakeToken = await new PlaceholderOracle__factory(s.Frank).deploy(await s.WETH.getAddress())
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)

            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await fakeToken.getAddress(), // No oracle registered
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("Oracle !exist")
        })
    })

    describe("Order Limits", () => {
        it("Should revert when max pending orders reached", async () => {
            const originalMax = await s.Master.maxPendingOrders()
            await s.Master.connect(s.Frank).setMaxPendingOrders(0) // Set to 0 to test limit

            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)

            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("Max Order Count Reached")

            // Restore original max
            await s.Master.connect(s.Frank).setMaxPendingOrders(originalMax)
        })
    })

    describe("Order Retrieval", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.Bracket.filters.BracketOrderCreated
            const events = await s.Bracket.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        it("Should get all pending orders", async () => {
            const pendingOrders = await s.Bracket.getPendingOrders()
            expect(pendingOrders.length).to.be.gte(1)
            expect(pendingOrders[pendingOrders.length - 1].orderId).to.eq(orderId)
        })

        it("Should get specific pending orders with bounds checking", async () => {
            const totalOrders = (await s.Bracket.getPendingOrders()).length

            // Test normal range
            const orders1 = await s.Bracket.getSpecificPendingOrders(0, 1)
            expect(orders1.length).to.eq(1)

            // Test end beyond bounds
            const orders2 = await s.Bracket.getSpecificPendingOrders(0, totalOrders + 10)
            expect(orders2.length).to.eq(totalOrders)

            // Test start beyond bounds
            const orders3 = await s.Bracket.getSpecificPendingOrders(totalOrders + 1, 1)
            expect(orders3.length).to.eq(0)
        })

        after(async () => {
            // Clean up
            await s.Bracket.connect(s.Gary).cancelOrder(orderId)
        })
    })

    describe("Order Modification Edge Cases", () => {
        let orderId: bigint

        beforeEach(async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.Bracket.filters.BracketOrderCreated
            const events = await s.Bracket.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        afterEach(async () => {
            // Clean up if order still exists
            try {
                await s.Bracket.connect(s.Gary).cancelOrder(orderId)
            } catch (e) {
                // Order might already be cancelled/filled
            }
        })

        it("Should revert when non-owner tries to modify", async () => {
            const order = await s.Bracket.orders(orderId)

            await expect(s.Bracket.connect(s.Bob).modifyOrder(
                orderId,
                order.takeProfit,
                order.stopPrice,
                0,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("only order owner")
        })

        it("Should revert when modifying inactive order", async () => {
            await s.Bracket.connect(s.Gary).cancelOrder(orderId)

            await expect(s.Bracket.connect(s.Gary).modifyOrder(
                orderId,
                currentPrice + ethers.parseUnits("200", 8),
                currentPrice - ethers.parseUnits("200", 8),
                0,
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                500,
                500,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("order not active")
        })

        it("Should revert when modifying with zero recipient", async () => {
            const order = await s.Bracket.orders(orderId)

            await expect(s.Bracket.connect(s.Gary).modifyOrder(
                orderId,
                order.takeProfit,
                order.stopPrice,
                0,
                order.tokenOut,
                "0x0000000000000000000000000000000000000000", // Zero address
                order.takeProfitSlippage,
                order.stopSlippage,
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("recipient == zero address")
        })

        it("Should revert when decreasing position by invalid delta", async () => {
            const order = await s.Bracket.orders(orderId)

            await expect(s.Bracket.connect(s.Gary).modifyOrder(
                orderId,
                order.takeProfit,
                order.stopPrice,
                order.amountIn + 1n, // Delta larger than current amount
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                false, // Decrease position
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("invalid delta")
        })

        it("Should handle position increase correctly", async () => {
            const order = await s.Bracket.orders(orderId)
            const delta = ethers.parseEther("0.01")
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), delta)
            await s.Bracket.connect(s.Gary).modifyOrder(
                orderId,
                order.takeProfit,
                order.stopPrice,
                delta,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                true, // Increase position
                "0x",
                { value: s.fee }
            )

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance - delta)

            const modifiedOrder = await s.Bracket.orders(orderId)
            expect(modifiedOrder.amountIn).to.eq(order.amountIn + delta)
        })

        it("Should handle position decrease correctly", async () => {
            const order = await s.Bracket.orders(orderId)
            const delta = ethers.parseEther("0.01")
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.Bracket.connect(s.Gary).modifyOrder(
                orderId,
                order.takeProfit,
                order.stopPrice,
                delta,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                false, // Decrease position
                "0x",
                { value: s.fee }
            )

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance + delta)

            const modifiedOrder = await s.Bracket.orders(orderId)
            expect(modifiedOrder.amountIn).to.eq(order.amountIn - delta)
        })
    })

    describe("CheckUpkeep Edge Cases", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.Bracket.filters.BracketOrderCreated
            const events = await s.Bracket.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        it("Should handle checkData with custom range", async () => {
            const totalOrders = (await s.Bracket.getPendingOrders()).length
            const abi = ethers.AbiCoder.defaultAbiCoder()

            // Check range that exceeds bounds
            const encodedData = abi.encode(["uint96", "uint96"], [0, totalOrders + 100])
            const result = await s.Bracket.checkUpkeep(encodedData)
            expect(result.upkeepNeeded).to.be.false // No orders in range for execution
        })

        it("Should handle inverted strike prices correctly", async () => {
            const order = await s.Bracket.orders(orderId)

            // Modify to have stop price > take profit
            await s.Bracket.connect(s.Gary).modifyOrder(
                orderId,
                currentPrice - ethers.parseUnits("100", 8), // Take profit (lower)
                currentPrice + ethers.parseUnits("100", 8), // Stop price (higher)
                0,
                order.tokenOut,
                order.recipient,
                order.takeProfitSlippage,
                order.stopSlippage,
                false,
                "0x",
                { value: s.fee }
            )

            // Set price to trigger take profit
            await s.wethOracle.setPrice(currentPrice - ethers.parseUnits("101", 8))

            const result = await s.Bracket.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true
        })

        after(async () => {
            await s.Bracket.connect(s.Gary).cancelOrder(orderId)
        })
    })

    describe("Admin Functions", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.Bracket.filters.BracketOrderCreated
            const events = await s.Bracket.queryFilter(filter, -1)
            orderId = events[0].args[0]
        })

        it("Should allow admin to cancel order with refund", async () => {
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.Bracket.connect(s.Frank).adminCancelOrder(orderId, true)

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance + testAmount)

            const pendingOrders = await s.Bracket.getPendingOrders()
            expect(pendingOrders.find(order => order.orderId === orderId)).to.be.undefined
        })

        it("Should allow admin to cancel order without refund", async () => {
            // Create another order
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.Bracket.filters.BracketOrderCreated
            const events = await s.Bracket.queryFilter(filter, -1)
            const newOrderId = events[0].args[0]

            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.Bracket.connect(s.Frank).adminCancelOrder(newOrderId, false) // No refund

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance) // No change in balance
        })

        it("Should revert when non-admin tries to admin cancel", async () => {
            await expect(s.Bracket.connect(s.Bob).adminCancelOrder(1, true))
                .to.be.revertedWith("Ownable: caller is not the owner")
        })
    })

    describe("Pausable Edge Cases", () => {
        it("Should revert createOrder when paused", async () => {
            await s.Bracket.connect(s.Frank).pause(true)

            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await expect(s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWithCustomError(s.Master, "EnforcedPause")

            await s.Bracket.connect(s.Frank).pause(false)
        })

        it("Should revert cancelOrder when paused", async () => {
            // Create order first
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), testAmount)
            await s.Bracket.connect(s.Gary).createOrder(
                "0x",
                currentPrice + ethers.parseUnits("100", 8),
                currentPrice - ethers.parseUnits("100", 8),
                testAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                await s.Gary.getAddress(),
                100,
                500,
                500,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.Bracket.filters.BracketOrderCreated
            const events = await s.Bracket.queryFilter(filter, -1)
            const orderId = events[0].args[0]

            await s.Bracket.connect(s.Frank).pause(true)

            await expect(s.Bracket.connect(s.Gary).cancelOrder(orderId))
                .to.be.revertedWithCustomError(s.Master, "EnforcedPause")

            await s.Bracket.connect(s.Frank).pause(false)
            await s.Bracket.connect(s.Gary).cancelOrder(orderId) 
        })

        it("Should allow master and owner to pause", async () => {
            // Test owner pause
            await s.Bracket.connect(s.Frank).pause(true)
            expect(await s.Bracket.paused()).to.be.true
            await s.Bracket.connect(s.Frank).pause(false)

            // Test master pause (through pauseAll)
            await s.Master.connect(s.Frank).pauseAll(true)
            expect(await s.Bracket.paused()).to.be.true
            await s.Master.connect(s.Frank).pauseAll(false)
        })

        it("Should revert when unauthorized user tries to pause", async () => {
            await expect(s.Bracket.connect(s.Bob).pause(true))
                .to.be.revertedWith("Not Authorized")
        })
    })
})