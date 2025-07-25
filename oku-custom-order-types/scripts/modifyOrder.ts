import hre, { network } from "hardhat";
import { currentBlock, resetCurrentArb, resetCurrentBase, resetCurrentOP } from "../util/block";
import { AutomationMaster, AutomationMaster__factory, Bracket, Bracket__factory, ERC20__factory, IERC20, IERC20__factory, IPermit2__factory, IUniswapV3Factory, IUniswapV3Factory__factory, oracle, OracleLess, OracleLess__factory, PermitTest, PermitTest__factory, StopLimit, StopLimit__factory, UniswapV3Pool__factory } from "../typechain-types";
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
const stopLimitDelta = ethers.parseUnits("1", 8)
const strikeDelta = ethers.parseUnits("5", 8)
const stopDelta = ethers.parseUnits("5", 8)
const oracleLessBips = 300n//percentage bips

let master: AutomationMaster
let stopLimit: StopLimit
let bracket: Bracket
let oracleLess: OracleLess
let mainnet = true
let permitAddr: string
let chainId = 42161
let addrs: ChainAddresses
let factory: IUniswapV3Factory

//tokens
let WETH: IERC20
let USDC: IERC20

const main = async () => {
    console.log("STARTING")
    let networkName = hre.network.name
    console.log("Running on: ", networkName)
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

    factory = IUniswapV3Factory__factory.connect("0x1F98431c8aD98523631AE4a59f267346ea31F984", signer)

    //await modifyTokenOut(signer)
    if (mainnet) {
        await modifyAmountIn(signer, true)
    } else {
        await modifyAmountIn(signer, false)
    }


}

const modifyAmountIn = async (signer: Signer, permit: boolean) => {

    //get order
    const orderIdx = 1
    const orders = await oracleLess.getPendingOrders()
    const order = orders[orderIdx]
    console.log(order)
    const tokenIn = ERC20__factory.connect(order.tokenIn, signer)

    //increase position with permit2
    console.log("TOKEN IN: ", await tokenIn.symbol())
    console.log("Amount Had: ", ethers.formatUnits(await tokenIn.balanceOf(await signer.getAddress()), await tokenIn.decimals()))
    console.log("Amount Had: ", await tokenIn.balanceOf(await signer.getAddress()))
    const amountInDelta = ethers.parseEther("0.0001")


    //handle permit
    let encodedPermit = "0x"
    if (permit) {
        encodedPermit = await encodePermitSingle(
            signer,
            chainId,
            await tokenIn.getAddress(),
            amountInDelta,
            await oracleLess.getAddress(),
            o.permit2
        )
    } else {
        await tokenIn.connect(signer).approve(await oracleLess.getAddress(), amountInDelta)
    }

    const fee = await oracleLess.orderFee()
    const tx = await oracleLess.connect(signer).modifyOrder(
        order.orderId,
        order.tokenOut,
        amountInDelta,
        order.minAmountOut,
        order.recipient,
        true,
        orderIdx,
        permit,
        encodedPermit,
        {value: fee}
    )
    await tx.wait()

    const filter = oracleLess.filters.OrderModified
    const events = await oracleLess.queryFilter(filter, -1)
    const event = events[0].args
    console.log(`OracleLess Order OrderModified With Permit:${permit} ${event[0].toString()}`)
}

const modifyTokenOut = async (signer: Signer) => {

    //get orders
    const orders = await oracleLess.getPendingOrders()
    //console.log("Orders: ", orders)

    const order = orders[0]
    console.log(order)


    //switch tokenOut to KNC
    const KNC = IERC20__factory.connect((addrs.allTokens.find(token => token.symbol === "KNC"))!.token, signer)
    const fee = await oracleLess.orderFee()

    await oracleLess.connect(signer).modifyOrder(
        order.orderId,
        await USDC.getAddress(),
        0n,
        order.minAmountOut,
        order.recipient,
        false,
        0n,
        false,
        "0x",
        { value: fee }
    )







}







main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
