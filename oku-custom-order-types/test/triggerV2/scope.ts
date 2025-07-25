import { AbiCoder, AddressLike, BytesLike, Signer } from "ethers";
import {  AutomationMaster, Bracket, IERC20, OracleLess, PlaceholderOracle, StopLimit, UniswapV3Pool } from "../../typechain-types";
import { ethers } from "hardhat";

export type Order = {
    orderId: BigInt,
    strikePrice: BigInt,
    amountIn: BigInt,
    pairId: BigInt,
    recipient: AddressLike,
    slippageBips: BigInt,
    zeroForOne: Boolean,
    direction: Boolean
}

export type SwapParams = {
    swapTokenIn: AddressLike,
    swapAmountIn: bigint,
    swapTarget: AddressLike,
    swapBips: number,
    txData: BytesLike
}

export class TestScope {


    signers!: Signer[]

    Frank!: Signer
    Andy!: Signer //tests for failure on LIMIT
    Steve!: Signer //tests for failure on STOP_LOSS_LIMIT
    Bob!: Signer
    Charles!: Signer//test swap-on-fill
    Ian!: Signer //isolated testing
    Oscar!: Signer //Oracle-less testing
    Gary!: Signer //Oracle-less failure testing

    abi = new AbiCoder()

    LimitOrderRegistry = "0x54df9e11c7933a9ca3bd1e540b63da15edae40bf"//optimism
    pool = "0x1fb3cf6e48F1E7B10213E7b6d87D4c073C7Fdb7b"//WETH/USDC pool @ 500
    router02 = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"

    wethWhale = "0x86Bb63148d17d445Ed5398ef26Aa05Bf76dD5b59"
    usdcWhale = "0xf89d7b9c864f589bbF53a82105107622B35EaA40"
    wethAmount = ethers.parseEther("1.65")
    usdcAmount = ethers.parseUnits("5000", 6)
    uniAmount = ethers.parseEther("665")
    opAmount = ethers.parseEther("6580")

    andyWeth = this.wethAmount * 20n
    steveWeth = this.andyWeth

    //CL oracles are priced @ 1e8
    initialEthPrice = ethers.parseUnits("3391.95", 8)
    initialUsdcPrice = ethers.parseUnits("0.9998", 8)
    initialUniPrice = ethers.parseUnits("7.53", 8)
    initialOpPrice = ethers.parseUnits("2.15", 8)


    Master!: AutomationMaster
    StopLimit!: StopLimit
    Bracket!: Bracket
    OracleLess!: OracleLess

    maxPendingOrders = 20
    minOrderSize = ethers.parseUnits("10", 8)
    fee = ethers.parseEther("0.0001")



    wethOracle!: PlaceholderOracle
    usdcOracle!: PlaceholderOracle
    uniOracle!: PlaceholderOracle
    opOracle!: PlaceholderOracle

    UniPool!: UniswapV3Pool
    WETH!: IERC20 //weth token0 0x4200000000000000000000000000000000000006
    USDC!: IERC20 //USDC token1 0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85
    OP!: IERC20 //0x4200000000000000000000000000000000000042
    UNI!: IERC20 //0x6fd9d7AD17242c41f7131d257212c54A0e816691

}

export const s = new TestScope()