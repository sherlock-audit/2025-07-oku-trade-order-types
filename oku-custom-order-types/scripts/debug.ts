import hre from "hardhat";
import { currentBlock, resetCurrentOP, resetCurrentOPblock } from "../util/block";
import { AutomationMaster, Bracket, Bracket__factory, IBracket__factory, IERC20, IERC20__factory, IUniswapV3Factory, IUniswapV3Factory__factory, OracleLess, StopLimit } from "../typechain-types";
import { AbiCoder, formatUnits, Signer } from "ethers";
import { impersonateAccount } from "../util/impersonator";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { ChainAddresses, OptimisimAddresses } from "../util/deploymentAddresses";
const { ethers } = require("hardhat");
const abi = new AbiCoder()

//SET THIS FOR TESTING
const testingNetwork = "op"
const userAddr = "0x085909388fc0cE9E5761ac8608aF8f2F52cb8B89"


let master: AutomationMaster
let stopLimit: StopLimit
let bracket: Bracket

let mainnet = true
let chainId = 42161
let addrs: ChainAddresses
let factory: IUniswapV3Factory

//tokens
let WETH: IERC20
let USDC: IERC20

///discrepency block: 135046696
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
    factory = IUniswapV3Factory__factory.connect("0x1F98431c8aD98523631AE4a59f267346ea31F984", signer)

    //await fillOracleLessOrder(signer)
    //await check(signer)
    await debugOrder(signer)
    //await checkBalance(signer)
    //await findBlockOfChange(signer)
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

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
