import * as dotenv from "dotenv";

dotenv.config();



export type OraclePair = {
    token: string,
    oracle: string
}

export type CoreDeployments = {
    master: string,
    bracket: string,
    stopLimit: string,
    oracleLess: string
}

export type ChainConfig = {
    name: string,
    chainId: number,
    rpcUrl: string,
    privateKey: string,
    chainlink: boolean
}

export const chainConfigs: ChainConfig[] = [
    {
        name: "arbitrum",
        chainId: 42161, 
        rpcUrl: process.env.ARB_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "optimism",
        chainId: 10,
        rpcUrl: process.env.OP_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "polygon",
        chainId: 137,
        rpcUrl: process.env.POLYGON_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "base",
        chainId: 8453,
        rpcUrl: process.env.BASE_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "bsc",
        chainId: 56,
        rpcUrl: process.env.BSC_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "zksolc",
        chainId: 324,
        rpcUrl: process.env.ZKSYNC_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "scroll",
        chainId: 534353,
        rpcUrl: process.env.SCROLL_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "filecoin",
        chainId: 314,
        rpcUrl: process.env.FILECOIN_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "moonbeam",
        chainId: 1284,
        rpcUrl: process.env.MOONBEAM_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "polygonzkevm",
        chainId: 1101,
        rpcUrl: process.env.POLYGONZKEVM_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "blast",
        chainId: 81457,
        rpcUrl: process.env.BLAST_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "rootstock",
        chainId: 30,
        rpcUrl: process.env.ROOTSTOCK_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "mantapacific",
        chainId: 169,
        rpcUrl: process.env.MANTAPACIFIC_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "boba",
        chainId: 288,
        rpcUrl: process.env.BOBA_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false//double check
    },
    {
        name: "linea",
        chainId: 59144,
        rpcUrl: process.env.LINEA_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "taiko",
        chainId: 167000,
        rpcUrl: process.env.TAIKO_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "sei",
        chainId: 15000,
        rpcUrl: process.env.SEI_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "gnosis",
        chainId: 100,
        rpcUrl: process.env.GNOSIS_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    },
    {
        name: "bob",
        chainId: 1294,
        rpcUrl: process.env.BOB_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "xlayer",
        chainId: 2025,
        rpcUrl: process.env.XLAYER_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "metall2",
        chainId: 1750,
        rpcUrl: process.env.METAL_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: false
    },
    {
        name: "mainnet",
        chainId: 1,
        rpcUrl: process.env.MAINNET_URL!,
        privateKey: process.env.MAINNET_PRIVATE_KEY!,
        chainlink: true
    }
];


