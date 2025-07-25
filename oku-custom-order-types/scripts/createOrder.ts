import hre, { network } from "hardhat";
import { currentBlock, resetCurrentArb, resetCurrentBase, resetCurrentOP } from "../util/block";
import { AutomationMaster, AutomationMaster__factory, Bracket, Bracket__factory, IERC20, IERC20__factory, IPermit2__factory, oracle, OracleLess, OracleLess__factory, PermitTest, PermitTest__factory, StopLimit, StopLimit__factory, UniswapV3Pool__factory } from "../typechain-types";
import { AbiCoder, formatUnits, getBytes, Signer } from "ethers";
import { impersonateAccount } from "../util/impersonator";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { decodeUpkeepData, encodePermit2Payload, encodePermitSingle, generateUniTx, generateUniTxData, MasterUpkeepData, MasterUpkeepTuple, Permit2Payload, permitSingle } from "../util/msc";
import { a, b, o } from "../util/addresser";
import { s, SwapParams } from "../test/triggerV2/scope";
import { ChainAddresses, OptimisimAddresses } from "../util/deploymentAddresses";
import { DeployContract } from "../util/deploy";
import { bigint } from "hardhat/internal/core/params/argumentTypes";
const { ethers } = require("hardhat");
const abi = new AbiCoder()



//SET THIS FOR TESTING
const testingNetwork = "op"
const userAddr = "0x085909388fc0cE9E5761ac8608aF8f2F52cb8B89"
const wethAmount = ethers.parseEther("0.0005")
const kncAmount = ethers.parseEther("0.5")
const usdcAmount = ethers.parseUnits("0.25", 6)
const stopLimitDelta = ethers.parseUnits("1", 8)
const strikeDelta = ethers.parseUnits("5", 8)
const stopDelta = ethers.parseUnits("5", 8)
const oracleLessBips = 10n//percentage bips

let master: AutomationMaster
let stopLimit: StopLimit
let bracket: Bracket
let oracleLess: OracleLess
let mainnet = true
let permitAddr: string
let chainId = 42161
let addrs: ChainAddresses

//tokens
let WETH: IERC20
let USDC: IERC20
let KNC: IERC20
let LINK: IERC20

const main = async () => {
    console.log("STARTING")
    let networkName = hre.network.name
    const network = await ethers.provider.getNetwork();
    chainId = Number(network.chainId)

    let [signer] = await ethers.getSigners()


    if (networkName == "hardhat" || networkName == "localhost") {
        networkName = testingNetwork
        mainnet = false
        console.log("Testing on network : ", networkName)
    } else {
        console.log("RUNNING ON LIVE NETWORK: ", networkName)
    }

    if (networkName == "op") {
        if (!mainnet) {
            console.log("RESETTING TO OP")
            await resetCurrentOP()
            console.log("Testing on OP @", (await currentBlock())?.number)
            chainId = 10
            signer = await ethers.getSigner(userAddr)

            //testing does not scale tx cost correctly 
            await setBalance(await signer.getAddress(), ethers.parseEther("1"))
            await impersonateAccount(await signer.getAddress())
        } else {
            chainId = Number(network.chainId)
        }

        addrs = new OptimisimAddresses()
    }

    master = AutomationMaster__factory.connect(addrs.coreDeployments.master, signer)
    stopLimit = StopLimit__factory.connect(addrs.coreDeployments.stopLimit, signer)
    bracket = Bracket__factory.connect(addrs.coreDeployments.bracket, signer)
    oracleLess = OracleLess__factory.connect(addrs.coreDeployments.oracleLess, signer)
    WETH = IERC20__factory.connect((addrs.allTokens.find(token => token.symbol === "WETH"))!.token, signer)
    USDC = IERC20__factory.connect((addrs.allTokens.find(token => token.symbol === "USDC"))!.token, signer)
    KNC = IERC20__factory.connect((addrs.allTokens.find(token => token.symbol === "KNC"))!.token, signer)
    LINK = IERC20__factory.connect((addrs.allTokens.find(token => token.symbol == "LINK"))!.token, signer)

    await createOracleLessOrder(WETH, KNC, signer, oracleLessBips, mainnet)
    await createOracleLessOrder(KNC, WETH, signer, oracleLessBips, mainnet)
    await createOracleLessOrder(USDC, KNC, signer, oracleLessBips, mainnet)
    await createOracleLessOrder(KNC, USDC, signer, oracleLessBips, mainnet)
    await createOracleLessOrder(USDC, WETH, signer, oracleLessBips, mainnet)
    await createOracleLessOrder(WETH, USDC, signer, oracleLessBips, mainnet)
    await createOracleLessOrder(USDC, LINK, signer, oracleLessBips, mainnet)

}


const createStopLimitOrder = async (signer: Signer, delta: bigint, swapOnFill: boolean, permit: boolean) => {
    let encodedPermit = "0x"
    if (permit) {
        encodedPermit = await encodePermitSingle(
            signer,
            chainId,
            await WETH.getAddress(),
            wethAmount,
            await stopLimit.getAddress(),
            o.permit2
        )
    } else {
        await WETH.connect(signer).approve(await stopLimit.getAddress(), wethAmount)
    }
    const currentPrice = await master.getExchangeRate(await WETH.getAddress(), await USDC.getAddress())
    const tx = await stopLimit.connect(signer).createOrder(
        currentPrice - delta,
        currentPrice + delta,
        currentPrice - (delta * 2n),
        wethAmount,
        await WETH.getAddress(),
        await USDC.getAddress(),
        await signer.getAddress(),
        5,
        500,
        500,
        500,
        swapOnFill,
        permit,
        encodedPermit
    )
    await tx.wait()

    const filter = stopLimit.filters.OrderCreated
    const events = await stopLimit.queryFilter(filter, -1)
    const event = events[0].args
    console.log(`Stop Limit Order Created With Permit:${permit} ${event[0].toString()}`)

}

const createBracketOrder = async (signer: Signer, delta: bigint, permit: boolean) => {
    let encodedPermit = "0x"
    if (permit) {
        encodedPermit = await encodePermitSingle(
            signer,
            chainId,
            await WETH.getAddress(),
            wethAmount,
            await bracket.getAddress(),
            o.permit2
        )
    } else {
        await WETH.connect(signer).approve(await bracket.getAddress(), wethAmount)
    }
    const currentPrice = await master.getExchangeRate(await WETH.getAddress(), await USDC.getAddress())
    const tx = await bracket.connect(signer).createOrder(
        "0x",//swap payload
        currentPrice + delta,
        currentPrice - (delta * 2n),
        wethAmount,
        await WETH.getAddress(),
        await USDC.getAddress(),
        await signer.getAddress(),
        5,
        500,
        500,
        permit,
        encodedPermit
    )
    await tx.wait()

    const filter = bracket.filters.OrderCreated
    const events = await bracket.queryFilter(filter, -1)
    const event = events[0].args
    console.log(`Bracket Order Created With Permit:${permit} ${event[0].toString()}`)

}

const createOracleLessOrder = async (tokenIn: IERC20, tokenOut: IERC20, signer: Signer, bips: bigint, permit: boolean) => {

    let amountIn = ethers.parseEther("0.01")
    if (tokenIn == WETH) {
        amountIn = wethAmount
    }
    if (tokenIn == USDC) {
        amountIn = usdcAmount
    }
    if (tokenIn == KNC) {
        amountIn = kncAmount
    }

    let encodedPermit = "0x"
    if (permit) {
        encodedPermit = await encodePermitSingle(
            signer,
            chainId,
            await tokenIn.getAddress(),
            amountIn,
            await oracleLess.getAddress(),
            o.permit2
        )
    } else {
        await tokenIn.connect(signer).approve(await oracleLess.getAddress(), amountIn)
    }

    //deduce minAmountOut
    //this implies the direction, as receiving more than the current value of tokenOut is an objectively good trade
    const currentMinAmount = await master.getMinAmountReceived(amountIn, await tokenIn.getAddress(), await tokenOut.getAddress(), 0)
    const targetMinAmount = currentMinAmount + ((currentMinAmount * bips) / 10000n)

    //console.log("Current MO: ", currentMinAmount)
    //console.log("Target MAO: ", targetMinAmount)


    const fee = await master.orderFee()
    const tx = await oracleLess.connect(signer).createOrder(
        await tokenIn.getAddress(),
        await tokenOut.getAddress(),
        amountIn,
        targetMinAmount,
        await signer.getAddress(),
        25,
        permit,
        encodedPermit,
        {
            value: fee
        }
    )
    await tx.wait()

    const filter = oracleLess.filters.OrderCreated
    const events = await oracleLess.queryFilter(filter, -1)
    const event = events[0].args
    console.log(`OracleLess Order Created With Permit:${permit} ${event[0].toString()}`)
}






main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
