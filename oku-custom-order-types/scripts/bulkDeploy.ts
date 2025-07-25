import hre from "hardhat";
import { DeployContract } from "../util/deploy";
import { currentBlock, resetCurrentArb, resetCurrentBase, resetCurrentOP, resetGeneric } from "../util/block";
import { AutomationMaster, AutomationMaster__factory, Bracket, Bracket__factory, IAutomationMaster__factory, IERC20__factory, IOracleRelay, OracleLess, OracleLess__factory, OracleRelay__factory, StopLimit, StopLimit__factory, TokenEthRelay__factory, UniswapV3Pool__factory } from "../typechain-types";
import { Signer } from "ethers";
import { impersonateAccount } from "../util/impersonator";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { decodeUpkeepData, generateUniTx } from "../util/msc";
import { ChainConfig, chainConfigs } from "./chainConfig";
import { ChainAddresses, getAddressesByChainId, getFeeByChainId, tokenInfo } from "../util/deploymentAddresses"
import { a, o } from "../util/addresser";
import { sleep } from "sleep"
import {network} from "hardhat"
type OraclePair = {
  token: string,
  oracle: string
}

type CoreDeployments = {
  master: string,
  bracket: string,
  stopLimit: string,
  oracleLess: string
}

const chainsToDeploy = [
  10, // Optimism
  /**
  42161, // Arbitrum
  137, // Polygon (MATIC)
  8453, // Base
  56, // Binance Smart Chain (BSC)
  324, // ZkSync
  534353, // Scroll
  314, // Filecoin (FIL)
  1284, // Moonbeam (GLMR)
  1101, // Polygon zkEVM
  81457, // Blast
  30, // Rootstock (RBTC)
  169, // Manta Pacific (MANTA)
  288, // Boba
  59144, // Linea
  167000, // Taiko
  15000, // Sei
  100, // Gnosis (xDAI)
  1294, // Bob
  2025, // XLayer (OKB)
  1750, // Metall2 (MTL)
  1, // Mainnet
   */
];

const zaddr = "0x0000000000000000000000000000000000000000"

const { ethers } = require("hardhat");

//"https://github.com/adrastia-oracle/oku-automation-config/blob/main/worker-config.ts"

const maxPendingOrders = 50
const minOrderDollars = ethers.parseUnits("25", 8)


const userAddr = "0x085909388fc0cE9E5761ac8608aF8f2F52cb8B89"
const protocolOwner = "0x085909388fc0cE9E5761ac8608aF8f2F52cb8B89"

let mainnet = true
async function main() {
  console.log("STARTING")
  let networkName = hre.network.name
  console.log(networkName)
  if (networkName == "hardhat" || networkName == "localhost") {
    //testing
    mainnet = false
  } else {
    console.log("DEPLOYING TO LIVE NETWORKS")
  }

  for (const config of chainConfigs) {
    let signer: Signer

    if (chainsToDeploy.includes(config.chainId)) {
      //reset for testing
      if (!mainnet) {
        try {
          console.log(`Resetting network to ${config.name}`)
          await resetGeneric(config.rpcUrl!)
        } catch (e) {
          console.log("Resseting RPC failed for ", config.name)
          continue
        }
        signer = await ethers.getSigner(userAddr)
        await setBalance(userAddr, ethers.parseEther("1000"))
        await impersonateAccount(userAddr)
      } else {
        console.log("Deploying to: ", config.name)
        const provider = new ethers.JsonRpcProvider(config.rpcUrl)
        signer = new ethers.Wallet(config.privateKey, provider)
      }
      try {
        //mainnet = false
        const addresses: ChainAddresses = getAddressesByChainId(config.chainId)
        await deployAndSetup(signer, config, addresses)

      } catch (e) {
        console.log(e)
        continue
      }
    }

  }
  console.log("DONE")
}

const deployAndSetup = async (signer: Signer, config: ChainConfig, a: ChainAddresses) => {

  let oracles: OraclePair[] = []
  if (config.chainlink) {
    oracles = await bulkDeployOracles(signer, config, a)
  }


  //deploy and setup contracts
  const coreDeployments = await deployContracts(signer, config, a, oracles)
  console.log("")
  console.log("Core Deployments for: ", config.name)
  console.log(coreDeployments)
  const master = IAutomationMaster__factory.connect(coreDeployments.master, signer)
  const result = await master.checkUpkeep("0x")
  console.log("Upkeep: ", result.upkeepNeeded)
  console.log("")


}

const bulkDeployOracles = async (signer: Signer, config: ChainConfig, addresses: ChainAddresses) => {
  console.log("DEPLOYING ORACLES ON ", config.name)
  let oracles: OraclePair[] = []

  const tokens: tokenInfo[] = addresses.allTokens

  let deployed = false
  let relay = ""
  let args: string[] = []


  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    let oraclePair: OraclePair = {
      token: token.token,
      oracle: token.relay
    }

    //can't do anything if there is no token addr
    if (token.token == '') {
      console.log(`No token addr for ${token.symbol} on ${config.name}`)
      continue
    }

    //if we have a feed
    if (token.relay != '') {
      console.log(`Found relay for ${token.symbol} on ${config.name} @ ${token.relay}`)
      oracles.push(oraclePair)
      continue
    }


    //if there is no relay and we have a feed, deploy a relay
    if (token.relay == '' && token.feed != '') {
      console.log("Deploying oracle for ", token.symbol)
      const oracle = await DeployContract(new OracleRelay__factory(signer), signer, ethers.getAddress(token.token), ethers.getAddress(token.feed))
      await oracle!.deploymentTransaction()
      console.log(`${token.symbol} Oracle Deployed to ${config.name} @ ${await oracle!.getAddress()}`)
      console.log(`${token.symbol} PRICE: `, await oracle!.currentValue())
      oraclePair.oracle = await oracle.getAddress()
      oracles.push(oraclePair)
      deployed = true
      relay = await oracle.getAddress()
      args = [token.token, token.feed]

    }

  }
  //submit 1 for verification

  if (mainnet && deployed) {
    console.log("Submitting oracle for verificaiton on ", config.name)
    try {
      Promise.all([
        hre.run("verify:verify", {
          address: relay,
          constructorArguments: args,//[tokens[0].token, tokens[0].feed]
        }),
      ])
    }catch (e) {
      console.log("Error verifying oracle on ", config.name)
    }
  }


  return oracles
}

const deployContracts = async (signer: Signer, config: ChainConfig, addresses: ChainAddresses, oracles: OraclePair[]) => {

  //init to what we have
  let coreDeployments: CoreDeployments = {
    master: addresses.coreDeployments.master,
    bracket: addresses.coreDeployments.bracket,
    stopLimit: addresses.coreDeployments.stopLimit,
    oracleLess: addresses.coreDeployments.oracleLess
  }

  let newMaster = false

  if (coreDeployments.master == '') {
    //deploy
    const master: AutomationMaster = await DeployContract(new AutomationMaster__factory(signer), signer, protocolOwner)
    await master.deploymentTransaction()
    console.log(`Master deployed to ${config.name} @ ${await master.getAddress()}`)
    newMaster = true
    coreDeployments.master = await master.getAddress()

    //register oracles
    //split oracle pairs
    const tokenAddrs = oracles.map(pair => ethers.getAddress(pair.token));
    const oracleAddrs = oracles.map(pair => ethers.getAddress(pair.oracle));
    console.log("TOKENS: ", tokenAddrs)
    console.log("ORACLE: ", oracleAddrs)

    let tx = await master.registerOracle(tokenAddrs, oracleAddrs)
    await tx.wait()
    console.log("Registered Oracles on Master on ", config.name)

    tx = await master.setMinOrderSize(minOrderDollars)
    await tx.wait()
    console.log(`Set min order size to ${minOrderDollars} on ${config.name}`)
    tx = await master.setMaxPendingOrders(maxPendingOrders)
    await tx.wait()
    console.log(`Set max pending orders to ${maxPendingOrders} on ${config.name}`)


    if (mainnet) {
      const ogNetwork = network.name
      console.log("Submitting Master for verification...")
      await sleep(1)
      Promise.all([
        hre.run("verify:verify", {
          address: await master.getAddress(),
          constructorArguments: [protocolOwner],
        }),
      ])
    }

  }

  if (coreDeployments.bracket == '') {
    let permit2 = addresses.permit2
    if (permit2 == "") {
      permit2 = zaddr
    }
    //deploy
    const bracket: Bracket = await DeployContract(new Bracket__factory(signer), signer, coreDeployments.master, addresses.permit2, protocolOwner)
    await bracket.deploymentTransaction()
    console.log(`Bracket deployed to ${config.name} @ ${await bracket.getAddress()}`)
    coreDeployments.bracket = await bracket.getAddress()

    if (mainnet) {
      console.log("Submitting Bracket for verification...")
      await sleep(15)
      Promise.all([
        hre.run("verify:verify", {
          address: await bracket.getAddress(),
          constructorArguments: [coreDeployments.master, addresses.permit2, protocolOwner],
        }),
      ])
    }
  }

  if (coreDeployments.stopLimit == '') {
    //deploy
    const stopLimit: StopLimit = await DeployContract(new StopLimit__factory(signer), signer, coreDeployments.master, coreDeployments.bracket, addresses.permit2, protocolOwner)
    await stopLimit.deploymentTransaction()
    console.log(`Stop Limit deployed to ${config.name} @ ${await stopLimit.getAddress()}`)
    coreDeployments.stopLimit = await stopLimit.getAddress()
    if (mainnet) {
      console.log("Submitting StopLimit for verification...")
      await sleep(15)
      Promise.all([
        hre.run("verify:verify", {
          address: await stopLimit.getAddress(),
          constructorArguments: [coreDeployments.master, coreDeployments.bracket, addresses.permit2, protocolOwner],
        }),
      ])
    }
  }

  if (coreDeployments.oracleLess == '') {
    //deploy
    const oracleLess: OracleLess = await DeployContract(new OracleLess__factory(signer), signer, coreDeployments.master, addresses.permit2, protocolOwner)
    await oracleLess.deploymentTransaction()
    console.log(`OracleLess deployed to ${config.name} @ ${await oracleLess.getAddress()}`)
    coreDeployments.oracleLess = await oracleLess.getAddress()
    await sleep(1)

    //set fee
    let tx = await oracleLess.setOrderFee(getFeeByChainId(config.chainId))
    await tx.wait()
    await sleep(1)
    console.log("Set fee on Oracleless")

    if (mainnet) {
      console.log("Submitting OracleLess for verification...")
      await sleep(15)
      Promise.all([
        hre.run("verify:verify", {
          address: await oracleLess.getAddress(),
          constructorArguments: [coreDeployments.master, addresses.permit2, protocolOwner],
        }),
      ])
    }
  }

  if (newMaster) {
    //register sub keepers
    const master = AutomationMaster__factory.connect(coreDeployments.master, signer)
    let tx = await master.registerSubKeepers(
      coreDeployments.stopLimit,
      coreDeployments.bracket
    )
    await tx.wait()
    console.log("Sub Keepers Registered to Master on ", config.name)
  }

  console.log("Core deployments complete for ", config.name)


  return coreDeployments
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })


