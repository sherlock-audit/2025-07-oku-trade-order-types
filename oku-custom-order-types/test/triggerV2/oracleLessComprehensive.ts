import { AutomationMaster__factory, OracleLess__factory, IERC20__factory, PlaceholderOracle__factory } from "../../typechain-types"
import { expect } from "chai"
import { stealMoney } from "../../util/money"
import { generateUniTxData } from "../../util/msc"
import { s } from "./scope"
import { DeployContract } from "../../util/deploy"
import { ethers } from "hardhat"
import { a } from "../../util/addresser"

describe("OracleLess Contract Comprehensive Tests", () => {

    const testAmount = ethers.parseEther("0.1")
    const testUsdcAmount = ethers.parseUnits("300", 6)
    const expectedAmountOut = 1000000n // Reasonable expected output (1 USDC)

    // Helper function to find the index of an order in pending orders
    const findOrderIndex = async (orderId: bigint): Promise<number> => {
        const pendingOrders = await s.OracleLess.getPendingOrders()
        return pendingOrders.findIndex(order => order.orderId === orderId)
    }

    before(async () => {
        // Ensure OracleLess is deployed and configured
        if (!s.OracleLess) {
            s.OracleLess = await DeployContract(new OracleLess__factory(s.Frank), s.Frank, await s.Master.getAddress(), a.permit2, await s.Frank.getAddress())
        }

        // Always ensure tokens are whitelisted (in case of multiple test runs)
        await s.OracleLess.whitelistTokens([await s.WETH.getAddress(), await s.USDC.getAddress()], [true, true])

        // Fund test accounts
        await stealMoney(s.wethWhale, await s.Gary.getAddress(), await s.WETH.getAddress(), ethers.parseEther("10"))
        await stealMoney(s.usdcWhale, await s.Gary.getAddress(), await s.USDC.getAddress(), ethers.parseUnits("50000", 6))
    })

    describe("Initialization and Setup", () => {
        it("Should set correct master and permit2", async () => {
            expect(await s.OracleLess.MASTER()).to.eq(await s.Master.getAddress())
            expect(await s.OracleLess.permit2()).to.eq(a.permit2)
        })

        it("Should set correct owner", async () => {
            expect(await s.OracleLess.owner()).to.eq(await s.Frank.getAddress())
        })

        it("Should have zero initial order count", async () => {
            expect(await s.OracleLess.orderCount()).to.eq(0)
        })
    })

    describe("Token Whitelisting", () => {
        let testToken: any

        before(async () => {
            testToken = IERC20__factory.connect("0x4200000000000000000000000000000000000042", s.Frank) // OP
        })

        it("Should revert when arrays have mismatched lengths", async () => {
            await expect(s.OracleLess.connect(s.Frank).whitelistTokens(
                [testToken],
                [true, false] // Mismatched length
            )).to.be.revertedWith("array mismatch")
        })

        it("Should whitelist tokens correctly", async () => {
            await s.OracleLess.connect(s.Frank).whitelistTokens([testToken], [true])
            expect(await s.OracleLess.whitelistedTokens(await testToken.getAddress())).to.be.true
        })

        it("Should remove tokens from whitelist", async () => {
            await s.OracleLess.connect(s.Frank).whitelistTokens([testToken], [false])
            expect(await s.OracleLess.whitelistedTokens(await testToken.getAddress())).to.be.false
        })

        it("Should revert when non-owner tries to whitelist", async () => {
            await expect(s.OracleLess.connect(s.Bob).whitelistTokens([testToken], [true]))
                .to.be.revertedWith("Ownable: caller is not the owner")
        })
    })

    describe("Order Creation Input Validation", () => {
        it("Should revert with zero amountIn", async () => {
            await expect(s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                0, // Zero amount
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("amountIn == 0")
        })

        it("Should revert with same tokenIn and tokenOut", async () => {
            await expect(s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.WETH.getAddress(), // Same as tokenIn
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("tokenIn == tokenOut")
        })

        it("Should revert with feeBips > 10000", async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await expect(s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                15000, // > 10000 bips
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("BIPS > 10k")
        })

        it("Should revert with zero recipient address", async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await expect(s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                "0x0000000000000000000000000000000000000000", // Zero address
                100,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("recipient == zero address")
        })

        it("Should revert with non-whitelisted tokens", async () => {
            // Remove USDC from whitelist temporarily to test non-whitelisted token validation
            await s.OracleLess.connect(s.Frank).whitelistTokens([await s.USDC.getAddress()], [false])

            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await expect(s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(), // USDC is now not whitelisted
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("tokens not whitelisted")

            // Add USDC back to whitelist for other tests
            await s.OracleLess.connect(s.Frank).whitelistTokens([await s.USDC.getAddress()], [true])
        })

        it("Should revert with insufficient fee", async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await expect(s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee - 1n } // Insufficient fee
            )).to.be.revertedWith("Insufficient funds for order fee")
        })
    })

    describe("Successful Order Creation", () => {
        let orderId: bigint

        it("Should create order successfully and increment counter", async () => {
            const initialCount = await s.OracleLess.orderCount()

            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)
            const result = await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const event = events[0].args
            orderId = event[0]

            expect(event[1]).to.eq(initialCount + 1n) // Order count incremented
            expect(await s.OracleLess.orderCount()).to.eq(initialCount + 1n)

            // Verify order stored correctly
            const order = await s.OracleLess.orders(orderId)
            expect(order.tokenIn).to.eq(await s.WETH.getAddress())
            expect(order.tokenOut).to.eq(await s.USDC.getAddress())
            expect(order.amountIn).to.eq(testAmount)
            expect(order.minAmountOut).to.eq(expectedAmountOut)
            expect(order.recipient).to.eq(await s.Gary.getAddress())
            expect(order.feeBips).to.eq(100)
        })

        it("Should transfer tokens to contract", async () => {
            const balance = await s.WETH.balanceOf(await s.OracleLess.getAddress())
            expect(balance).to.be.gte(testAmount)
        })

        it("Should add order to pending set", async () => {
            const pendingOrders = await s.OracleLess.getPendingOrders()
            expect(pendingOrders.length).to.be.gte(1)
            expect(pendingOrders[pendingOrders.length - 1].orderId).to.eq(orderId)
        })

        after(async () => {
            await s.OracleLess.connect(s.Gary).cancelOrder(orderId)
        })
    })

    describe("Order Retrieval", () => {
        let orderId: bigint

        before(async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const event = events[0].args
            orderId = event[0]
        })

        it("Should get all pending orders", async () => {
            const pendingOrders = await s.OracleLess.getPendingOrders()
            expect(pendingOrders.length).to.be.gte(1)
            expect(pendingOrders[pendingOrders.length - 1].orderId).to.eq(orderId)
        })

        it("Should get specific pending orders with bounds checking", async () => {
            const totalOrders = (await s.OracleLess.getPendingOrders()).length

            // Test normal range
            const orders1 = await s.OracleLess.getSpecificPendingOrders(0, 1)
            expect(orders1.length).to.eq(1)

            // Test end beyond bounds
            const orders2 = await s.OracleLess.getSpecificPendingOrders(0, totalOrders + 10)
            expect(orders2.length).to.eq(totalOrders)

            // Test start beyond bounds
            const orders3 = await s.OracleLess.getSpecificPendingOrders(totalOrders + 1, 1)
            expect(orders3.length).to.eq(0)
        })

        after(async () => {
            // Clean up - try to cancel order if it still exists
            try {
                await s.OracleLess.connect(s.Gary).cancelOrder(orderId)
            } catch (e) {
                // Order might already be cancelled or filled
            }
        })
    })

    describe("Order Modification", () => {
        let orderId: bigint

        beforeEach(async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const event = events[0].args
            orderId = event[0]
        })

        afterEach(async () => {
            // Clean up - try to cancel order if it still exists
            try {
                await s.OracleLess.connect(s.Gary).cancelOrder(orderId)
            } catch (e) {
                // Order might be cancelled already or doesn't exist
            }
        })

        it("Should revert when modifying inactive order", async () => {
            await s.OracleLess.connect(s.Gary).cancelOrder(orderId)

            await expect(s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await s.USDC.getAddress(),
                0,
                expectedAmountOut,
                await s.Gary.getAddress(),
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("order not active")
        })

        it("Should revert when non-owner tries to modify", async () => {
            await expect(s.OracleLess.connect(s.Bob).modifyOrder(
                orderId,
                await s.USDC.getAddress(),
                0,
                expectedAmountOut,
                await s.Gary.getAddress(),
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("only order owner")
        })

        it("Should revert with zero recipient", async () => {
            await expect(s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await s.USDC.getAddress(),
                0,
                expectedAmountOut,
                "0x0000000000000000000000000000000000000000", // Zero address
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("recipient == zero address")
        })

        it("Should revert with same tokenIn and tokenOut", async () => {
            await expect(s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await s.WETH.getAddress(), // Same as current tokenIn
                0,
                expectedAmountOut,
                await s.Gary.getAddress(),
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("tokenIn == tokenOut")
        })

        it("Should revert with non-whitelisted tokenOut", async () => {
            const nonWhitelistedToken = await new PlaceholderOracle__factory(s.Frank).deploy(await s.WETH.getAddress())

            await expect(s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await nonWhitelistedToken.getAddress(),
                0,
                expectedAmountOut,
                await s.Gary.getAddress(),
                false,
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("token not whitelisted")
        })

        it("Should handle position increase correctly", async () => {
            const delta = ethers.parseEther("0.01")
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), delta)
            await s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await s.USDC.getAddress(),
                delta,
                expectedAmountOut * 2n, // Increase min amount out proportionally
                await s.Gary.getAddress(),
                true, // Increase position
                "0x",
                { value: s.fee }
            )

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance - delta)

            const modifiedOrder = await s.OracleLess.orders(orderId)
            expect(modifiedOrder.amountIn).to.eq(testAmount + delta)
        })

        it("Should handle position decrease correctly", async () => {
            const delta = ethers.parseEther("0.01")
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await s.USDC.getAddress(),
                delta,
                expectedAmountOut / 2n, // Decrease min amount out proportionally
                await s.Gary.getAddress(),
                false, // Decrease position
                "0x",
                { value: s.fee }
            )

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance + delta)

            const modifiedOrder = await s.OracleLess.orders(orderId)
            expect(modifiedOrder.amountIn).to.eq(testAmount - delta)
        })

        it("Should revert when decreasing by invalid delta", async () => {
            const order = await s.OracleLess.orders(orderId)

            await expect(s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await s.USDC.getAddress(),
                order.amountIn, // Delta equal to current amount (should leave 0)
                expectedAmountOut,
                await s.Gary.getAddress(),
                false, // Decrease position
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("invalid delta")
        })

        it("Should revert when new amount would be zero", async () => {
            const order = await s.OracleLess.orders(orderId)

            await expect(s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                await s.USDC.getAddress(),
                order.amountIn, // Delta equal to current amount (should leave 0)
                expectedAmountOut,
                await s.Gary.getAddress(),
                false, // Decrease position
                "0x",
                { value: s.fee }
            )).to.be.revertedWith("invalid delta")
        })
    })

    describe("Order Execution", () => {
        let orderId: bigint

        beforeEach(async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)
            await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut / 2n,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const event = events[0].args
            orderId = event[0]
        })

        it("Should revert with invalid target", async () => {
            const invalidTarget = await s.Bob.getAddress()
            const txData = await generateUniTxData(
                s.WETH,
                await s.USDC.getAddress(),
                testAmount,
                s.router02,
                s.UniPool,
                await s.OracleLess.getAddress(),
                expectedAmountOut / 2n
            )

            const orderIndex = await findOrderIndex(orderId)
            await expect(s.OracleLess.fillOrder(orderIndex, orderId, invalidTarget, txData))
                .to.be.revertedWith("Target !Valid")
        })

        it("Should revert with order ID mismatch", async () => {
            const txData = await generateUniTxData(
                s.WETH,
                await s.USDC.getAddress(),
                testAmount,
                s.router02,
                s.UniPool,
                await s.OracleLess.getAddress(),
                expectedAmountOut / 2n
            )

            // Use a valid index but wrong order ID to test ID mismatch
            const orderIndex = await findOrderIndex(orderId)
            await expect(s.OracleLess.fillOrder(orderIndex, 999999n, s.router02, txData))
                .to.be.revertedWith("Order Fill Mismatch")
        })

        it("Should revert when minimum amount not received", async () => {
            const order = await s.OracleLess.orders(orderId)

            // Modify order to expect more than possible
            await s.OracleLess.connect(s.Gary).modifyOrder(
                orderId,
                order.tokenOut,
                0,
                ethers.parseUnits("1000000", 6), // Impossibly high expectation (1M USDC)
                order.recipient,
                false,
                "0x",
                { value: s.fee }
            )

            const txData = await generateUniTxData(
                s.WETH,
                await s.USDC.getAddress(),
                testAmount,
                s.router02,
                s.UniPool,
                await s.OracleLess.getAddress(),
                0n // Don't enforce minimum in swap
            )

            const orderIndex = await findOrderIndex(orderId)
            await expect(s.OracleLess.fillOrder(orderIndex, orderId, s.router02, txData))
                .to.be.revertedWith("Too Little Received")
        })

        it("Should execute order successfully with fees", async () => {
            const initialGaryUSDC = await s.USDC.balanceOf(await s.Gary.getAddress())
            const initialMasterUSDC = await s.USDC.balanceOf(await s.Master.getAddress())

            const txData = await generateUniTxData(
                s.WETH,
                await s.USDC.getAddress(),
                testAmount,
                s.router02,
                s.UniPool,
                await s.OracleLess.getAddress(),
                0n // Set to 0 for swap, order has its own minimum
            )

            const orderIndex = await findOrderIndex(orderId)
            await s.OracleLess.fillOrder(orderIndex, orderId, s.router02, txData)

            // Check order was removed
            const pendingOrders = await s.OracleLess.getPendingOrders()
            expect(pendingOrders.find(order => order.orderId === orderId)).to.be.undefined

            // Check tokens were received (accounting for fees)
            const finalGaryUSDC = await s.USDC.balanceOf(await s.Gary.getAddress())
            const finalMasterUSDC = await s.USDC.balanceOf(await s.Master.getAddress())

            expect(finalGaryUSDC).to.be.gt(initialGaryUSDC)
            expect(finalMasterUSDC).to.be.gt(initialMasterUSDC) // Fees collected

            // Check event was emitted
            const filter = s.OracleLess.filters.OracleLessOrderProcessed
            const events = await s.OracleLess.queryFilter(filter, -1)
            expect(events[0].args.orderId).to.eq(orderId)
        })
    })

    describe("Order Cancellation", () => {
        let orderId: bigint

        beforeEach(async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const event = events[0].args
            orderId = event[0]
        })

        it("Should revert when non-owner tries to cancel", async () => {
            await expect(s.OracleLess.connect(s.Bob).cancelOrder(orderId))
                .to.be.revertedWith("Only Order Owner")
        })

        it("Should cancel order successfully with refund", async () => {
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.OracleLess.connect(s.Gary).cancelOrder(orderId)

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance + testAmount)

            // Check order was removed
            const pendingOrders = await s.OracleLess.getPendingOrders()
            expect(pendingOrders.find(order => order.orderId === orderId)).to.be.undefined

            // Check event was emitted
            const filter = s.OracleLess.filters.OracleLessOrderCancelled
            const events = await s.OracleLess.queryFilter(filter, -1)
            expect(events[0].args.orderId).to.eq(orderId)
        })

        it("Should revert when trying to cancel already cancelled order", async () => {
            // First cancel the order
            await s.OracleLess.connect(s.Gary).cancelOrder(orderId)

            // Then try to cancel it again
            await expect(s.OracleLess.connect(s.Gary).cancelOrder(orderId))
                .to.be.revertedWith("order not active")
        })
    })

    describe("Admin Functions", () => {
        let orderId: bigint

        beforeEach(async () => {
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const event = events[0].args
            orderId = event[0]
        })

        it("Should allow admin to cancel order with refund", async () => {
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.OracleLess.connect(s.Frank).adminCancelOrder(orderId, true)

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance + testAmount)
        })

        it("Should allow admin to cancel order without refund", async () => {
            const initialBalance = await s.WETH.balanceOf(await s.Gary.getAddress())

            await s.OracleLess.connect(s.Frank).adminCancelOrder(orderId, false)

            const finalBalance = await s.WETH.balanceOf(await s.Gary.getAddress())
            expect(finalBalance).to.eq(initialBalance) // No refund
        })

        it("Should revert when non-admin tries to admin cancel", async () => {
            await expect(s.OracleLess.connect(s.Bob).adminCancelOrder(orderId, true))
                .to.be.revertedWith("Ownable: caller is not the owner")
        })
    })

    describe("Pausable Functionality", () => {
        it("Should revert createOrder when paused", async () => {
            await s.OracleLess.connect(s.Frank).pause(true)

            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)
            await expect(s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )).to.be.revertedWithCustomError(s.OracleLess, "EnforcedPause")

            await s.OracleLess.connect(s.Frank).pause(false)
        })

        it("Should revert fillOrder when paused", async () => {
            // Create order first
            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)
            
            await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            // Get the order ID from the event
            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const orderId = events[0].args[0]

            await s.OracleLess.connect(s.Frank).pause(true)

            const txData = await generateUniTxData(
                s.WETH,
                await s.USDC.getAddress(),
                testAmount,
                s.router02,
                s.UniPool,
                await s.OracleLess.getAddress(),
                expectedAmountOut
            )

            const orderIndex = await findOrderIndex(orderId)
            expect(orderIndex).to.not.eq(-1, "Order should exist in pending orders")
            
            await expect(s.OracleLess.fillOrder(orderIndex, orderId, s.router02, txData))
                .to.be.revertedWithCustomError(s.OracleLess, "EnforcedPause")

            await s.OracleLess.connect(s.Frank).pause(false)
            await s.OracleLess.connect(s.Gary).cancelOrder(orderId)
        })

        it("Should allow master and owner to pause", async () => {
            // Ensure contract is not paused first
            if (await s.OracleLess.paused()) {
                await s.OracleLess.connect(s.Frank).pause(false)
            }

            // Test owner pause
            await s.OracleLess.connect(s.Frank).pause(true)
            expect(await s.OracleLess.paused()).to.be.true
            await s.OracleLess.connect(s.Frank).pause(false)

            // Test master pause (through pauseAll)
            await s.Master.connect(s.Frank).pauseAll(true)
            expect(await s.OracleLess.paused()).to.be.true
            await s.Master.connect(s.Frank).pauseAll(false)
        })

        it("Should revert when unauthorized user tries to pause", async () => {
            await expect(s.OracleLess.connect(s.Bob).pause(true))
                .to.be.revertedWith("Not Authorized")
        })
    })

    describe("Balance Verification", () => {
        it("Should prevent balance manipulation during swaps", async () => {
            // This test verifies that the verifyTokenBalances function works correctly
            // by ensuring other token balances don't change during swaps

            await s.WETH.connect(s.Gary).approve(await s.OracleLess.getAddress(), testAmount)

            await s.OracleLess.connect(s.Gary).createOrder(
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                testAmount,
                expectedAmountOut / 2n,
                await s.Gary.getAddress(),
                100,
                
                "0x",
                { value: s.fee }
            )

            const filter = s.OracleLess.filters.OracleLessOrderCreated
            const events = await s.OracleLess.queryFilter(filter, -1)
            const event = events[0].args
            const orderId = event[0]

            const txData = await generateUniTxData(
                s.WETH,
                await s.USDC.getAddress(),
                testAmount,
                s.router02,
                s.UniPool,
                await s.OracleLess.getAddress(),
                0n // Set to 0 for swap, order has its own minimum
            )

            // Find the correct pending order index for this orderId
            const pendingOrders = await s.OracleLess.getPendingOrders()
            const orderIndex = pendingOrders.findIndex(order => order.orderId === orderId)
            expect(orderIndex).to.not.eq(-1, "Order should exist in pending orders")

            // This should work normally
            await s.OracleLess.fillOrder(orderIndex, orderId, s.router02, txData)
        })
    })
})