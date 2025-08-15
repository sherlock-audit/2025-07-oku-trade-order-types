import { AutomationMaster__factory, PlaceholderOracle__factory, IERC20__factory } from "../../typechain-types"
import { expect } from "chai"
import { stealMoney } from "../../util/money"
import { s } from "./scope"
import { DeployContract } from "../../util/deploy"
import { ethers } from "hardhat"

describe("Oracle and Pricing Edge Cases", () => {

    let testToken1: any, testToken2: any, testToken3: any
    let testOracle1: any, testOracle2: any, testOracle3: any

    before(async () => {
        // Create test tokens and oracles for comprehensive testing
        testToken1 = IERC20__factory.connect("0x4200000000000000000000000000000000000042", s.Frank) // OP
        testToken2 = IERC20__factory.connect("0x6fd9d7AD17242c41f7131d257212c54A0e816691", s.Frank) // UNI
        testToken3 = IERC20__factory.connect("0x68f180fcCe6836688e9084f035309E29Bf0A2095", s.Frank) // WBTC
        
        testOracle1 = await new PlaceholderOracle__factory(s.Frank).deploy(await testToken1.getAddress())
        testOracle2 = await new PlaceholderOracle__factory(s.Frank).deploy(await testToken2.getAddress())
        testOracle3 = await new PlaceholderOracle__factory(s.Frank).deploy(await testToken3.getAddress())
    })

    describe("Oracle Registration Edge Cases", () => {
        it("Should handle registration of many tokens", async () => {
            const tokens = [testToken1, testToken2, testToken3]
            const oracles = [testOracle1, testOracle2, testOracle3]
            
            await s.Master.connect(s.Frank).registerOracle(tokens, oracles)
            
            const registeredTokens = await s.Master.getRegisteredTokens()
            expect(registeredTokens.length).to.be.gte(3)
            
            // Verify each oracle is registered correctly
            for (let i = 0; i < tokens.length; i++) {
                expect(await s.Master.oracles(await tokens[i].getAddress())).to.eq(await oracles[i].getAddress())
            }
        })

        it("Should handle re-registration of existing tokens", async () => {
            const newOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await testToken1.getAddress())
            
            await s.Master.connect(s.Frank).registerOracle([testToken1], [newOracle])
            expect(await s.Master.oracles(await testToken1.getAddress())).to.eq(await newOracle.getAddress())
        })

        it("Should handle deregistration by setting oracle to zero address", async () => {
            const zeroAddress = "0x0000000000000000000000000000000000000000"
            
            await s.Master.connect(s.Frank).registerOracle([testToken1], [zeroAddress])
            expect(await s.Master.oracles(await testToken1.getAddress())).to.eq(zeroAddress)
            
            // Re-register for future tests
            await s.Master.connect(s.Frank).registerOracle([testToken1], [testOracle1])
        })

        it("Should handle mixed registration and deregistration", async () => {
            const zeroAddress = "0x0000000000000000000000000000000000000000"
            const newOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await testToken2.getAddress())
            
            await s.Master.connect(s.Frank).registerOracle(
                [testToken1, testToken2, testToken3],
                [testOracle1, newOracle, zeroAddress] // Keep 1, change 2, remove 3
            )
            
            expect(await s.Master.oracles(await testToken1.getAddress())).to.eq(await testOracle1.getAddress())
            expect(await s.Master.oracles(await testToken2.getAddress())).to.eq(await newOracle.getAddress())
            expect(await s.Master.oracles(await testToken3.getAddress())).to.eq(zeroAddress)
        })
    })

    describe("Exchange Rate Calculations", () => {
        before(async () => {
            // Ensure oracles are registered
            await s.Master.connect(s.Frank).registerOracle(
                [testToken1, testToken2],
                [testOracle1, testOracle2]
            )
        })

        it("Should calculate correct exchange rates with normal prices", async () => {
            await testOracle1.setPrice(ethers.parseUnits("1000", 8)) // $10.00
            await testOracle2.setPrice(ethers.parseUnits("500", 8))  // $5.00
            
            const exchangeRate = await s.Master.getExchangeRate(testToken1, testToken2)
            expect(exchangeRate).to.eq(ethers.parseUnits("2", 8)) // 1000/500 = 2
        })

        it("Should handle very large price differences", async () => {
            await testOracle1.setPrice(ethers.parseUnits("100000000", 8)) // $1,000,000
            await testOracle2.setPrice(ethers.parseUnits("1", 8))         // $0.01
            
            const exchangeRate = await s.Master.getExchangeRate(testToken1, testToken2)
            expect(exchangeRate).to.eq(ethers.parseUnits("100000000", 8)) // 1,000,000 / 0.01 = 100,000,000
        })

        it("Should handle very small price differences", async () => {
            await testOracle1.setPrice(1) // Minimum price
            await testOracle2.setPrice(ethers.parseUnits("100000000", 8)) // $1B
            
            const exchangeRate = await s.Master.getExchangeRate(testToken1, testToken2)
            expect(exchangeRate).to.eq(0) // Should round down to 0 due to integer division
        })

        it("Should handle equal prices", async () => {
            const price = ethers.parseUnits("1000", 8)
            await testOracle1.setPrice(price)
            await testOracle2.setPrice(price)
            
            const exchangeRate = await s.Master.getExchangeRate(testToken1, testToken2)
            expect(exchangeRate).to.eq(ethers.parseUnits("1", 8)) // 1:1 ratio
        })

        it("Should be symmetric for inverse calculations", async () => {
            await testOracle1.setPrice(ethers.parseUnits("1000", 8)) // $10.00
            await testOracle2.setPrice(ethers.parseUnits("200", 8))  // $2.00
            
            const rate1to2 = await s.Master.getExchangeRate(testToken1, testToken2)
            const rate2to1 = await s.Master.getExchangeRate(testToken2, testToken1)
            
            expect(rate1to2).to.eq(ethers.parseUnits("5", 8)) // 1000/200 = 5
            expect(rate2to1).to.eq(ethers.parseUnits("0.2", 8)) // 200/1000 = 0.2
        })
    })

    describe("Decimal Adjustment Edge Cases", () => {
        before(async () => {
            // Reset to known prices
            await s.wethOracle.setPrice(ethers.parseUnits("3000", 8)) // $3000
            await s.usdcOracle.setPrice(ethers.parseUnits("1", 8))    // $1
        })

        it("Should handle 18 decimal to 6 decimal conversion (WETH to USDC)", async () => {
            const wethAmount = ethers.parseEther("1") // 1 WETH (18 decimals)
            const minAmount = await s.Master.getMinAmountReceived(
                wethAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                0 // 0% slippage
            )
            // 1 WETH @ $3000 = 3000 USDC (6 decimals)
            expect(minAmount).to.eq(ethers.parseUnits("3000", 6))
        })

        it("Should handle 6 decimal to 18 decimal conversion (USDC to WETH)", async () => {
            const usdcAmount = ethers.parseUnits("3000", 6) // 3000 USDC (6 decimals)
            const minAmount = await s.Master.getMinAmountReceived(
                usdcAmount,
                await s.USDC.getAddress(),
                await s.WETH.getAddress(),
                0 // 0% slippage
            )
            // 3000 USDC @ $1 = $3000, $3000 / $3000 = 1 WETH (18 decimals)
            expect(minAmount).to.eq(ethers.parseEther("1"))
        })

        it("Should handle same decimal tokens", async () => {
            // Set test oracles to same decimals
            await testOracle1.setPrice(ethers.parseUnits("100", 8)) // $1.00
            await testOracle2.setPrice(ethers.parseUnits("50", 8))  // $0.50
            
            const amount = ethers.parseEther("1") // Assuming both tokens have 18 decimals
            const minAmount = await s.Master.getMinAmountReceived(
                amount,
                testToken1,
                testToken2,
                0 // 0% slippage
            )
            // 1 token1 @ $1 = $1, $1 / $0.50 = 2 token2
            expect(minAmount).to.eq(ethers.parseEther("2"))
        })

        it("Should handle extreme decimal differences", async () => {
            // Create a mock token with extreme decimals for testing
            // This is theoretical as we're using existing tokens
            const amount = ethers.parseUnits("1", 18) // 18 decimal token
            
            // Test with USDC (6 decimals) - this tests the maximum realistic difference
            const minAmount = await s.Master.getMinAmountReceived(
                amount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                0
            )
            
            // Verify the calculation accounts for decimal differences
            expect(minAmount).to.be.gt(0)
        })
    })

    describe("Slippage Calculations", () => {
        before(async () => {
            await s.wethOracle.setPrice(ethers.parseUnits("2000", 8)) // $2000
            await s.usdcOracle.setPrice(ethers.parseUnits("1", 8))    // $1
        })

        it("Should handle 0% slippage", async () => {
            const wethAmount = ethers.parseEther("1")
            const minAmount = await s.Master.getMinAmountReceived(
                wethAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                0 // 0% slippage
            )
            expect(minAmount).to.eq(ethers.parseUnits("2000", 6))
        })

        it("Should handle 1% slippage", async () => {
            const wethAmount = ethers.parseEther("1")
            const minAmount = await s.Master.getMinAmountReceived(
                wethAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                100 // 1% slippage
            )
            expect(minAmount).to.eq(ethers.parseUnits("1980", 6)) // 2000 * 0.99
        })

        it("Should handle 50% slippage", async () => {
            const wethAmount = ethers.parseEther("1")
            const minAmount = await s.Master.getMinAmountReceived(
                wethAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                5000 // 50% slippage
            )
            expect(minAmount).to.eq(ethers.parseUnits("1000", 6)) // 2000 * 0.5
        })

        it("Should handle 100% slippage (edge case)", async () => {
            const wethAmount = ethers.parseEther("1")
            const minAmount = await s.Master.getMinAmountReceived(
                wethAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                10000 // 100% slippage
            )
            expect(minAmount).to.eq(0) // 2000 * 0 = 0
        })

        it("Should handle fractional slippage correctly", async () => {
            const wethAmount = ethers.parseEther("1")
            const minAmount = await s.Master.getMinAmountReceived(
                wethAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                25 // 0.25% slippage
            )
            expect(minAmount).to.eq(ethers.parseUnits("1995", 6)) // 2000 * 0.9975
        })

        it("Should handle small amounts with slippage", async () => {
            const smallAmount = ethers.parseUnits("1", 16) // 0.01 ETH
            const minAmount = await s.Master.getMinAmountReceived(
                smallAmount,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                500 // 5% slippage
            )
            // 0.01 ETH @ $2000 = $20, with 5% slippage = $19
            expect(minAmount).to.eq(ethers.parseUnits("19", 6))
        })
    })

    describe("Minimum Order Size Edge Cases", () => {
        before(async () => {
            await s.Master.connect(s.Frank).setMinOrderSize(ethers.parseUnits("10", 8)) // $10 minimum
            await s.wethOracle.setPrice(ethers.parseUnits("2000", 8)) // $2000 per ETH
        })

        it("Should pass for order exactly at minimum", async () => {
            // $10 worth of ETH = 0.005 ETH
            const exactMinAmount = ethers.parseUnits("5", 15) // 0.005 ETH
            await s.Master.checkMinOrderSize(await s.WETH.getAddress(), exactMinAmount)
            // Should not revert
        })

        it("Should fail for order just below minimum", async () => {
            // Slightly less than $10 worth
            const belowMinAmount = ethers.parseUnits("49", 14) // 0.0049 ETH = $9.80
            await expect(s.Master.checkMinOrderSize(await s.WETH.getAddress(), belowMinAmount))
                .to.be.revertedWith("order too small")
        })

        it("Should handle very large orders", async () => {
            const largeAmount = ethers.parseEther("1000") // 1000 ETH = $2M
            await s.Master.checkMinOrderSize(await s.WETH.getAddress(), largeAmount)
            // Should not revert
        })

        it("Should handle different token decimals for minimum check", async () => {
            await s.usdcOracle.setPrice(ethers.parseUnits("1", 8)) // $1 per USDC
            
            // $10 worth of USDC = 10 USDC (6 decimals)
            const usdcAmount = ethers.parseUnits("10", 6)
            await s.Master.checkMinOrderSize(await s.USDC.getAddress(), usdcAmount)
            // Should not revert
            
            // Just below minimum
            const belowMinUsdc = ethers.parseUnits("999", 4) // 9.99 USDC
            await expect(s.Master.checkMinOrderSize(await s.USDC.getAddress(), belowMinUsdc))
                .to.be.revertedWith("order too small")
        })

        it("Should handle tokens with very high prices", async () => {
            await testOracle1.setPrice(ethers.parseUnits("100000", 8)) // $1M per token
            await s.Master.connect(s.Frank).registerOracle([testToken1], [testOracle1])
            
            // Small amount that will result in > $10 USD value with high price
            // Price is $100,000 = 10^13 in 1e8 format
            // MOS is $10 = 10^9 in 1e8 format  
            // Need: amount * 10^13 / 10^18 >= 10^9
            // Therefore: amount >= 10^14
            const smallAmount = ethers.parseUnits("1", 14) // 10^14 wei
            await s.Master.checkMinOrderSize(testToken1, smallAmount)
            // Should not revert because small amount * high price > minimum
        })

        it("Should handle tokens with very low prices", async () => {
            await testOracle2.setPrice(1) // $0.00000001 per token (1 in 1e8 terms)
            await s.Master.connect(s.Frank).registerOracle([testToken2], [testOracle2])
            
            // Need huge amounts for low price tokens to meet minimum
            const hugeAmount = ethers.parseEther("1000000000") // 1B tokens
            await s.Master.checkMinOrderSize(testToken2, hugeAmount)
            // Should not revert
            
            // Smaller amount should fail
            const smallAmount = ethers.parseEther("1000") // 1K tokens = $0.00001
            await expect(s.Master.checkMinOrderSize(testToken2, smallAmount))
                .to.be.revertedWith("order too small")
        })
    })

    describe("Oracle Price Update Edge Cases", () => {
        let orderId: bigint

        before(async () => {
            // Create an order to test price change impacts
            await s.WETH.connect(s.Gary).approve(await s.Bracket.getAddress(), ethers.parseEther("0.1"))
            await s.Bracket.connect(s.Gary).createOrder(
                "0x",
                ethers.parseUnits("2100", 8), // Take profit at $21
                ethers.parseUnits("1900", 8), // Stop at $19  
                ethers.parseEther("0.1"),
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

        it("Should trigger order when price moves to exact trigger point", async () => {
            // Set price to exact take profit
            await s.wethOracle.setPrice(ethers.parseUnits("2100", 8))
            
            const result = await s.Master.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true
        })

        it("Should trigger order when price moves beyond trigger point", async () => {
            // Set price beyond take profit
            await s.wethOracle.setPrice(ethers.parseUnits("2200", 8))
            
            const result = await s.Master.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true
        })

        it("Should not trigger when price is close but not at trigger", async () => {
            // Set price just below take profit
            await s.wethOracle.setPrice(ethers.parseUnits("2099", 8))
            
            const result = await s.Master.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.false
        })

        it("Should handle rapid price changes", async () => {
            // Simulate rapid price movements
            await s.wethOracle.setPrice(ethers.parseUnits("1800", 8)) // Below stop
            let result = await s.Master.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true
            
            await s.wethOracle.setPrice(ethers.parseUnits("2000", 8)) // Back to normal
            result = await s.Master.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.false
            
            await s.wethOracle.setPrice(ethers.parseUnits("2200", 8)) // Above take profit
            result = await s.Master.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.true
        })

        it("Should handle price at extreme boundaries", async () => {
            // Test with maximum uint256 price (theoretical)
            const maxPrice = ethers.MaxUint256
            
            // This might overflow, so we expect it to revert or handle gracefully
            try {
                await s.wethOracle.setPrice(maxPrice)
                const result = await s.Master.checkUpkeep("0x")
                // If it doesn't revert, it should still work logically
                expect(result.upkeepNeeded).to.be.true // Max price should trigger take profit
            } catch (error: any) {
                // Overflow is acceptable behavior
                expect(error.message).to.include("overflow")
            }
            
            // Reset to reasonable price
            await s.wethOracle.setPrice(ethers.parseUnits("2000", 8))
        })

        after(async () => {
            // Clean up
            try {
                await s.Bracket.connect(s.Gary).cancelOrder(orderId)
            } catch (e) {
                // Order might be filled during tests
            }
        })
    })

    describe("Oracle Failure Scenarios", () => {
        it("Should revert exchange rate calculation with unregistered oracle", async () => {
            const unregisteredToken = await new PlaceholderOracle__factory(s.Frank).deploy(await s.WETH.getAddress())
            
            // Try to get exchange rate with unregistered token
            await expect(s.Master.getExchangeRate(unregisteredToken, await s.USDC.getAddress()))
                .to.be.reverted // Should revert when calling oracle that doesn't exist
        })

        it("Should handle oracle returning zero price", async () => {
            await testOracle1.setPrice(0)
            await s.Master.connect(s.Frank).registerOracle([testToken1], [testOracle1])
            
            // This should cause division by zero or very large numbers
            try {
                const rate = await s.Master.getExchangeRate(await s.USDC.getAddress(), testToken1)
                // If it doesn't revert, the rate should be very large
                expect(rate).to.be.gt(ethers.parseUnits("1000000", 8))
            } catch (error: any) {
                // Division by zero or invalid price is acceptable behavior
                expect(error.message).to.satisfy((msg: string) => 
                    msg.includes("division by zero") || 
                    msg.includes("Invalid priceOut")
                )
            }
        })
    })

    describe("Price Precision Edge Cases", () => {
        it("Should handle minimum non-zero prices", async () => {
            await testOracle1.setPrice(1) // Minimum price: 1 wei in 1e8 terms = $0.00000001
            await testOracle2.setPrice(ethers.parseUnits("1", 8)) // $1
            await s.Master.connect(s.Frank).registerOracle([testToken1, testToken2], [testOracle1, testOracle2])
            
            const rate = await s.Master.getExchangeRate(testToken1, testToken2)
            // 1 / 100000000 = 0.00000001, but in 1e8 format: 1 / 1e8 * 1e8 = 1
            expect(rate).to.eq(1) // Actual calculation: 1 * 1e8 / 1e8 = 1
        })

        it("Should maintain precision with similar prices", async () => {
            await testOracle1.setPrice(ethers.parseUnits("1.001", 8)) // $1.001
            await testOracle2.setPrice(ethers.parseUnits("1.000", 8)) // $1.000
            
            const rate = await s.Master.getExchangeRate(testToken1, testToken2)
            expect(rate).to.eq(ethers.parseUnits("1.001", 8)) // Should maintain precision
        })

        it("Should handle intermediate calculation overflow protection", async () => {
            // Set very large prices that might cause intermediate overflow
            const largePrice = ethers.parseUnits("999999999", 8) // Close to max for 1e8 scaled
            await testOracle1.setPrice(largePrice)
            await testOracle2.setPrice(1)
            
            try {
                const rate = await s.Master.getExchangeRate(testToken1, testToken2)
                // If successful, rate should be very large
                expect(rate).to.be.gt(ethers.parseUnits("1000000", 8))
            } catch (error: any) {
                // Overflow protection is acceptable
                expect(error.message).to.include("overflow")
            }
        })
    })
})