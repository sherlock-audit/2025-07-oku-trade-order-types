import hre from "hardhat";
import { currentBlock, resetCurrentOP, resetCurrentOPblock } from "../util/block";
import { Bracket, StopLimit, IERC20, IERC20__factory, IBracket__factory, StopLimit__factory, Bracket__factory, ERC20__factory } from "../typechain-types";
import { formatUnits, Signer } from "ethers";
import { impersonateAccount } from "../util/impersonator";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
const { ethers } = require("hardhat");


const AUDIT_CONFIG = {
    contracts: [
        { name: "Bracket", address: "0x8e9a03e2533f8B4641a271429496F582B89c8fD7", factory: Bracket__factory },
        { name: "StopLimit", address: "0xfdcFdd8267F7054facF9eA2aAD538d74da4B65c8", factory: StopLimit__factory }
    ],
    genesisBlock: 137131241,
    scanInterval: 20000,
    testingNetwork: "op"
};

/**
 * Caches token metadata (symbol, decimals) to reduce RPC calls.
 */
const tokenInfoCache = new Map<string, { symbol: string, decimals: number }>();

async function getTokenInfo(address: string, signer: Signer) {
    if (tokenInfoCache.has(address)) {
        return tokenInfoCache.get(address)!;
    }
    try {
        const contract = ERC20__factory.connect(address, signer);
        const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
        const info = { symbol, decimals: Number(decimals) };
        tokenInfoCache.set(address, info);
        return info;
    } catch (e) {
        console.warn(`Warning: Could not fetch metadata for token ${address}. Using address as symbol.`);
        return { symbol: address, decimals: 18 }; 
    }
}

/**
 * CORE LOGIC: Checks for solvency at a single block by comparing expected vs. actual balances for ALL tokens.
 * @returns {Promise<boolean>} - True if solvent, false if there is a discrepancy.
 */
async function checkSolvencyAtBlock(
    contract: Bracket | StopLimit,
    blockNumber: number,
    signer: Signer
): Promise<boolean> {
    await resetCurrentOPblock(blockNumber);

    const pendingOrders = await contract.getPendingOrders();
    const expectedBalances = new Map<string, bigint>();

    // 1. Calculate the total expected balance for each token from pending orders.
    for (const order of pendingOrders) {
        const tokenAddress = order.tokenIn.toLowerCase();
        const currentTotal = expectedBalances.get(tokenAddress) || 0n;
        expectedBalances.set(tokenAddress, currentTotal + order.amountIn);
    }

    console.log(`--- Checking Block: ${blockNumber} | Pending Orders: ${pendingOrders.length} ---`);

    if (pendingOrders.length === 0) {
        console.log("  ✅ No pending orders. Nothing to check.");
        return true;
    }

    let allOk = true;

    // 2. For each token with an expected balance, check against the actual balance.
    for (const [tokenAddress, expectedAmount] of expectedBalances.entries()) {
        const token = await getTokenInfo(tokenAddress, signer);
        const tokenContract = IERC20__factory.connect(tokenAddress, signer);
        const actualAmount = await tokenContract.balanceOf(await contract.getAddress());
        const difference = actualAmount - expectedAmount;

        console.log(`  Token: ${token.symbol}`);
        console.log(`    Expected: ${formatUnits(expectedAmount, token.decimals)}`);
        console.log(`    Actual:   ${formatUnits(actualAmount, token.decimals)}`);
        
        if (difference < 0n) {
            console.log(`    💥 DISCREPANCY: ${formatUnits(difference, token.decimals)}`);
            allOk = false;
        }
    }
    return allOk;
}


async function findExactDiscrepancyBlock(
    lowBlock: number,
    highBlock: number,
    contract: Bracket | StopLimit,
    signer: Signer
) {
    let firstBadBlock = highBlock;
    while (lowBlock <= highBlock) {
        const midBlock = Math.floor((lowBlock + highBlock) / 2);
        if (midBlock <= lowBlock) break; 

        const isOk = await checkSolvencyAtBlock(contract, midBlock, signer);
        if (isOk) {
            lowBlock = midBlock;
        } else {
            firstBadBlock = midBlock;
            highBlock = midBlock;
        }
    }
    return firstBadBlock;
}


async function runSolvencyAudit(signer: Signer) {
    for (const config of AUDIT_CONFIG.contracts) {
        console.log(`\n\n============================================================`);
        console.log(`Starting Solvency Audit for: ${config.name} (${config.address})`);
        console.log(`============================================================`);

        const contract = config.factory.connect(config.address, signer);
        const latestBlock = await ethers.provider.getBlockNumber();
        let lastGoodBlock = AUDIT_CONFIG.genesisBlock;
        let discrepancyFound = false;

        for (let block = AUDIT_CONFIG.genesisBlock; block <= latestBlock; block += AUDIT_CONFIG.scanInterval) {
            const isOk = await checkSolvencyAtBlock(contract, block, signer);
            if (!isOk) {
                console.log("\n============================================================");
                console.log(`Discrepancy detected in range: (${lastGoodBlock}, ${block}]`);
                console.log("Starting binary search to pinpoint the exact block...");
                console.log("============================================================\n");
                
                const exactBlock = await findExactDiscrepancyBlock(lastGoodBlock, block, contract, signer);
                
                console.log("\n============================================================");
                console.log(`💥💥💥 AUDIT FAILED: First discrepancy for ${config.name} occurred in block ${exactBlock}.`);
                console.log("============================================================\n");
                discrepancyFound = true;
                break; // Stop checking this contract and move to the next
            }
            lastGoodBlock = block;
        }

        if (!discrepancyFound) {
            console.log(`\n✅ AUDIT PASSED: ${config.name} appears solvent up to block ${latestBlock}.`);
        }
    }
}

// ===================================================================================
// SCRIPT EXECUTION
// ===================================================================================
const main = async () => {
    console.log("STARTING SOLVENCY AUDIT SCRIPT");
    let signer: Signer = (await ethers.getSigners())[0];
    const networkName = hre.network.name;

    if (networkName === "hardhat" || networkName === "localhost") {
        console.log(`Forking network: ${AUDIT_CONFIG.testingNetwork}`);
        if (AUDIT_CONFIG.testingNetwork === "op") {
            await resetCurrentOP();
            // Impersonate an account to have a valid signer on the forked network
            const userAddr = "0x085909388fc0cE9E5761ac8608aF8f2F52cb8B89";
            signer = await ethers.getSigner(userAddr);
            await setBalance(await signer.getAddress(), ethers.parseEther("100"));
            await impersonateAccount(await signer.getAddress());
        }
        console.log(`Testing on ${AUDIT_CONFIG.testingNetwork} @ block`, (await currentBlock())?.number);
    } else {
        console.log("RUNNING ON LIVE NETWORK:", networkName);
    }

    await runSolvencyAudit(signer);
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });