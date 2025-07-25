import hre from "hardhat";
import { DeployContract } from "../util/deploy";
import { Signer } from "ethers";
import { ChainConfig, chainConfigs, CoreDeployments, OraclePair } from "./chainConfig";
import { resetGeneric } from "../util/block";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { impersonateAccount } from "../util/impersonator";
import { ChainAddresses, getAddressesByChainId, getFeeByChainId, tokenInfo } from "../util/deploymentAddresses";
import { AutomationMaster, AutomationMaster__factory, Bracket, Bracket__factory, IAutomationMaster__factory, oracle, OracleLess, OracleLess__factory, OracleRelay__factory, StopLimit, StopLimit__factory } from "../typechain-types";
import { network } from "hardhat"
import { expect } from "chai";

const { ethers } = require("hardhat");
let mainnet = true
let chainId: number
const zaddr = "0x0000000000000000000000000000000000000000"
type verification = {
    address: string,
    constructorArguments: string[]
}
let verifications: verification[] = []

//set these
const testingNetworkChainId = 10
const userAddr = "0x085909388fc0cE9E5761ac8608aF8f2F52cb8B89"
const protocolOwner = "0x085909388fc0cE9E5761ac8608aF8f2F52cb8B89"//"0x00a0bB9dfD2db3a6E447147426aB2D1B5Ac356d5"
const maxPendingOrders = 150
const minOrderDollars = ethers.parseUnits("1", 8)


//new token info
const tokenAddr = "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58"//usdt
const tokenOracleAddr = "0xECef79E109e997bCA29c1c0897ec9d7b03647F5E"//cl




let config: ChainConfig

async function main() {
    console.log("STARTING")
    let networkName = hre.network.name
    let signer: Signer

    if (networkName == "hardhat" || networkName == "localhost") {
        //testing
        mainnet = false
        chainId = testingNetworkChainId
    } else {
        console.log("DEPLOYING TO LIVE NETWORK: ", networkName,)
        const network = await ethers.provider.getNetwork()
        chainId = Number(network.chainId)
        console.log("Chain: ", chainId)
    }

    //get config
    config = chainConfigs.find(config => config.chainId == chainId)!

    //setup testing
    if (!mainnet) {
        //reset generic
        try {
            console.log(`Resetting network to ${config.name} ${config.rpcUrl}`)
            await resetGeneric(config.rpcUrl)
        } catch (e) {
            console.log("Resseting RPC failed for ", config.name, e)
            process.exit(1)
        }
        signer = await ethers.getSigner(userAddr)
        await setBalance(userAddr, ethers.parseEther("1000"))
        await impersonateAccount(userAddr)
    } else {
        //live network
        //setup provider and signer
        const provider = new ethers.JsonRpcProvider(config.rpcUrl)
        signer = new ethers.Wallet(config.privateKey, provider)
    }

    //deploy oracle
    const oracle = await DeployContract(new OracleRelay__factory(signer), signer, ethers.getAddress(tokenAddr), ethers.getAddress(tokenOracleAddr))
    await oracle.deploymentTransaction()

    const oracleAddr = await oracle.getAddress()
    console.log("Oracle deployed to: ", oracleAddr)
    const verification = {
        address: await oracle.getAddress(),
        constructorArguments: [ethers.getAddress(tokenAddr), ethers.getAddress(tokenOracleAddr)]
    }
    verifications.push(verification)


    //register
    //todo pull from config
    const master = AutomationMaster__factory.connect("0x02b4dB6FE23386BCaC71D15aDA3814A45210Dd00", signer)


    let tx = await master.registerOracle([tokenAddr], [oracleAddr])
    await tx.wait()

    //verify
    if(mainnet){
        await verifyAll()
    }

    console.log("DONE")
}



async function verifyAll() {
    console.log(`Submitting ${verifications.length} verifications...`)
    console.log(verifications)

    const verificationPromises = verifications.map(async (verification) => {
        return await hre.run("verify:verify", {
            address: verification.address,
            constructorArguments: verification.constructorArguments,
        });
    });

    await Promise.all(verificationPromises);
    console.log("All verifications completed!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
