import { AutomationMaster__factory, Bracket__factory, IERC20__factory, OracleLess__factory, PlaceholderOracle__factory, StopLimit__factory } from "../../typechain-types"
import { expect } from "chai"
import { stealMoney } from "../../util/money"
import { s } from "./scope"
import { DeployContract } from "../../util/deploy"
import { ethers } from "hardhat"
import { a } from "../../util/addresser"

describe("AutomationMaster Comprehensive Tests", () => {

    before(async () => {
        // Deploy a fresh AutomationMaster and its dependencies to ensure a clean state
        s.Master = await DeployContract(new AutomationMaster__factory(s.Frank), s.Frank, await s.Frank.getAddress())

        // Deploy Bracket
        s.Bracket = await DeployContract(new Bracket__factory(s.Frank), s.Frank, await s.Master.getAddress(), a.permit2, await s.Frank.getAddress())

        // Deploy StopLimit
        s.StopLimit = await DeployContract(
            new StopLimit__factory(s.Frank),
            s.Frank,
            await s.Master.getAddress(),
            await s.Bracket.getAddress(),
            a.permit2,
            await s.Frank.getAddress()
        )


        // Deploy OracleLess for pausable tests
        s.OracleLess = await DeployContract(new OracleLess__factory(s.Frank), s.Frank, await s.Master.getAddress(), a.permit2, await s.Frank.getAddress())

        // Deploy fresh oracles
        s.wethOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await s.WETH.getAddress())
        s.usdcOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await s.USDC.getAddress())

        // Register sub-keepers
        await s.Master.connect(s.Frank).registerSubKeepers(await s.StopLimit.getAddress(), await s.Bracket.getAddress(), await s.OracleLess.getAddress())

        // Register oracles
        const tokens = [await s.WETH.getAddress(), await s.USDC.getAddress()]
        const oracles = [await s.wethOracle.getAddress(), await s.usdcOracle.getAddress()]
        await s.Master.connect(s.Frank).registerOracle(tokens, oracles)
    })

    describe("Initialization and Setup", () => {
        it("Should set correct owner", async () => {
            expect(await s.Master.owner()).to.eq(await s.Frank.getAddress())
        })

        it("Should have zero initial values", async () => {
            expect(await s.Master.maxPendingOrders()).to.eq(0)
            expect(await s.Master.minOrderSize()).to.eq(0)
            expect(await s.Master.orderFee()).to.eq(0)
        })

        it("Should not receive ether from unknown senders", async () => {
            await expect(s.Bob.sendTransaction({
                to: await s.Master.getAddress(),
                value: ethers.parseEther("1")
            })).to.be.revertedWith("Invalid recipient or uninitialized children")
        })
    })

    describe("Access Control", () => {
        it("Should revert when non-owner calls onlyOwner functions", async () => {
            await expect(s.Master.connect(s.Bob).setOrderFee(100)).to.be.revertedWith("Ownable: caller is not the owner")
            await expect(s.Master.connect(s.Bob).setMinOrderSize(1000)).to.be.revertedWith("Ownable: caller is not the owner")
            await expect(s.Master.connect(s.Bob).setMaxPendingOrders(50)).to.be.revertedWith("Ownable: caller is not the owner")
            await expect(s.Master.connect(s.Bob).whitelistTargetSetter(await s.Bob.getAddress(), true)).to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("Should allow owner to call onlyOwner functions", async () => {
            await s.Master.connect(s.Frank).setOrderFee(100)
            expect(await s.Master.orderFee()).to.eq(100)

            await s.Master.connect(s.Frank).setMinOrderSize(1000)
            expect(await s.Master.minOrderSize()).to.eq(1000)

            await s.Master.connect(s.Frank).setMaxPendingOrders(50)
            expect(await s.Master.maxPendingOrders()).to.eq(50)
        })
    })

    describe("Target Whitelisting", () => {
        it("Should revert when non-whitelisted setter tries to whitelist targets", async () => {
            await expect(s.Master.connect(s.Bob).whitelistTargets([s.router02])).to.be.revertedWith("!Allowed to set targets")
        })

        it("Should allow whitelisted setter to whitelist targets", async () => {
            await s.Master.connect(s.Frank).whitelistTargetSetter(await s.Bob.getAddress(), true)
            expect(await s.Master.targetSetters(await s.Bob.getAddress())).to.be.true

            await s.Master.connect(s.Bob).whitelistTargets([s.router02])
            expect(await s.Master.safeTargets(s.router02)).to.be.true

            // Should toggle when called again
            await s.Master.connect(s.Bob).whitelistTargets([s.router02])
            expect(await s.Master.safeTargets(s.router02)).to.be.false
        })

        it("Should validate targets correctly", async () => {
            await s.Master.connect(s.Bob).whitelistTargets([s.router02]) // Set to true
            await s.Master.validateTarget(s.router02) // Should not revert

            await expect(s.Master.validateTarget(await s.Andy.getAddress())).to.be.revertedWith("Target !Valid")
        })

        it("Should remove target setter permission", async () => {
            await s.Master.connect(s.Frank).whitelistTargetSetter(await s.Bob.getAddress(), false)
            expect(await s.Master.targetSetters(await s.Bob.getAddress())).to.be.false
            await expect(s.Master.connect(s.Bob).whitelistTargets([s.router02])).to.be.revertedWith("!Allowed to set targets")
        })
    })

    describe("Oracle Management", () => {
        let testToken1: any, testToken2: any
        let testOracle1: any, testOracle2: any

        before(async () => {
            testToken1 = IERC20__factory.connect("0x4200000000000000000000000000000000000042", s.Frank) // OP
            testToken2 = IERC20__factory.connect("0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0", s.Frank) // UNI
            testOracle1 = await new PlaceholderOracle__factory(s.Frank).deploy(await testToken1.getAddress())
            testOracle2 = await new PlaceholderOracle__factory(s.Frank).deploy(await testToken2.getAddress())
        })

        it("Should revert with mismatched array lengths", async () => {
            await expect(s.Master.connect(s.Frank).registerOracle([testToken1], [testOracle1, testOracle2]))
                .to.be.revertedWith("Array Length Mismatch")
        })

        it("Should register oracles correctly", async () => {
            await s.Master.connect(s.Frank).registerOracle([testToken1, testToken2], [testOracle1, testOracle2])

            expect(await s.Master.oracles(await testToken1.getAddress())).to.eq(await testOracle1.getAddress())
            expect(await s.Master.oracles(await testToken2.getAddress())).to.eq(await testOracle2.getAddress())

            const registeredTokens = await s.Master.getRegisteredTokens()
            expect(registeredTokens.length).to.be.gte(2)
        })

        it("Should delist token by setting oracle to zero address", async () => {
            const zeroAddress = "0x0000000000000000000000000000000000000000"
            await s.Master.connect(s.Frank).registerOracle([testToken1], [zeroAddress])

            expect(await s.Master.oracles(await testToken1.getAddress())).to.eq(zeroAddress)
        })

        it("Should calculate exchange rates correctly", async () => {
            await testOracle1.setPrice(ethers.parseUnits("2000", 8)) // $20.00
            await testOracle2.setPrice(ethers.parseUnits("1000", 8)) // $10.00

            // Re-register oracle
            await s.Master.connect(s.Frank).registerOracle([testToken1], [await testOracle1.getAddress()])

            const exchangeRate = await s.Master.getExchangeRate(testToken1, testToken2)
            expect(exchangeRate).to.eq(ethers.parseUnits("2", 8)) // 2000/1000 = 2
        })
    })
    
    describe("Minimum Amount Calculations", () => {
        before(async () => {
            // Set up test oracles with known prices
            await s.wethOracle.setPrice(ethers.parseUnits("3000", 8)) // $3000
            await s.usdcOracle.setPrice(ethers.parseUnits("1", 8)) // $1
        })

        it("Should calculate minimum amount correctly with no slippage", async () => {
            const amountIn = ethers.parseEther("1") // 1 WETH
            const minAmount = await s.Master.getMinAmountReceived(
                amountIn,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                0 // 0% slippage
            )
            // 1 WETH @ $3000 = 3000 USDC (accounting for decimals)
            expect(minAmount).to.eq(ethers.parseUnits("3000", 6))
        })

        it("Should calculate minimum amount correctly with slippage", async () => {
            const amountIn = ethers.parseEther("1") // 1 WETH
            const minAmount = await s.Master.getMinAmountReceived(
                amountIn,
                await s.WETH.getAddress(),
                await s.USDC.getAddress(),
                500 // 5% slippage
            )
            // 1 WETH @ $3000 = 3000 USDC, minus 5% = 2850 USDC
            expect(minAmount).to.eq(ethers.parseUnits("2850", 6))
        })

        it("Should handle different decimal tokens correctly", async () => {
            // Test with different decimal combinations
            const amountIn = ethers.parseUnits("1000", 6) // 1000 USDC
            const minAmount = await s.Master.getMinAmountReceived(
                amountIn,
                await s.USDC.getAddress(),
                await s.WETH.getAddress(),
                0 // 0% slippage
            )
            // 1000 USDC @ $1 = $1000, $1000 / $3000 = 0.333... WETH
            expect(minAmount).to.be.closeTo(ethers.parseEther("0.333333333333333333"), ethers.parseEther("0.001"))
        })
    })

    describe("Minimum Order Size Validation", () => {
        before(async () => {
            await s.Master.connect(s.Frank).setMinOrderSize(ethers.parseUnits("100", 8)) // $100 minimum
            await s.wethOracle.setPrice(ethers.parseUnits("3000", 8)) // $3000
        })

        it("Should revert for orders below minimum size", async () => {
            const smallAmount = ethers.parseEther("0.01") // 0.01 WETH = $30
            await expect(s.Master.checkMinOrderSize(await s.WETH.getAddress(), smallAmount))
                .to.be.revertedWith("order too small")
        })

        it("Should pass for orders above minimum size", async () => {
            const largeAmount = ethers.parseEther("0.1") // 0.1 WETH = $300
            await s.Master.checkMinOrderSize(await s.WETH.getAddress(), largeAmount) // Should not revert
        })
    })

    describe("Pausable Functionality", () => {
        it("Should pause and unpause correctly", async () => {
            expect(await s.Master.paused()).to.be.false

            await s.Master.connect(s.Frank).pauseAll(true)
            expect(await s.Master.paused()).to.be.true

            await s.Master.connect(s.Frank).pauseAll(false)
            expect(await s.Master.paused()).to.be.false
        })

        it("Should revert performUpkeep when paused", async () => {
            await s.Master.connect(s.Frank).pauseAll(true)

            const mockData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8,address,bytes,uint96,uint96,address,address,uint16,uint256,uint256)"],
                [[0, await s.Master.getAddress(), "0x", 0, 0, await s.WETH.getAddress(), await s.USDC.getAddress(), 0, 0, 0]]
            )

            await expect(s.Master.performUpkeep(mockData)).to.be.revertedWithCustomError(s.Master, "EnforcedPause")
            await s.Master.connect(s.Frank).pauseAll(false)
        })
    })

    describe("Fee Sweeping", () => {
        before(async () => {
            // Add some test tokens to sweep
            await stealMoney(s.usdcWhale, await s.Master.getAddress(), await s.USDC.getAddress(), ethers.parseUnits("100", 6))
        })

        it("Should sweep ERC20 tokens to owner", async () => {
            const initialBalance = await s.USDC.balanceOf(await s.Frank.getAddress())
            const contractBalance = await s.USDC.balanceOf(await s.Master.getAddress())

            await s.Master.connect(s.Frank).sweep(await s.USDC.getAddress(), await s.Frank.getAddress())

            const finalBalance = await s.USDC.balanceOf(await s.Frank.getAddress())
            expect(finalBalance).to.eq(initialBalance + contractBalance)
            expect(await s.USDC.balanceOf(await s.Master.getAddress())).to.eq(0)
        })

        it("Should revert ether sweep with zero balance", async () => {
            const initBalance = await ethers.provider.getBalance(await s.Master.getAddress())
            expect(initBalance).to.eq(0, "No ether to withdraw")
            await expect(s.Master.connect(s.Frank).sweepEther(await s.Frank.getAddress()))
                .to.be.revertedWith("No Ether to withdraw")
        })

        it("Should revert ether sweep to zero address", async () => {
            await expect(s.Master.connect(s.Frank).sweepEther("0x0000000000000000000000000000000000000000"))
                .to.be.revertedWith("Recipient cannot be the zero address")
        })

        /**
         * successful sweep tested in happy
        it("Should sweep ether successfully", async () => {
            const initialBalance = await ethers.provider.getBalance(await s.Frank.getAddress())
            const contractBalance = await ethers.provider.getBalance(await s.Master.getAddress())
            
            const tx = await s.Master.connect(s.Frank).sweepEther(await s.Frank.getAddress())
            const receipt = await tx.wait()
            const gasUsed = receipt!.gasUsed * receipt!.gasPrice
            
            const finalBalance = await ethers.provider.getBalance(await s.Frank.getAddress())
            expect(finalBalance).to.be.closeTo(initialBalance + contractBalance - gasUsed, ethers.parseEther("0.001"))
        })
        */
    })


    describe("Sub Keeper Registration", () => {
        it("Should register sub keepers correctly", async () => {
            // Verify sub keepers are registered (from previous setup)
            expect(await s.Master.STOP_LIMIT_CONTRACT()).to.eq(await s.StopLimit.getAddress())
            expect(await s.Master.BRACKET_CONTRACT()).to.eq(await s.Bracket.getAddress())
        })
    })

    describe("CheckUpkeep and PerformUpkeep", () => {
        it("Should return false when no upkeep needed", async () => {
            const result = await s.Master.checkUpkeep("0x")
            expect(result.upkeepNeeded).to.be.false
        })

        it("Should revert performUpkeep with invalid order type", async () => {
            const invalidData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint8,address,bytes,uint96,uint96,address,address,uint16,uint256,uint256)"],
                [[99, await s.Master.getAddress(), "0x", 0, 0, await s.WETH.getAddress(), await s.USDC.getAddress(), 0, 0, 0]] // Invalid order type 99
            )

            // This will generic revert as it fails to decode the data
            expect(s.Master.performUpkeep(invalidData)).to.be.reverted
        })
    })
})