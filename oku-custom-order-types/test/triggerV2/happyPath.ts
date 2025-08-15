import { AutomationMaster__factory, Bracket__factory, IERC20__factory, OracleLess__factory, PlaceholderOracle__factory, StopLimit__factory, UniswapV3Pool__factory } from "../../typechain-types"
import { currentBlock, hardhat_mine_timed, resetCurrentOPblock } from "../../util/block"
import { expect } from "chai"
import { stealMoney } from "../../util/money"
import { decodeUpkeepData, generateUniTx, generateUniTxData, getGas, MasterUpkeepData } from "../../util/msc"
import { s, SwapParams } from "./scope"
import { DeployContract } from "../../util/deploy"
import { ethers } from "hardhat"
import { a } from "../../util/addresser"
import { AbiCoder } from "ethers"

const abiCoder = new ethers.AbiCoder();

///All tests are performed as if on Optimism
///Testing is on the OP WETH/USDC pool @ 500
describe("Automated Trigger Testing on Optimism", () => {

    before(async () => {
        console.log("STARTING")
        await resetCurrentOPblock(123125629)
        console.log("Testing on OP @", (await currentBlock())?.number)

        //connect to signers
        s.signers = await ethers.getSigners()
        s.Frank = s.signers[0]
        s.Andy = s.signers[1]
        s.Bob = s.signers[2]
        s.Charles = s.signers[3]
        s.Steve = s.signers[4]
        s.Oscar = s.signers[5]
        s.Gary = s.signers[6]

        s.UniPool = UniswapV3Pool__factory.connect(s.pool, s.Frank)
        s.WETH = IERC20__factory.connect(await s.UniPool.token1(), s.Frank)
        s.USDC = IERC20__factory.connect(await s.UniPool.token0(), s.Frank)
        s.OP = IERC20__factory.connect("0x4200000000000000000000000000000000000042", s.Frank)
        s.UNI = IERC20__factory.connect("0x6fd9d7AD17242c41f7131d257212c54A0e816691", s.Frank)

    })

    it("Deploy", async () => {
        //deploy master
        s.Master = await DeployContract(new AutomationMaster__factory(s.Frank), s.Frank, await s.Frank.getAddress())
        //deploy stop loss limit
        s.Bracket = await DeployContract(new Bracket__factory(s.Frank), s.Frank, await s.Master.getAddress(), a.permit2, await s.Frank.getAddress())

        //deploy stop limit
        s.StopLimit = await DeployContract(
            new StopLimit__factory(s.Frank),
            s.Frank,
            await s.Master.getAddress(),
            await s.Bracket.getAddress(),
            a.permit2,
            await s.Frank.getAddress()
        )

        s.OracleLess = await DeployContract(new OracleLess__factory(s.Frank), s.Frank, await s.Master.getAddress(), a.permit2, await s.Frank.getAddress())


        //deploy test oracles
        s.wethOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await s.WETH.getAddress())
        s.usdcOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await s.USDC.getAddress())
        s.uniOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await s.UNI.getAddress())
        s.opOracle = await new PlaceholderOracle__factory(s.Frank).deploy(await s.OP.getAddress())



    })

    it("Register", async () => {

        //whitelist target setters
        //now bob can set the target
        expect(s.Master.connect(s.Bob).whitelistTargetSetter(await s.Bob.getAddress(), true)).to.be.revertedWith('only owner')
        await s.Master.connect(s.Frank).whitelistTargetSetter(await s.Bob.getAddress(), true)

        //whitelist targets
        expect(s.Master.connect(s.Frank).whitelistTargets([s.router02])).to.be.revertedWith("!Allowed to set targets")
        await s.Master.connect(s.Bob).whitelistTargets([s.router02])

        //register sup keepers
        await s.Master.connect(s.Frank).registerSubKeepers(await s.StopLimit.getAddress(), await s.Bracket.getAddress(), await s.OracleLess.getAddress())

        //register oracles
        const tokens = [await s.WETH.getAddress(), await s.USDC.getAddress(), await s.UNI.getAddress(), await s.OP.getAddress()]
        const oracles = [await s.wethOracle.getAddress(), await s.usdcOracle.getAddress(), await s.uniOracle.getAddress(), await s.opOracle.getAddress()]
        await s.Master.connect(s.Frank).registerOracle(tokens, oracles)

        //set max pending orders
        await s.Master.connect(s.Frank).setMaxPendingOrders(s.maxPendingOrders)

        //set min order size 1000000000n
        await s.Master.connect(s.Frank).setMinOrderSize(s.minOrderSize)

        //set fee
        await s.Master.setOrderFee(s.fee)

    })

    it("Check upkeep", async () => {

        //should be no upkeep needed yet
        const result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(false)
    })
})

/**
 * stop-limit orders create a limit order once strike price is reached
 * stop price is the fill price for stop-limit
 * strike price is the fill price for the limit order once it is created
 */
describe("Execute Stop-Limit Upkeep", () => {

    let orderId: BigInt
    const stopDelta = ethers.parseUnits("500", 8)//create limit order when price reaches stop
    const strikeDelta = ethers.parseUnits("100", 8)//close limit order when price reaches strike
    const strikeBips = 200
    //setup
    before(async () => {
        //steal money for s.Bob
        await stealMoney(s.wethWhale, await s.Bob.getAddress(), await s.WETH.getAddress(), s.wethAmount)
        //reset test oracle price
        await s.wethOracle.setPrice(s.initialEthPrice)
        await s.usdcOracle.setPrice(s.initialUsdcPrice)
        await s.uniOracle.setPrice(s.initialUniPrice)
        await s.opOracle.setPrice(s.initialOpPrice)

    })

    it("Create stop-limit order WETH => USDC", async () => {
        const currentPrice = await s.Master.getExchangeRate(await s.WETH.getAddress(), await s.USDC.getAddress())
        await s.WETH.connect(s.Bob).approve(await s.StopLimit.getAddress(), s.wethAmount)
        await s.StopLimit.connect(s.Bob).createOrder(
            currentPrice - stopDelta,
            (currentPrice + stopDelta) + strikeDelta,
            (currentPrice - stopDelta) - strikeDelta,
            s.wethAmount,
            await s.WETH.getAddress(),
            await s.USDC.getAddress(),
            await s.Bob.getAddress(),
            5,//5 bips fee
            strikeBips,
            strikeBips,
            0,//no stop loss bips
            false,//no swap on fill
            "0x",
            { value: s.fee }
        )

        const filter = s.StopLimit.filters.StopLimitOrderCreated
        const events = await s.StopLimit.queryFilter(filter, -1)
        const event = events[0].args
        orderId = (event[0])
        expect(orderId).to.not.eq(0, "First order Id")

        //verify pending order exists
        const list = await s.StopLimit.getPendingOrders()
        expect(list.length).to.eq(1, "1 pending order")

        //verify our input token was received
        const balance = await s.WETH.balanceOf(await s.StopLimit.getAddress())
        expect(balance).to.eq(s.wethAmount, "WETH received")

    })

    it("Check upkeep", async () => {
        //should be no upkeep needed yet
        await hardhat_mine_timed(10, 10)
        let initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)
        initial = await s.StopLimit.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

        //confirm order pricing is correct
        const order = await s.StopLimit.orders(orderId.toString())
        let currentPrice = await s.Master.getExchangeRate(await s.WETH.getAddress(), await s.USDC.getAddress())

        //reduce to stop limit price + 1
        await s.wethOracle.setPrice(order.stopLimitPrice + BigInt(ethers.parseUnits("1", 8)))
        await hardhat_mine_timed(10, 10)
        initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)
        initial = await s.StopLimit.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

        //increase price to over take profit, should not trigger
        await s.wethOracle.setPrice(order.takeProfit + BigInt(ethers.parseUnits("1", 8)))
        await hardhat_mine_timed(10, 10)
        initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)
        initial = await s.StopLimit.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

        //reduce price to stop limit price to trigger order
        await s.wethOracle.setPrice(order.stopLimitPrice - BigInt(ethers.parseUnits("1", 8)))
        await hardhat_mine_timed(10, 10)

        //check upkeep
        let result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
        result = await s.StopLimit.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")

    })


    it("Perform Upkeep", async () => {
        //check upkeep
        const result = await s.Master.checkUpkeep("0x")

        //no data manipultation is needed, simply pass on to perform
        await s.Master.performUpkeep(result.performData)

    })

    it("Verify", async () => {

        //expect USDC to be removed from stopLimit contract
        let balance = await s.WETH.balanceOf(await s.StopLimit.getAddress())
        expect(balance).to.be.eq(0n, "WETH removed from stopLimit")

        //pending order removed and length == 0
        expect((await s.StopLimit.getPendingOrders()).length).to.eq(0, "no pending orders left")

        //stop-limit order filled event
        const Filter = s.StopLimit.filters.StopLimitOrderProcessed
        const Events = await s.StopLimit.queryFilter(Filter, -1)
        const Event = Events[0].args
        expect(Event.orderId).to.eq(orderId, "Order Id correct")

        //no tokens left on contract
        expect(await s.WETH.balanceOf(await s.StopLimit.getAddress())).to.eq(0n, "0 WETH left on contract")
        expect(await s.USDC.balanceOf(await s.StopLimit.getAddress())).to.eq(0n, "0 USDC left on contract")

        //check upkeep
        const check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false, "no upkeep is needed anymore")


        const filter = s.Bracket.filters.BracketOrderCreated
        const events = await s.Bracket.queryFilter(filter, -1)
        const event = events[0].args
        expect(event[0]).to.eq(orderId, "First order Id")

        //verify pending order exists
        const list = await s.Bracket.getPendingOrders()
        expect(list.length).to.eq(1, "1 pending order")

        //verify our input token was received
        balance = await s.WETH.balanceOf(await s.Bracket.getAddress())
        expect(balance).to.eq(s.wethAmount, "WETH received")

        //cancel limit order for future tests
        await s.Bracket.connect(s.Bob).cancelOrder(orderId as bigint)
    })
})

/**
 * For swap on fill, we expect to receive the same asset we provide
 * In this case, we provide USDC, swap to WETH when the stop limit is filled, 
 * and when the resulting limit order closes, we expect our WETH to be swapped back to USDC
**/
describe("Execute Stop-Limit with swap on fill", () => {
    //0.00029475 => 3,392.70 per ETH
    //0.00029200 => 3424.66
    //as eth price goes up, recip UDSC => ETH price goes down
    const stopLimitPrice = ethers.parseUnits("0.000333", 8)//3k per eth

    //stop and strike price are in eth => usdc terms since we are doing swap on fill
    const strikePrice = ethers.parseUnits("3200", 8)//3.2k per eth
    const stopLoss = ethers.parseUnits("2800", 8)//2.8k per eth
    const strikeBips = 500
    const stopBips = 5000
    const swapBips = 5000//slippage needs to be high as we cannot actually change the price on the pool

    let charlesOrder: BigInt
    //setup
    before(async () => {
        //steal money 
        await stealMoney(s.usdcWhale, await s.Charles.getAddress(), await s.USDC.getAddress(), s.usdcAmount)
        //reset test oracle price
        await s.wethOracle.setPrice(s.initialEthPrice)
        await s.usdcOracle.setPrice(s.initialUsdcPrice)
        await s.uniOracle.setPrice(s.initialUniPrice)
        await s.opOracle.setPrice(s.initialOpPrice)
    })

    it("Create stop-limit order WETH => USDC with swap on fill", async () => {
        await s.USDC.connect(s.Charles).approve(await s.StopLimit.getAddress(), s.usdcAmount)
        await s.StopLimit.connect(s.Charles).createOrder(
            stopLimitPrice,
            strikePrice,
            stopLoss,
            s.usdcAmount,
            await s.USDC.getAddress(),//tokenIn
            await s.WETH.getAddress(),//tokenOut
            await s.Charles.getAddress(),
            5,//5 bips fee
            strikeBips,
            stopBips,//no stop loss bips
            swapBips,//no swap on fill bips
            true,//swap on fill
            "0x",
            { value: s.fee }
        )

        const filter = s.StopLimit.filters.StopLimitOrderCreated
        const events = await s.StopLimit.queryFilter(filter, -1)
        const event = events[0].args
        charlesOrder = event[0]
        expect(charlesOrder).to.not.eq(0, "Second order Id")

        //verify pending order exists
        const list = await s.StopLimit.getPendingOrders()
        expect(list.length).to.eq(1, "1 pending order")

        //verify our input token was received
        const balance = await s.USDC.balanceOf(await s.StopLimit.getAddress())
        expect(balance).to.eq(s.usdcAmount, "USDC received")

    })

    it("Check upkeep", async () => {

        //should be no upkeep needed yet
        let initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)
        initial = await s.StopLimit.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

        //reduce price to just above stop limit price
        await s.wethOracle.setPrice(ethers.parseUnits("3003", 8))

        initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)
        initial = await s.StopLimit.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

        //reduce price to just below stop limit price
        await s.wethOracle.setPrice(ethers.parseUnits("3000", 8))

        //check upkeep
        let result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
        result = await s.StopLimit.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
    })

    it("Perform upkeep", async () => {

        //check upkeep
        const result = await s.Master.checkUpkeep("0x")

        //get returned upkeep data
        const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)

        //get minAmountReceived
        const minAmountReceived = await s.Master.getMinAmountReceived(data.amountIn, data.tokenIn, data.tokenOut, data.bips)

        //generate encoded masterUpkeepData
        const encodedTxData = await generateUniTx(
            s.router02,
            s.UniPool,
            await s.Bracket.getAddress(),
            minAmountReceived,
            data
        )

        console.log("Gas to performUpkeep: ", await getGas(await s.Master.performUpkeep(encodedTxData)))

        const filter = s.Bracket.filters.BracketOrderCreated
        const events = await s.Bracket.queryFilter(filter, -1)
        const event = events[0].args
        expect(event[0]).to.eq(charlesOrder, "Charles order")

    })

    it("Verify", async () => {

        //stop limit pending order removed
        expect((await s.StopLimit.getPendingOrders()).length).to.eq(0, "no pending orders left")

        //bracket order created
        expect((await s.Bracket.getPendingOrders()).length).to.eq(1, "new pending order")
        const pendingOrders = await s.Bracket.getPendingOrders()
        expect(pendingOrders[0].orderId).to.eq(charlesOrder, "Charles's order is pending")
    })

    it("Check Upkeep", async () => {
        //no upkeep needed yet
        let check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false)

        //reduce price to below stop price
        await s.wethOracle.connect(s.Frank).setPrice(stopLoss - 60000000n)
        check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(true)

        //return to in range
        await s.wethOracle.connect(s.Frank).setPrice(ethers.parseUnits("3000", 8))
        check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false)

        //set price to fill price 
        await s.wethOracle.connect(s.Frank).setPrice(strikePrice)
        check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(true)
    })

    it("Perform Upkeep", async () => {
        //check upkeep
        const result = await s.Master.checkUpkeep("0x")

        //get returned upkeep data
        const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)

        //get minAmountReceived
        const minAmountReceived = await s.Master.getMinAmountReceived(data.amountIn, data.tokenIn, data.tokenOut, data.bips)

        //generate encoded masterUpkeepData
        const encodedTxData = await generateUniTx(
            s.router02,
            s.UniPool,
            await s.Bracket.getAddress(),
            minAmountReceived,
            data
        )

        console.log("Gas to performUpkeep: ", await getGas(await s.Master.performUpkeep(encodedTxData)))
    })

    it("Verify", async () => {

        expect((await s.Bracket.getPendingOrders()).length).to.eq(0, "no pending orders")
        //USDC received is not perfect as we do not attempt to manipulate the true uni pool price
        let balance = await s.USDC.balanceOf(await s.Charles.getAddress())
        expect(balance).to.be.closeTo(s.usdcAmount, 10000000, "USDC Received")
        expect((await s.Bracket.getPendingOrders()).length).to.eq(0, "no pending orders left on Bracket")
    })
})


/**
 * bracket orders create a limit order with an added stop loss
 * stop price is the fill price for the stop loss
 * strike price is the fill price for the limit order 
 * the stop and limit fill each have their own slippage
 * There is an option to swap on order create
 * In this example, we swap from USDC to WETH on order create, and swap back to USDC when it fills
 */
describe("Execute Bracket Upkeep", () => {


    const stopDelta = ethers.parseUnits("500", 8)
    const strikeDelta = ethers.parseUnits("100", 8)
    const strikeBips = 500
    const stopBips = 5000
    const swapInBips = 500

    let orderId: BigInt
    //setup
    before(async () => {
        //steal money for s.Bob
        await stealMoney(s.usdcWhale, await s.Bob.getAddress(), await s.USDC.getAddress(), s.usdcAmount)

        //reset test oracle price
        await s.wethOracle.setPrice(s.initialEthPrice)
        await s.usdcOracle.setPrice(s.initialUsdcPrice)
        await s.uniOracle.setPrice(s.initialUniPrice)
        await s.opOracle.setPrice(s.initialOpPrice)

        let initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

    })

    it("Create bracket order with swap USDC => WETH => USDC", async () => {
        const currentPrice = await s.Master.getExchangeRate(await s.WETH.getAddress(), await s.USDC.getAddress())
        await s.USDC.connect(s.Bob).approve(await s.Bracket.getAddress(), s.usdcAmount)
        const swapInData = await generateUniTxData(
            s.USDC,
            await s.WETH.getAddress(),
            s.usdcAmount,
            s.router02,
            s.UniPool,
            await s.Bracket.getAddress(),
            await s.Master.getMinAmountReceived(s.usdcAmount, await s.USDC.getAddress(), await s.WETH.getAddress(), swapInBips)
        )

        const swapParams: SwapParams = {
            swapTokenIn: await s.USDC.getAddress(),
            swapAmountIn: s.usdcAmount,
            swapTarget: s.router02,
            swapBips: swapInBips,
            txData: swapInData
        }

        const swapParamsTuple = [
            swapParams.swapTokenIn,           // Address (IERC20)
            BigInt(swapParams.swapAmountIn),   // uint256
            swapParams.swapTarget,             // Address
            swapParams.swapBips,               // uint32
            swapParams.txData                  // bytes
        ];

        const swapPayload = ethers.AbiCoder.defaultAbiCoder().encode(
            ["tuple(address,uint256,address,uint32,bytes)"], // Struct as a tuple
            [swapParamsTuple]                                // Data as a single tuple
        );
        //check for minOrderSize
        expect(s.Bracket.connect(s.Bob).createOrder(
            "0x",
            currentPrice + strikeDelta,
            currentPrice - stopDelta,
            1n,//tiny input amount
            await s.WETH.getAddress(),
            await s.USDC.getAddress(),
            await s.Bob.getAddress(),
            5,//5 bips fee
            strikeBips,
            stopBips,
            "0x",
            { value: s.fee }
        )).to.be.revertedWith("order too small")

        await s.Bracket.connect(s.Bob).createOrder(
            swapPayload,
            currentPrice + strikeDelta,
            currentPrice - stopDelta,
            s.wethAmount,
            await s.WETH.getAddress(),
            await s.USDC.getAddress(),
            await s.Bob.getAddress(),
            5,//5 bips fee
            strikeBips,
            stopBips,
            "0x",
            { value: s.fee }
        )

        const filter = s.Bracket.filters.BracketOrderCreated
        const events = await s.Bracket.queryFilter(filter, -1)
        const event = events[0].args
        orderId = event[0]
        expect(Number(event[0])).to.not.eq(0, "Third order")

        //verify pending order exists
        const list = await s.Bracket.getPendingOrders()
        expect(list.length).to.eq(1, "1 pending order")

        //verify our input token was received
        const balance = await s.WETH.balanceOf(await s.Bracket.getAddress())
        expect(balance).to.be.closeTo(s.wethAmount, 200000000000000000n, "WETH received")

    })


    it("Check upkeep", async () => {

        //should be no upkeep needed yet
        let initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)
        initial = await s.Bracket.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

        //increase price to strike price
        await s.wethOracle.setPrice(s.initialEthPrice + (strikeDelta))

        //check upkeep
        let result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
        result = await s.Bracket.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")

        //reset price
        await s.wethOracle.setPrice(s.initialEthPrice)

        //upkeep no longer needed
        result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(false)
        result = await s.Bracket.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(false)

        //decrease price to stop price
        await s.wethOracle.setPrice(s.initialEthPrice - (stopDelta))

        //upkeep needed again
        result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
        result = await s.Bracket.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")

        //check specific indexes
        let start = 0
        let finish = 1
        const abi = new AbiCoder()
        const encodedIdxs = abi.encode(["uint96", "uint96"], [start, finish])
        result = await s.Bracket.checkUpkeep(encodedIdxs)
        expect(result.upkeepNeeded).to.eq(true, "first idx updeep is needed")

        console.log("Checking from master")
        result = await s.Master.checkUpkeep(encodedIdxs)
        expect(result.upkeepNeeded).to.eq(true, "first idx updeep is needed")
    })

    it("Perform Upkeep - stop loss", async () => {
        //check upkeep
        const result = await s.Master.checkUpkeep("0x")

        //get returned upkeep data
        const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)

        //get minAmountReceived
        const minAmountReceived = await s.Master.getMinAmountReceived(data.amountIn, data.tokenIn, data.tokenOut, data.bips)

        //generate encoded masterUpkeepData
        const encodedTxData = await generateUniTx(
            s.router02,
            s.UniPool,
            await s.Bracket.getAddress(),
            minAmountReceived,
            data
        )

        console.log("Gas to performUpkeep: ", await getGas(await s.Master.performUpkeep(encodedTxData)))

    })

    it("Verify", async () => {
        //expect user to receive tokens
        const usdcBalance = await s.USDC.balanceOf(await s.Bob.getAddress())
        expect(usdcBalance).to.be.gt(0n, "USDC received")

        //pending order removed and length == 0
        expect((await s.Bracket.getPendingOrders()).length).to.eq(0, "no pending orders left")

        //event
        const filter = s.Bracket.filters.BracketOrderProcessed
        const events = await s.Bracket.queryFilter(filter, -1)
        const event = events[0].args
        expect(event.orderId).to.eq(orderId, "Order Id correct")

        //no tokens left on contract
        expect(await s.WETH.balanceOf(await s.Bracket.getAddress())).to.eq(0n, "0 s.WETH left on contract")
        expect(await s.USDC.balanceOf(await s.Bracket.getAddress())).to.eq(0n, "0 s.USDC left on contract")

        //check upkeep
        const check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false, "no upkeep is needed anymore")
    })
})


describe("Bracket order with order modification", () => {

    const stopDelta = ethers.parseUnits("500", 8)
    const strikeDelta = ethers.parseUnits("100", 8)
    const strikeBips = 500
    const stopBips = 5000
    const swapInBips = 500

    const amountInDelta = s.wethAmount / 4n
    let orderId: BigInt

    //setup
    before(async () => {
        //steal money for s.Bob
        await stealMoney(s.usdcWhale, await s.Bob.getAddress(), await s.USDC.getAddress(), s.usdcAmount)
        //reset test oracle price
        await s.wethOracle.setPrice(s.initialEthPrice)
        await s.usdcOracle.setPrice(s.initialUsdcPrice)
        await s.uniOracle.setPrice(s.initialUniPrice)
        await s.opOracle.setPrice(s.initialOpPrice)

        let initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

    })

    it("Create bracket order with swap USDC => WETH => USDC", async () => {
        const currentPrice = await s.Master.getExchangeRate(await s.WETH.getAddress(), await s.USDC.getAddress())
        await s.USDC.connect(s.Bob).approve(await s.Bracket.getAddress(), s.usdcAmount)
        const swapInData = await generateUniTxData(
            s.USDC,
            await s.WETH.getAddress(),
            s.usdcAmount,
            s.router02,
            s.UniPool,
            await s.Bracket.getAddress(),
            await s.Master.getMinAmountReceived(s.usdcAmount, await s.USDC.getAddress(), await s.WETH.getAddress(), swapInBips)
        )



        const swapParams: SwapParams = {
            swapTokenIn: await s.USDC.getAddress(),
            swapAmountIn: s.usdcAmount,
            swapTarget: s.router02,
            swapBips: swapInBips,
            txData: swapInData
        };

        const swapPayload = abiCoder.encode(
            [
                "tuple(address,uint256,address,uint32,bytes)"
            ],
            [
                [
                    swapParams.swapTokenIn,
                    swapParams.swapAmountIn,
                    swapParams.swapTarget,
                    swapParams.swapBips,
                    swapParams.txData
                ]
            ]
        );


        await s.Bracket.connect(s.Bob).createOrder(
            swapPayload,
            currentPrice + strikeDelta,
            currentPrice - stopDelta,
            s.wethAmount,
            await s.WETH.getAddress(),
            await s.USDC.getAddress(),
            await s.Bob.getAddress(),
            5,//5 bips fee
            strikeBips,
            stopBips,
            "0x",
            { value: s.fee }
        )

        const filter = s.Bracket.filters.BracketOrderCreated
        const events = await s.Bracket.queryFilter(filter, -1)
        const event = events[0].args
        expect(Number(event[0])).to.not.eq(0, "Fourth order")
        orderId = (event[0])

        //verify pending order exists
        const list = await s.Bracket.getPendingOrders()
        expect(list.length).to.eq(1, "1 pending order")

        //verify our input token was received
        const balance = await s.WETH.balanceOf(await s.Bracket.getAddress())
        expect(balance).to.be.closeTo(s.wethAmount, 200000000000000000n, "WETH received")

    })

    it("Modify order amountIn", async () => {
        const ogOrder = await s.Bracket.orders(orderId.toString())

        const ogWethBal = await s.WETH.balanceOf(await s.Bob.getAddress())

        //get pending order IDX
        const pendingOrders = await s.Bracket.getPendingOrders()

        //increase amount, providing more USDC to add to the position
        await s.WETH.connect(s.Bob).approve(await s.Bracket.getAddress(), amountInDelta)
        await s.Bracket.connect(s.Bob).modifyOrder(
            ethers.toBigInt(orderId.toString()),
            ethers.toBigInt(ogOrder.takeProfit),
            ethers.toBigInt(ogOrder.stopPrice),
            ethers.toBigInt(amountInDelta),
            ogOrder.tokenOut,
            ogOrder.recipient,
            ogOrder.takeProfitSlippage,
            ogOrder.stopSlippage,
            true,
            "0x",
            { value: s.fee }
        );

        //verify
        const increasedOrder = await s.Bracket.orders(ethers.toBigInt(orderId.toString()))

        expect(increasedOrder.amountIn).to.eq(ogOrder.amountIn + amountInDelta, "AmountIn correct")

        let balance = await s.WETH.balanceOf(await s.Bob.getAddress())
        expect(balance).to.eq(ogWethBal - amountInDelta, "Correct amount of weth taken")

        const incOrder = await s.Bracket.orders(orderId.toString())
        expect(incOrder.amountIn).to.eq(ogOrder.amountIn + amountInDelta, "New order is correct")


        //decrease the position back to the og amount, receiving the refund
        await s.Bracket.connect(s.Bob).modifyOrder(
            orderId.toString(),
            ethers.toBigInt(ogOrder.takeProfit),
            ethers.toBigInt(ogOrder.stopPrice),
            amountInDelta,
            ogOrder.tokenOut,
            ogOrder.recipient,
            ogOrder.takeProfitSlippage,
            ogOrder.stopSlippage,
            false,
            "0x",
            { value: s.fee }
        );

        balance = await s.WETH.balanceOf(await s.Bob.getAddress())
        expect(balance).to.eq(ogWethBal, "Correct amount of weth refunded")

        const decOrder = await s.Bracket.orders(orderId.toString())
        expect(decOrder.amountIn).to.eq(ogOrder.amountIn, "New order is correct")

    })

    it("Modify Order Strike Prices", async () => {

        let check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false)

        const currentPrice = await s.Master.getExchangeRate(await s.WETH.getAddress(), await s.USDC.getAddress())
        const ogOrder = await s.Bracket.orders(orderId.toString())
        const pendingOrders = await s.Bracket.getPendingOrders()
        //set stop above strike price
        await s.Bracket.connect(s.Bob).modifyOrder(
            orderId.toString(),
            ethers.toBigInt(ogOrder.takeProfit),
            ethers.toBigInt(ogOrder.takeProfit + 500000000n),
            0,
            ogOrder.tokenOut,
            ogOrder.recipient,
            ogOrder.takeProfitSlippage,
            ogOrder.stopSlippage,
            false,
            "0x",
            { value: s.fee }
        );
        //makes upkeep needed and will fill stop price and slippage
        check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(true)
        //reset back to original 
        await s.Bracket.connect(s.Bob).modifyOrder(
            orderId.toString(),
            ethers.toBigInt(ogOrder.takeProfit),
            ethers.toBigInt(ogOrder.stopPrice),
            0,
            ogOrder.tokenOut,
            ogOrder.recipient,
            ogOrder.takeProfitSlippage,
            ogOrder.stopSlippage,
            false,
            "0x",
            { value: s.fee }
        )
        check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false)

        //invert strike and stop prices
        await s.Bracket.connect(s.Bob).modifyOrder(
            orderId.toString(),
            ethers.toBigInt(ogOrder.stopPrice),
            ethers.toBigInt(ogOrder.takeProfit),
            0,
            ogOrder.tokenOut,
            ogOrder.recipient,
            ogOrder.takeProfitSlippage,
            ogOrder.stopSlippage,
            false,
            "0x",
            { value: s.fee }
        )
        //upkeep not needed
        check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false)

        //reset back to original for future tests
        await s.Bracket.connect(s.Bob).modifyOrder(
            orderId.toString(),
            ethers.toBigInt(ogOrder.takeProfit),
            ethers.toBigInt(ogOrder.stopPrice),
            0,
            ogOrder.tokenOut,
            ogOrder.recipient,
            ogOrder.takeProfitSlippage,
            ogOrder.stopSlippage,
            false,
            "0x",
            { value: s.fee }
        )
        check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false)
    })

    it("Check upkeep", async () => {

        //should be no upkeep needed yet
        let initial = await s.Master.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)
        initial = await s.Bracket.checkUpkeep("0x")
        expect(initial.upkeepNeeded).to.eq(false)

        //increase price to strike price
        await s.wethOracle.setPrice(s.initialEthPrice + (strikeDelta))

        //check upkeep
        let result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
        result = await s.Bracket.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")

        //reset price
        await s.wethOracle.setPrice(s.initialEthPrice)

        //upkeep no longer needed
        result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(false)
        result = await s.Bracket.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(false)

        //decrease price to stop price
        await s.wethOracle.setPrice(s.initialEthPrice - (stopDelta))

        //upkeep needed again
        result = await s.Master.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
        result = await s.Bracket.checkUpkeep("0x")
        expect(result.upkeepNeeded).to.eq(true, "Upkeep is now needed")
    })

    it("Perform Upkeep - stop loss", async () => {
        //check upkeep
        const result = await s.Master.checkUpkeep("0x")

        //get returned upkeep data
        const data: MasterUpkeepData = await decodeUpkeepData(result.performData, s.Frank)

        //get minAmountReceived
        const minAmountReceived = await s.Master.getMinAmountReceived(data.amountIn, data.tokenIn, data.tokenOut, data.bips)

        //generate encoded masterUpkeepData
        const encodedTxData = await generateUniTx(
            s.router02,
            s.UniPool,
            await s.Bracket.getAddress(),
            minAmountReceived,
            data
        )

        console.log("Gas to performUpkeep: ", await getGas(await s.Master.performUpkeep(encodedTxData)))

    })

    it("Verify", async () => {
        //expect user to receive tokens
        const usdcBalance = await s.USDC.balanceOf(await s.Bob.getAddress())
        expect(usdcBalance).to.be.gt(0n, "USDC received")

        //pending order removed and length == 0
        expect((await s.Bracket.getPendingOrders()).length).to.eq(0, "no pending orders left")

        //event
        const filter = s.Bracket.filters.BracketOrderProcessed
        const events = await s.Bracket.queryFilter(filter, -1)
        const event = events[0].args
        expect(event.orderId).to.eq(orderId, "Order Id correct")

        //no tokens left on contract
        expect(await s.WETH.balanceOf(await s.Bracket.getAddress())).to.eq(0n, "0 s.WETH left on contract")
        expect(await s.USDC.balanceOf(await s.Bracket.getAddress())).to.eq(0n, "0 s.USDC left on contract")

        //check upkeep
        const check = await s.Master.checkUpkeep("0x")
        expect(check.upkeepNeeded).to.eq(false, "no upkeep is needed anymore")
    })


})

describe("Oracle Less", () => {
    const expectedAmountOut = 5599771561n
    const minAmountOut = expectedAmountOut - 50n
    let orderId: bigint


    before(async () => {
        await s.OracleLess.whitelistTokens([await s.WETH.getAddress(), await s.USDC.getAddress()], [true, true])
        await stealMoney(s.wethWhale, await s.Oscar.getAddress(), await s.WETH.getAddress(), s.wethAmount)
    })

    it("Create Order", async () => {
        await s.WETH.connect(s.Oscar).approve(await s.OracleLess.getAddress(), s.wethAmount)
        await s.OracleLess.connect(s.Oscar).createOrder(
            await s.WETH.getAddress(),
            await s.USDC.getAddress(),
            s.wethAmount,
            minAmountOut,
            await s.Oscar.getAddress(),
            0,  // Set fee to 0 for this test to avoid fee-adjustment complexity
            "0x",
            { value: s.fee }
        )
        const filter = s.OracleLess.filters.OracleLessOrderCreated
        const events = await s.OracleLess.queryFilter(filter, -1)
        const event = events[0].args
        expect(Number(event[0])).to.not.eq(0, "New order")
        orderId = (event[0])
    })
    it("Modify Amount In", async () => {
        const order = await s.OracleLess.orders(orderId)
        const delta = 10000000n
        const initialWeth = await s.WETH.balanceOf(await s.Oscar.getAddress())

        //imposter
        expect(s.OracleLess.connect(s.Bob).modifyOrder(
            orderId,
            order.tokenOut,
            delta,
            order.minAmountOut,
            order.recipient,
            false,
            "0x",
            { value: s.fee }
        )).to.be.revertedWith("only order owner")

        //decrease amount
        await s.OracleLess.connect(s.Oscar).modifyOrder(
            orderId,
            order.tokenOut,
            delta,
            order.minAmountOut,
            order.recipient,
            false,
            "0x",
            { value: s.fee }
        )
        //check for refund
        expect(await s.WETH.balanceOf(await s.Oscar.getAddress())).to.eq(initialWeth + delta, "WETH received")

        //increase back to original
        await s.WETH.connect(s.Oscar).approve(await s.OracleLess.getAddress(), delta)
        await s.OracleLess.connect(s.Oscar).modifyOrder(
            orderId,
            order.tokenOut,
            delta,
            order.minAmountOut,
            order.recipient,
            true,
            "0x",
            { value: s.fee }
        )
        expect(await s.WETH.balanceOf(await s.Oscar.getAddress())).to.eq(initialWeth, "WETH spent")

    })

    it("Modify Amount Received", async () => {

        const order = await s.OracleLess.orders(orderId)
        //increase min amount down
        await s.OracleLess.connect(s.Oscar).modifyOrder(
            orderId,
            order.tokenOut,
            0n,
            expectedAmountOut + 50n,
            order.recipient,
            false,
            "0x",
            { value: s.fee }
        )

        const txData = await generateUniTxData(
            s.WETH,
            await s.USDC.getAddress(),
            s.wethAmount,
            s.router02,
            s.UniPool,
            await s.OracleLess.getAddress(),
            0n//pendingOrders[0].minAmountOut//5600885752
        )
        expect(s.OracleLess.fillOrder(orderId, s.router02, txData)).to.be.revertedWith("Too Little Received")

        //reset
        await s.WETH.connect
        await s.OracleLess.connect(s.Oscar).modifyOrder(
            orderId,
            order.tokenOut,
            0n,
            minAmountOut,
            order.recipient,
            false,
            "0x",
            { value: s.fee }
        )
    })


    it("Fill Order", async () => {

        const pendingOrders = await s.OracleLess.getPendingOrders()
        // Since fee is set to 0 for this test, no fee adjustment needed
        const txData = await generateUniTxData(
            s.WETH,
            await s.USDC.getAddress(),
            s.wethAmount,
            s.router02,
            s.UniPool,
            await s.OracleLess.getAddress(),
            pendingOrders[0].minAmountOut
        )

        await s.OracleLess.fillOrder(orderId, s.router02, txData)
    })

})

describe("Verify Fee Collection", () => {

    it("Sweep ERC20 fees", async () => {
        const usdcBalance = await s.USDC.balanceOf(await s.Master.getAddress())
        expect(usdcBalance).to.be.gt(0, "USDC fees accumulated")

        await s.Master.connect(s.Frank).sweep(await s.USDC.getAddress(), await s.Frank.getAddress())

        expect(await s.USDC.balanceOf(s.Frank)).to.eq(usdcBalance, "Frank received fees")
    })

    it("Sweep native ether fees", async () => {
        const balance = await ethers.provider.getBalance(await s.Master.getAddress())
        expect(balance).to.be.gt(0, "ETHER fees accumulated")


        const initialBalance = await ethers.provider.getBalance(await s.Frank.getAddress())

        await s.Master.connect(s.Frank).sweepEther(await s.Frank.getAddress())

        const finalBalance = await ethers.provider.getBalance(await s.Frank.getAddress())

        expect(Number(ethers.formatEther(finalBalance))).to.be.closeTo(Number(ethers.formatEther(initialBalance + balance)), 0.0001, "Fees swept")

    })
})



