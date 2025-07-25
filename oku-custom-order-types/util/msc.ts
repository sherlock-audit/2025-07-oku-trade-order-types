import { AbiCoder, AddressLike, BigNumberish, BytesLike, Signer, TransactionResponse, TypedDataDomain } from "ethers"
import { ERC20__factory, IERC20, IERC20__factory, IPermit2, IPermit2__factory, ISwapRouter02__factory, UniswapV3Pool } from "../typechain-types"
import { ethers } from "hardhat"
import { keccak256 } from "@ethersproject/keccak256";
import { toUtf8Bytes } from "@ethersproject/strings";
import { arrayify } from "@ethersproject/bytes";
import { AllowanceTransfer } from "@uniswap/permit2-sdk";
import { TypedData } from "ethers/lib.commonjs/abi/typed";
import hre from "hardhat";
import { impersonateAccount } from "@nomicfoundation/hardhat-network-helpers";

const abi = new AbiCoder()

type PermitDetails = {
    token: string
    amount: string
    expiration: string
    nonce: string
}

type PermitSingle = {
    details: PermitDetails
    spender: string
    sigDeadline: string
}

export interface Permit2Payload {
    permitSingle: PermitSingle;
    signature: string;
}

export type ExactInputSingleParams = {
    tokenIn: AddressLike,
    tokenOut: AddressLike,
    fee: BigNumberish,
    recipient: AddressLike,
    amountIn: BigNumberish,
    amountOutMinimum: BigNumberish,
    sqrtPriceLimitX96: BigNumberish
}

export type Order = {
    orderId: bigint,
    strikePrice: bigint,
    amountIn: bigint,
    tokenIn: AddressLike,
    tokenOut: AddressLike,
    recipient: AddressLike,
    slippageBips: bigint,
    direction: boolean
}

export const getGas = async (result: TransactionResponse) => {
    return Number((await result.wait())?.gasUsed)
}

export enum OrderType {
    STOP_LIMIT = 0,
    STOP_LOSS_LIMIT = 1
}

export type MasterUpkeepData = {
    orderType: OrderType,
    target: AddressLike,
    tokenIn: IERC20,
    tokenOut: IERC20,
    orderId: bigint,
    pendingOrderIdx: bigint,
    bips: bigint,
    amountIn: bigint,
    exchangeRate: bigint,
    txData: BytesLike
}

export const MasterUpkeepTuple = "tuple(uint8 orderType, address target, address tokenIn, address tokenOut, uint96 orderId, uint16 pendingOrderIdx, uint88 bips, uint256 amountIn, uint256 exchangeRate, bytes txData)"

export const decodeUpkeepData = async (data: BytesLike, signer: Signer): Promise<MasterUpkeepData> => {
    // Decode the data into a tuple structure
    const decoded = abi.decode(
        [MasterUpkeepTuple],
        data
    )[0] // Unpack the tuple since it returns an array

    // Map the decoded data to the MasterUpkeepData structure
    const upkeepData: MasterUpkeepData = {
        orderType: decoded.orderType as OrderType,
        target: decoded.target,
        tokenIn: IERC20__factory.connect(decoded.tokenIn, signer),
        tokenOut: IERC20__factory.connect(decoded.tokenOut, signer),
        orderId: BigInt(decoded.orderId),
        pendingOrderIdx: BigInt(decoded.pendingOrderIdx),
        bips: BigInt(decoded.bips),
        amountIn: BigInt(decoded.amountIn),
        exchangeRate: BigInt(decoded.exchangeRate),
        txData: decoded.txData
    }

    return upkeepData
}

export const generateUniTxData = async (
    tokenIn: IERC20,
    tokenOut: AddressLike,
    amountIn: bigint,
    router: AddressLike,
    pool: UniswapV3Pool,
    automationContract: AddressLike,
    amountOutMin: bigint
): Promise<BytesLike> => {
    const signer = await ethers.getSigner(automationContract.toString())
    const ROUTER = ISwapRouter02__factory.connect(router.toString(), signer)
    const params: ExactInputSingleParams = {
        tokenIn: await tokenIn.getAddress(),
        tokenOut: tokenOut,
        fee: await pool.fee(),
        recipient: automationContract,
        amountIn: amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n
    }

    const txData = (await ROUTER.exactInputSingle.populateTransaction(params)).data
    return txData
}

export const generateUniTx = async (
    router: AddressLike,
    pool: UniswapV3Pool,
    automationContract: AddressLike,
    amountOutMin: bigint,
    data: MasterUpkeepData
) => {
    const signer = await ethers.getSigner(automationContract.toString())
    const ROUTER = ISwapRouter02__factory.connect(router.toString(), signer)
    const params: ExactInputSingleParams = {
        tokenIn: await data.tokenIn.getAddress(),
        tokenOut: await data.tokenOut.getAddress(),
        fee: await pool.fee(),
        recipient: automationContract,
        amountIn: data.amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n
    }

    const txData = (await ROUTER.exactInputSingle.populateTransaction(params)).data

    // Encode the MasterUpkeepData struct 
    const encodedMasterUpkeepData = abi.encode(
        [MasterUpkeepTuple],
        [{
            orderType: data.orderType,
            target: router,
            tokenIn: await data.tokenIn.getAddress(),
            tokenOut: await data.tokenOut.getAddress(),
            orderId: data.orderId,
            pendingOrderIdx: data.pendingOrderIdx,
            bips: data.bips,
            amountIn: data.amountIn,
            exchangeRate: data.exchangeRate,
            txData: txData
        }]
    )

    return encodedMasterUpkeepData
}

/**
 * 
 * @param chainId 
 * @param expiration 
 * @return permitData and signature
 */
export const permitSingle = async (
    signer: Signer,
    chainId: number,
    token: string,
    amount: bigint,
    spender: string,
    permit2: string,
    nonce: number = 0,
    expiration?: number,
) => {
    if (expiration == undefined) {
        expiration = Math.floor(Date.now() / 1000) + 60 * 60 // 1 hour from now
    }

    const networkName = hre.network.name
    if (networkName == "hardhat" || networkName == "localhost") {
        console.log("IMPERSONATING", await signer.getAddress())
        signer = await ethers.getSigner(await signer.getAddress())
        await impersonateAccount(await signer.getAddress())
    }

    //verify token allowance
    const tokenContract = ERC20__factory.connect(token, signer)
    const tokenAllowance = await tokenContract.allowance(await signer.getAddress(), permit2)
    if(tokenAllowance < amount){
        console.log(`No permit2 approval for ${await tokenContract.symbol()}, approving max now...`)
        const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        await tokenContract.connect(signer).approve(permit2, MAX_UINT256)
    }

    const PERMIT = IPermit2__factory.connect(permit2, signer)

    const allowance = await PERMIT.allowance(
        await signer.getAddress(),
        token,
        spender
    )

    nonce = Number(allowance[2])

    const permitDetails: PermitDetails = {
        token: token,
        amount: amount.toString(),
        expiration: expiration.toString(),
        nonce: nonce.toString(),
    }

    const permitSingle: PermitSingle = {
        details: permitDetails,
        spender: spender,
        sigDeadline: (expiration + 86400).toString()
    }

    const { domain, types, values } = AllowanceTransfer.getPermitData(permitSingle, permit2, chainId)

    const signature = await signer.signTypedData(domain as TypedDataDomain, types, values)

    return {
        signature: signature,
        permitSingle: permitSingle
    }


}
export function encodePermit2Payload(permit: Permit2Payload): string {
    const abiCoder = new ethers.AbiCoder();
    const encodedData = abiCoder.encode(
        [
            "((" +
            "(address,uint160,uint48,uint48)," +
            "address,uint256)," +
            "bytes)",
        ],
        [
            [
                [
                    [
                        permit.permitSingle.details.token,
                        permit.permitSingle.details.amount,
                        permit.permitSingle.details.expiration,
                        permit.permitSingle.details.nonce,
                    ],
                    permit.permitSingle.spender,
                    permit.permitSingle.sigDeadline,
                ],
                permit.signature,
            ],
        ]
    );
    return encodedData
}

export const encodePermitSingle = async (signer: Signer,
    chainId: number,
    token: string,
    amount: BigInt,
    spender: string,
    permit2: string,
    nonce: number = 0,
    expiration?: number) => {

    const permit: Permit2Payload = await permitSingle(signer, chainId, token, amount, spender, permit2, nonce, expiration)
    return encodePermit2Payload(permit)

}



/**
* Converts an expiration (in milliseconds) to a deadline (in seconds) suitable for the EVM.
* Permit2 expresses expirations as deadlines, but JavaScript usually uses milliseconds,
* so this is provided as a convenience function.
*/
export function toDeadline(expiration: number): number {
    return Math.floor((Date.now() + expiration) / 1000)
}

// Function to get EIP-712 domain separator
export function getDomainSeparator(permit2Address: string, chainId: number): string {
    return keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            [
                "bytes32", // Domain type hash
                "bytes32", // Name hash
                "bytes32", // Version hash
                "uint256", // Chain ID
                "address"  // Verifying contract address
            ],
            [
                keccak256(toUtf8Bytes("Permit2")),  // Domain type name
                keccak256(toUtf8Bytes("1")),        // Version of the protocol
                chainId,
                permit2Address                      // Address of Permit2 contract
            ]
        )
    );
}

// Function to build permit signature using EIP-712
export async function buildPermitSignature(
    signer: ethers.Signer,
    domainSeparator: string,
    permit: IPermit2.PermitTransferFromStruct,
    transferDetails: IPermit2.SignatureTransferDetailsStruct
): Promise<string> {
    // Create the permit struct hash (encode according to EIP-712)
    const PERMIT_TYPEHASH = keccak256(toUtf8Bytes(
        "PermitTransferFrom(TokenPermissions permitted,uint256 nonce,uint256 deadline)"
    ));
    const TOKEN_PERMISSIONS_TYPEHASH = keccak256(toUtf8Bytes(
        "TokenPermissions(address token,uint256 amount)"
    ));

    // Hash the TokenPermissions
    const tokenPermissionsHash = keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes32", "address", "uint256"],
            [
                TOKEN_PERMISSIONS_TYPEHASH,
                permit.permitted.token,
                permit.permitted.amount
            ]
        )
    );

    // Hash the full permit struct
    const permitHash = keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes32", "bytes32", "uint256", "uint256"],
            [
                PERMIT_TYPEHASH,
                tokenPermissionsHash,
                permit.nonce,
                permit.deadline
            ]
        )
    );

    // EIP-712 message encoding
    const messageHash = keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
            ["bytes32", "bytes32"],
            [
                domainSeparator,  // Domain separator
                permitHash        // The hashed permit struct
            ]
        )
    );

    // Get the signature from the signer
    const signature = await signer.signMessage(arrayify(messageHash));
    return signature;
}