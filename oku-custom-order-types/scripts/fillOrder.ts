import hre, { network } from "hardhat";
import { currentBlock, resetCurrentArb, resetCurrentBase, resetCurrentOP, resetCurrentOPblock } from "../util/block";
import { AutomationMaster, AutomationMaster__factory, Bracket, Bracket__factory, ERC20__factory, IBracket__factory, IERC20, IERC20__factory, IOracleRelay, IOracleRelay__factory, IPermit2__factory, IUniswapV3Factory, IUniswapV3Factory__factory, oracle, OracleLess, OracleLess__factory, PermitTest, PermitTest__factory, StopLimit, StopLimit__factory, UniswapV3Pool__factory } from "../typechain-types";
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

    // master = AutomationMaster__factory.connect(addrs.coreDeployments.master, signer)
    // stopLimit = StopLimit__factory.connect(addrs.coreDeployments.stopLimit, signer)
    // bracket = Bracket__factory.connect(addrs.coreDeployments.bracket, signer)
    // oracleLess = OracleLess__factory.connect(addrs.coreDeployments.oracleLess, signer)
    // WETH = IERC20__factory.connect((addrs.allTokens.find(token => token.symbol === "WETH"))!.token, signer)
    // USDC = IERC20__factory.connect((addrs.allTokens.find(token => token.symbol === "USDC"))!.token, signer)

    factory = IUniswapV3Factory__factory.connect("0x1F98431c8aD98523631AE4a59f267346ea31F984", signer)

    //await fillOracleLessOrder(signer)
    //await check(signer)
    await debugOrder(signer)
    //await checkBalance(signer)
    //await findBlockOfChange(signer)
}



/**
 * Defines the structure of the decoded data in TypeScript for type safety and readability.
 * Note on types: uint256/uint96 are decoded as 'bigint', smaller integers as 'number',
 * addresses/bytes as 'string'.
 */
interface DecodedMasterUpkeepData {
    orderType: number;
    target: string;
    tokenIn: string;
    tokenOut: string;
    orderId: bigint;
    pendingOrderIdx: bigint;
    slippage: number;
    amountIn: bigint;
    exchangeRate: bigint;
    txData: string;
}

/**
 * PHASE 3: THE CORE LOGIC
 * Checks for a balance discrepancy at a single, specific block.
 * @returns {Promise<boolean>} - True if balances match (OK), false if there is a discrepancy.
 */
async function checkBalanceDiscrepancy(
    blockNumber: number,
    bracket: Bracket, // Your IBracket contract instance
    usdcContract: any, // Your IERC20 contract instance
    usdcAddress: string
): Promise<boolean> {
    await resetCurrentOPblock(blockNumber);

    const pendingOrders = await bracket.getPendingOrders();
    let expectedBalance = 0n;
    for (const order of pendingOrders) {
        if (order.tokenIn.toLowerCase() === usdcAddress.toLowerCase()) {
            expectedBalance += order.amountIn;
        }
    }

    const actualBalance = await usdcContract.balanceOf(await bracket.getAddress());
    const difference = actualBalance - expectedBalance;

    console.log(`--- Checking Block: ${blockNumber} ---`);
    console.log(`  Expected Balance: ${ethers.formatUnits(expectedBalance, 6)} USDC`);
    console.log(`  Actual Balance:   ${ethers.formatUnits(actualBalance, 6)} USDC`);

    if (difference < 0n) { // A negative difference means a deficit
        console.log(`  💥 DISCREPANCY: ${ethers.formatUnits(difference, 6)} USDC`);
        return false;
    }

    console.log("  ✅ OK");
    return true;
}


/**
 * PHASE 2: BINARY SEARCH
 * Pinpoints the exact block of the first discrepancy within a given range.
 */
async function findBlockOfChange(
    lowBlock: number, // Last known good block
    highBlock: number, // First known bad block
    bracket: any,
    usdcContract: any,
    usdcAddress: string
) {
    let firstBadBlock = highBlock;

    while (lowBlock <= highBlock) {
        const midBlock = Math.floor((lowBlock + highBlock) / 2);
        const isOk = await checkBalanceDiscrepancy(midBlock, bracket, usdcContract, usdcAddress);

        if (isOk) {
            // Balance is still good, so the change must be in a later block.
            lowBlock = midBlock + 1;
        } else {
            // Discrepancy found. This is a potential candidate. Look earlier to be sure.
            firstBadBlock = midBlock;
            highBlock = midBlock - 1;
        }
    }
    return firstBadBlock;
}


/**
 * PHASE 1: BROAD SEARCH
 * Main entry point to find the block range where a discrepancy occurred.
 */
const debugOrder = async (signer: Signer) => {
    const internalTxBlocks = [
        133702439, 133707163, 133922359, 133927172, 133928449, 133928545,
        133928602, 133928612, 133928648, 133930299, 133932785, 133938682,
        133938766, 133938845, 133973383, 133977384, 133977420, 133978421,
        134017224, 134059095, 134059187, 134343016, 134344541, 134369496,
        134369866, 134431967, 135787240, 135822254, 135824240, 135826715,
        135826747, 136173492, 136173526, 136174000, 136177042, 136177180,
        136177242, 136177546, 136177617, 136177653, 136177761, 136177819,
        136177916, 136177988, 136178045, 136178333, 136213643, 136213685,
        136214001, 136214220, 136215898, 136216978, 136217001, 136217018,
        136217040, 136219427, 136219484, 136219532, 136219553, 136220306,
        136220503, 136223005, 136223131, 136223198, 136223263, 136223385,
        136223454, 136223505, 136223523, 136223583, 136223687, 136223729,
        136223798, 136223833, 136223857, 136224041, 136224335, 136224514,
        136224620, 136224840, 136224979, 136225095, 136225212, 136225332,
        136382683, 136387140, 136389277, 136390377, 136391037, 136391090,
        136391111, 136391139, 136392183, 136393109, 136393307, 136393360,
        136393397, 136393654, 136393743, 136394116
    ];
    const relevantBlocks = internalTxBlocks.filter(block => block >= 134369496);

    const bracket = Bracket__factory.connect("0x1D718B430aCF5E385024162Da9Cd27bed7c02EC1", signer);
    const USDC_CONTRACT = IERC20__factory.connect("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", signer);
    const USDC_ADDRESS = await USDC_CONTRACT.getAddress();

    let lastGoodBlock = relevantBlocks[0];

    for (const block of relevantBlocks) {
        const isOk = await checkBalanceDiscrepancy(block, bracket, USDC_CONTRACT, USDC_ADDRESS);

        if (!isOk) {
            console.log("\n============================================================");
            console.log(`Discrepancy detected in range: (${lastGoodBlock}, ${block}]`);
            console.log("Starting binary search to pinpoint the exact block...");
            console.log("============================================================\n");

            const exactBlock = await findBlockOfChange(lastGoodBlock, block, bracket, USDC_CONTRACT, USDC_ADDRESS);

            console.log("\n============================================================");
            console.log(`✅ FINAL RESULT: The first discrepancy occurred in block ${exactBlock}.`);
            console.log("Investigate transactions involving the contract at this block.");
            console.log("============================================================\n");
            return; // Exit after finding the first issue
        }

        lastGoodBlock = block; // Update the last known good block
    }

    console.log("Scan complete. No discrepancies found in the provided block list.");
};





const checkBalance = async (signer: Signer) => {
    let start = 135776689//135787239


    const bracket = IBracket__factory.connect("0x1D718B430aCF5E385024162Da9Cd27bed7c02EC1", signer);
    const USDC = IERC20__factory.connect("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", signer);

    await resetCurrentOPblock(start);
    let balance = await USDC.balanceOf(await bracket.getAddress());

    console.log("Balance: ", balance, formatUnits(balance, 6))


    console.log("Start Balance: ", balance, ethers.formatUnits(balance, 6))

    while (balance < 25000000n) {

        await resetCurrentOPblock(start)

        balance = await USDC.balanceOf(await bracket.getAddress())

        console.log("Checked block: ", start, ethers.formatUnits(balance, 6))

        await sleep(200)

        start -= 200




    }

}
type olOrder = {
    orderId: bigint,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    minAmountOut: bigint,
    recipient: string,
    feeBips: number
}
const fillOracleLessOrder = async (signer: Signer) => {

    //get orders
    const orders = await oracleLess.getPendingOrders()
    console.log("FILLING ON ORACLELESS: ", await oracleLess.getAddress())

    const whitelisted = await master.safeTargets(s.router02)

    if (!whitelisted) {
        await master.whitelistTargets([s.router02])
        console.log("Whitelisted UNI ROUTER")
    }

    for (let i = 0; i < orders.length; i++) {
        const order = orders[i]

        const currentMinAmount = await master.getMinAmountReceived(order.amountIn, order.tokenIn, order.tokenOut, 0)
        console.log("")
        console.log("Current: ", currentMinAmount)
        console.log("Targett: ", orders[i].minAmountOut)

        if (orders[i].minAmountOut <= currentMinAmount) {
            console.log("FILLING ORDER: ", order.orderId)
            const tokenIn = ERC20__factory.connect(order.tokenIn, signer)
            const tokenOut = ERC20__factory.connect(order.tokenOut, signer)
            let pool = UniswapV3Pool__factory.connect(await factory.getPool(order.tokenIn, order.tokenOut, 500), signer)
            console.log("Got pool: ", await pool.getAddress())
            //verify pool is solvant, if not, pick a different fee tier
            //get oracle for tokenIn, and use this to get USD value of whichever token this is in the pool
            const oracleIn: IOracleRelay = IOracleRelay__factory.connect(addrs.allTokens.find(token => token.token.toUpperCase() == order.tokenIn.toUpperCase())!.relay, signer)
            const currentPrice = await oracleIn.currentValue()
            const balanceTokenIn = await tokenIn.balanceOf(await pool.getAddress())
            const valueTokenIn = (balanceTokenIn * currentPrice) / 100000000n
            const adjustedValue = ethers.formatUnits(valueTokenIn, await tokenIn.decimals())
            if (adjustedValue < 1000) {
                console.log("Insufficient liquidity in pool, moving to 3k fee tier")
                pool = UniswapV3Pool__factory.connect(await factory.getPool(order.tokenIn, order.tokenOut, 3000), signer)
                console.log("Got 3k pool: ", await pool.getAddress())
            }
            console.log("TOKEN IN HAD: ", await tokenIn.balanceOf(await oracleLess.getAddress()))
            const txData = await generateUniTxData(
                tokenIn,
                order.tokenOut,
                order.amountIn,
                s.router02,
                pool,
                await oracleLess.getAddress(),
                order.minAmountOut
            )
            await oracleLess.fillOrder(order.orderId, s.router02, txData)
            console.log(`Filled ${order.orderId} ${await tokenIn.symbol()} => ${await tokenOut.symbol()}`)
            //need to end loop, as the array idxs will be messed up if trying to fill multiple orders in one loop
            break
        }
    }
}
async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


/**
const findBlockOfChange = async (signer: Signer) => {
    const bracket = IBracket__factory.connect("0x1D718B430aCF5E385024162Da9Cd27bed7c02EC1", signer);
    const USDC = IERC20__factory.connect("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", signer);

    let lowBlock = 134431967;  // The last known GOOD block
    let highBlock = 135787240; // The first known BAD block
    let firstBadBlock = highBlock; // Assume the worst case initially

    console.log(`Searching for balance change between blocks ${lowBlock} and ${highBlock}...`);

    while (lowBlock <= highBlock) {
        const midBlock = Math.floor((lowBlock + highBlock) / 2);
        if (midBlock === lowBlock) break; // Avoid infinite loops

        await resetCurrentOPblock(midBlock);
        const balance = await USDC.balanceOf(await bracket.getAddress());

        console.log(`Checking block ${midBlock}... Balance: ${ethers.formatUnits(balance, 6)}`);

        if (balance > 25000000n) {
            // Balance is still good, so the change must have happened AFTER this block.
            lowBlock = midBlock;
        } else {
            // Balance is bad, so this is a potential candidate. Look earlier.
            firstBadBlock = midBlock;
            highBlock = midBlock;
        }
    }

    console.log(`\n---`);
    console.log(` pinpointed the first block with low balance: ${firstBadBlock}`);
    console.log(`---`);

    return firstBadBlock;
};


const debugOrder = async (signer: Signer) => {
    const internalTxBlocks = [
        133702439, 133707163, 133922359, 133927172, 133928449, 133928545,
        133928602, 133928612, 133928648, 133930299, 133932785, 133938682,
        133938766, 133938845, 133973383, 133977384, 133977420, 133978421,
        134017224, 134059095, 134059187, 134343016, 134344541, 134369496,
        134369866, 134431967, 135787240, 135822254, 135824240, 135826715,
        135826747, 136173492, 136173526, 136174000, 136177042, 136177180,
        136177242, 136177546, 136177617, 136177653, 136177761, 136177819,
        136177916, 136177988, 136178045, 136178333, 136213643, 136213685,
        136214001, 136214220, 136215898, 136216978, 136217001, 136217018,
        136217040, 136219427, 136219484, 136219532, 136219553, 136220306,
        136220503, 136223005, 136223131, 136223198, 136223263, 136223385,
        136223454, 136223505, 136223523, 136223583, 136223687, 136223729,
        136223798, 136223833, 136223857, 136224041, 136224335, 136224514,
        136224620, 136224840, 136224979, 136225095, 136225212, 136225332,
        136382683, 136387140, 136389277, 136390377, 136391037, 136391090,
        136391111, 136391139, 136392183, 136393109, 136393307, 136393360,
        136393397, 136393654, 136393743, 136394116
    ];

    // NEW: Filter the array to only include blocks at or after the specified block number.
    const relevantBlocks = internalTxBlocks.filter(block => block >= 134369496);

    const bracket = IBracket__factory.connect("0x1D718B430aCF5E385024162Da9Cd27bed7c02EC1", signer);
    const USDC = IERC20__factory.connect("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", signer);

    for (const block of relevantBlocks) {
        await resetCurrentOPblock(block);

        const balance = await USDC.balanceOf(await bracket.getAddress());
        console.log(`Checked block: ${block}, Balance: ${ethers.formatUnits(balance, 6)} USDC`);

        if (balance <= 25000000n) {
            console.log(`--> Balance is below threshold. Stopping check at block ${block}.`);
            break;
        }

        await sleep(1000);
    }

    console.log("Finished checking all relevant blocks.");
}

 */



main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
