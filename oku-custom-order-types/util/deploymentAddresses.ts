import { ethers } from "hardhat";

export type tokenInfo = {
    symbol: string,
    token: string,
    feed: string,
    relay: string
}
export abstract class ChainAddresses {
    readonly permit2: string = ""

    readonly allTokens: tokenInfo[] = [

    ]

    readonly coreDeployments = {
        master: '0x02b4dB6FE23386BCaC71D15aDA3814A45210Dd00',
        bracket: '0x1D718B430aCF5E385024162Da9Cd27bed7c02EC1',
        stopLimit: '0x03d58de2EE76515340F8Ac0dFCccf9BaEd4d39d5',
        oracleLess: '0x40c81Dc7B6374E97C697Acc64F2495054de47300'
    };
}
export class MainnetAddresses extends ChainAddresses {

    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

    readonly allTokens: tokenInfo[] = [
        { symbol: "WETH", token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", feed: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419", relay: "" },
        { symbol: "WSTETH", token: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", feed: "0x164b276057258d81941e97B0a900D4C7B358bCe0", relay: "" },
        { symbol: "USDC", token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", feed: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", relay: "" },
        { symbol: "USDT", token: "0xdAC17F958D2ee523a2206206994597C13D831ec7", feed: "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", relay: "" },
        { symbol: "COMP", token: "0xc00e94cb662c3520282e6f5717214004a7f26888", feed: "0xdbd020caef83efd542f4de03e3cf0c28a4428bd5", relay: "" },
        { symbol: "WBTC", token: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", feed: "0xf4030086522a5beea4988f8ca5b36dbc97bee88c", relay: "" },
        { symbol: "UNI", token: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", feed: "0x553303d460EE0afB37EdFf9bE42922D8FF63220e", relay: "" },
        { symbol: "ENS", token: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72", feed: "0x5C00128d4d1c2F4f652C267d7bcdD7aC99C16E16", relay: "" },
        { symbol: "DYDX", token: "0x92d6c1e31e14520e676a687f0a93788b716beff5", feed: "", relay: "" },
        { symbol: "AAVE", token: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", feed: "0x547a514d5e3769680Ce22B2361c10Ea13619e8a9", relay: "" },
        { symbol: "MKR", token: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2", feed: "0xec1D1B3b0443256cc3860e24a46F108e699484Aa", relay: "" },
        { symbol: "TRIBE", token: "0xc7283b66eb1eb5fb86327f08e1b5816b0720212b", feed: "", relay: "" },
        { symbol: "MATIC", token: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0", feed: "0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676", relay: "" },
        { symbol: "LDO", token: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32", feed: "", relay: "" },
        { symbol: "BAL", token: "0xba100000625a3754423978a60c9317c58a424e3D", feed: "0xdF2917806E30300537aEB49A7663062F4d1F2b5F", relay: "" },
        { symbol: "RETH", token: "0xae78736Cd615f374D3085123A210448E74Fc6393", feed: "", relay: "" },
        { symbol: "CRV", token: "0xD533A94974073B08e3809D4a66Ca925F7dad7c73", feed: "0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f", relay: "" },
        //{ symbol: "EIGN", token: "0x5c49c3f6cb584bd298a8040b3219b10cd4654455", feed: "0xf2917e602C2dCa458937fad715bb1E465305A4A1", relay: "" },
        { symbol: "1INCH", token: "0x111111111117dC0aa78b770fA79b7594669C6538", feed: "0x72AFAECF99C9d9C8215fF44C77B94B99C28741e8", relay: "" },
        { symbol: "GRT", token: "0x6c6Bc977E13f9768b1e413c4B689A091D5a89009", feed: "0x86cF33a451dE9dc61a2862FD94FF4ad4Bd65A5d2", relay: "" },
        { symbol: "SNX", token: "0xC011a73ee8578A9d51226C9A79FcF20b17b74B63", feed: "0xDC3EA94CD0AC27d9A86C180091e7f78C683d3699", relay: "" },
        { symbol: "YFI", token: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e", feed: "0xA027702dbb89fbd58938e4324ac03B58d812b0E1", relay: "" },

        //todo OP, ARB
    ];

    // Core Contract Deployments
    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };

}
export class PolygonAddresses extends ChainAddresses {
    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

    readonly allTokens: tokenInfo[] = [
        {
            symbol: "WETH",
            token: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
            feed: "0xF9680D99D6C9589e2a93a78A04A279e509205945",
            relay: "",
        },
        {
            symbol: "WSTETH",
            token: "0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD",
            feed: "",
            relay: "",
        },
        {
            symbol: "USDT",
            token: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
            feed: "0x0A6513e40db6EB1b165753AD52E80663aeA50545",
            relay: "",
        },
        {
            symbol: "USDC",
            token: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
            feed: "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7",
            relay: "",
        },
        {
            symbol: "AAVE",
            token: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
            feed: "0x72484B12719E23115761D5DA1646945632979bB6",
            relay: "",
        },
        {
            symbol: "BAL",
            token: "0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3",
            feed: "0xD106B538F2A868c28Ca1Ec7E298C3325E0251d66",
            relay: "",
        },
        {
            symbol: "WBTC",
            token: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
            feed: "0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6",
            relay: "",
        },
        {
            symbol: "LINK",
            token: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
            feed: "0xd9FFdb71EbE7496cC440152d43986Aae0AB76665",
            relay: "",
        },
        {
            symbol: "CRV",
            token: "0x172370d5Cd63279eFa6d502DAB29171933a610AF",
            feed: "0x336584C8E6Dc19637A5b36206B1c79923111b405",
            relay: "",
        },
        {
            symbol: "SUSHI",
            token: "0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a",
            feed: "0x49B0c695039243BBfEb8EcD054EB70061fd54aa0",
            relay: "",
        },
        {
            symbol: "MANA",
            token: "0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4",
            feed: "0xA1CbF3Fe43BC3501e3Fc4b573e822c70e76A7512",
            relay: "",
        },
        {
            symbol: "UNI",
            token: "0xb33EaAd8d922B1083446DC23f610c2567fB5180f",
            feed: "0xdf0Fb4e4F928d2dCB76f438575fDD8682386e13C",
            relay: "",
        },
        {
            symbol: "WMATIC",
            token: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
            feed: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0",
            relay: "",
        },
        {
            symbol: "1INCH",
            token: "0x9c2C5fd7b07E95EE044DDeba0E97a665F142394f",
            feed: "0x443C5116CdF663Eb387e72C688D276e702135C87",
            relay: "",
        },
        {
            symbol: "MKR",
            token: "0x6f7C932e7684666C9fd1d44527765433e01fF61d",
            feed: "0xa070427bF5bA5709f70e98b94Cb2F435a242C46C",
            relay: "",
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class ArbAddresses extends ChainAddresses {
    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
            feed: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612',
            relay: '0x384542D720A765aE399CFDDF079CBE515731F044',
        },
        {
            symbol: 'WSTETH',
            token: '0x5979D7b546E38E414F7E9822514be443A4800529',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
            feed: '0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
            feed: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
            relay: '0x9BDb5575E24EEb2DCA7Ba6CE367d609Bdeb38246',
        },
        {
            symbol: 'USDC',
            token: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
            feed: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3',
            relay: '0x9BDb5575E24EEb2DCA7Ba6CE367d609Bdeb38246',
        },
        {
            symbol: '1INCH',
            token: '',
            feed: '0x4bC735Ef24bf286983024CAd5D03f0738865Aaef',
            relay: '',
        },
        {
            symbol: 'AAVE',
            token: '',
            feed: '0xaD1d5344AaDE45F43E596773Bcc4c423EAbdD034',
            relay: '',
        },
        {
            symbol: 'ARB',
            token: '',
            feed: '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6',
            relay: '',
        },
        {
            symbol: 'AVAX',
            token: '',
            feed: '0x8bf61728eeDCE2F32c456454d87B5d6eD6150208',
            relay: '',
        },
        {
            symbol: 'BAL',
            token: '',
            feed: '0xBE5eA816870D11239c543F84b71439511D70B94f',
            relay: '',
        },
        {
            symbol: 'LINK',
            token: '',
            feed: '0x86E53CF1B870786351Da77A57575e79CB55812CB',
            relay: '',
        },
        {
            symbol: 'UNI',
            token: '',
            feed: '0x9C917083fDb403ab5ADbEC26Ee294f6EcAda2720',
            relay: '',
        },
        {
            symbol: 'CRV',
            token: '',
            feed: '0xaebDA2c976cfd1eE1977Eac079B4382acb849325',
            relay: '',
        },
        {
            symbol: 'LDO',
            token: '',
            feed: '0xA43A34030088E6510FecCFb77E88ee5e7ed0fE64',
            relay: '',
        },
        {
            symbol: 'SUSHI',
            token: '',
            feed: '0xb2A8BA74cbca38508BA1632761b56C897060147C',
            relay: '',
        },
        {
            symbol: 'DAI',
            token: '',
            feed: '0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB',
            relay: '',
        },
        {
            symbol: 'MKR',
            token: '',
            feed: '0xdE9f0894670c4EFcacF370426F10C3AD2Cdf147e',
            relay: '',
        },
        {
            symbol: 'GRT',
            token: '',
            feed: '0x0F38D86FceF4955B705F35c9e41d1A16e0637c73s',
            relay: '',
        },
        {
            symbol: 'XAI',
            token: '',
            feed: '0x806c532D543352e7C344ba6C7F3F00Bfbd309Af1',
            relay: '',
        },
        {
            symbol: 'COMP',
            token: '',
            feed: '0xe7C53FFd03Eb6ceF7d208bC4C13446c76d1E5884',
            relay: '',
        },
        {
            symbol: 'LPT',
            token: '0x289ba1701C2F088cf0faf8B3705246331cB8A839',
            feed: '',
            relay: '',
        },
        {
            symbol: 'TUSD',
            token: '0x4D15a3A2286D883AF0AA1B3f21367843FAc63E07',
            feed: '0x6fAbee62266Da6686EE2744C6f15bb8352d2f28D',
            relay: '',
        },
        {
            symbol: 'YFI',
            token: '0x82e3A8F066a6989666b031d916c43672085b1582',
            feed: '0x745Ab5b69E01E2BE1104Ca84937Bb71f96f5fB21',
            relay: '',
        },
        {
            symbol: 'MAGIC',
            token: '0x539bdE0d7Dbd336b79148AA742883198BBF60342',
            feed: '0x47E55cCec6582838E173f252D08Afd8116c2202d',
            relay: '',
        },
        {
            symbol: 'GMX',
            token: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a',
            feed: '0xDB98056FecFff59D032aB628337A4887110df3dB',
            relay: '',
        },
        {
            symbol: 'RDNT',
            token: '0x3082CC23568eA640225c2467653dB90e9250AaA0',
            feed: '0x20d0Fcab0ECFD078B036b6CAf1FaC69A6453b352',
            relay: '',
        },
        {
            symbol: 'WOO',
            token: '0xcafcd85d8ca7ad1e1c6f82f651fa15e33aefd07b',
            feed: '0x5e2b5C5C07cCA3437c4D724225Bb42c7E55d1597',
            relay: '',
        },
        {
            symbol: 'STG',
            token: '0x6694340fc020c5e6b96567843da2df01b2ce1eb6',
            feed: '0xe74d69E233faB0d8F48921f2D93aDfDe44cEb3B7',
            relay: '',
        },
        {
            symbol: 'FXS',
            token: '0x9d2f299715d94d8a7e6f5eaa8e654e8c74a988a7',
            feed: '0x36a121448D74Fa81450c992A1a44B9b7377CD3a5',
            relay: '',
        },
        {
            symbol: 'KNC',
            token: '0xe4dddfe67e7164b0fe14e218d80dc4c08edc01cb',
            feed: '0xbF539d4c2106dd4D9AB6D56aed3d9023529Db145',
            relay: '',
        },
        {
            symbol: 'DODO',
            token: '0x69Eb4FA4a2fbd498C257C57Ea8b7655a2559A581',
            feed: '0xA33a06c119EC08F92735F9ccA37e07Af08C4f281',
            relay: '',
        },
        {
            symbol: 'JOE',
            token: '0x371c7ec6D8039ff7933a2AA28EB827Ffe1F52f07',
            feed: '0x04180965a782E487d0632013ABa488A472243542',
            relay: '',
        },
        {
            symbol: 'SPELL',
            token: '0x3e6648c5a70a150a88bce65f4ad4d506fe15d2af',
            feed: '0x383b3624478124697BEF675F07cA37570b73992f',
            relay: '',
        },
        {
            symbol: 'GNS',
            token: '0x18c11FD286C5EC11c3b683Caa813B77f5163A122',
            feed: '0xE89E98CE4E19071E59Ed4780E0598b541CE76486',
            relay: '',
        }
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };


}
export class BaseAddresses extends ChainAddresses {
    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x4200000000000000000000000000000000000006',
            feed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
            relay: '0x45b265c7919D7FD8a0D673D7ACaA8F5A7abb430D',
        },
        {
            symbol: 'WSTETH',
            token: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            feed: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
            relay: '0xfA81b396270730dbd276D3Ee002B0B7ff68D86F8',
        },
        {
            symbol: 'USDT',
            token: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
            feed: '0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9',
            relay: '',
        },
        {
            symbol: 'VIRTUAL',
            token: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
            feed: '',
            relay: '',
        },
        {
            symbol: 'DEGEN',
            token: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed',
            feed: '0xE62BcE5D7CB9d16AB8b4D622538bc0A50A5799c2',
            relay: '',
        },
        {
            symbol: 'MORPHO',
            token: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
            feed: '',
            relay: '',
        },
        {
            symbol: 'BRETT',
            token: '0x532f27101965dd16442e59d40670faf5ebb142e4',
            feed: '',
            relay: '',
        },
        {
            symbol: 'CARV',
            token: '0xc08Cd26474722cE93F4D0c34D16201461c10AA8C',
            feed: '',
            relay: '',
        },
        {
            symbol: 'MOG',
            token: '0x2Da56AcB9Ea78330f947bD57C54119Debda7AF71',
            feed: '0x4aeb6D15769EaD32D0c5Be2940F40c7CFf53801d',
            relay: '',
        },
        {
            symbol: 'AXL',
            token: '0x23ee2343B892b1BB63503a4FAbc840E0e2C6810f',
            feed: '0x676C4C6C31D97A5581D3204C04A8125B350E2F9D',
            relay: '',
        },
        {
            symbol: 'BAL',
            token: '0x7c6b91D9Be155A6Db01f749217d76fF02A7227F2',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };



}
export class BscAddresses extends ChainAddresses {

    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
            feed: '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            feed: '0x51597f405303C4377E36123cBc172b13269EA163',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0x2Bbbdf97295F73175b12CC087cF446765931e1C3',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x55d398326f99059fF775485246999027B3197955',
            feed: '0xB97Ad0E74fa7d920791E90258A6E2085088b4320',
            relay: '',
        },
        {
            symbol: 'INJ',
            token: '0xa2b726b1145a4773f68593cf171187d8ebe4d495',
            feed: '0x63A9133cd7c611d6049761038C16f238FddA71d7',
            relay: '',
        },
        {
            symbol: 'FDUSD',
            token: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409',
            feed: '0x390180e80058A8499930F0c13963AD3E0d86Bfc9',
            relay: '',
        },
        {
            symbol: 'CAKE',
            token: '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82',
            feed: '0xB6064eD41d4f67e353768aA239cA86f4F73665a1',
            relay: '',
        },
        {
            symbol: 'GMT',
            token: '0x3019BF2a2eF8040C242C9a4c5c4BD4C81678b2A1',
            feed: '0x8b0D36ae4CF8e277773A7ba5F35c09Edb144241b',
            relay: '',
        },
        {
            symbol: 'CAT',
            token: '0x6894CDe390a3f51155ea41Ed24a33A4827d3063D',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WMTX',
            token: '0xDBB5Cf12408a3Ac17d668037Ce289f9eA75439D7',
            feed: '',
            relay: '',
        },
        {
            symbol: 'BABYDOGE',
            token: '0xc748673057861a797275cd8a068abb95a902e8de',
            feed: '',
            relay: '',
        },
        {
            symbol: 'INSURANCE',
            token: '0x64E4fea6e4F3637025c7Bcd878E2B238B01f7D4e',
            feed: '',
            relay: '',
        },
        {
            symbol: 'LUMIA',
            token: '0x7F39BcdCa8E0E581c1d43aaa1cB862AA1c8C2047',
            feed: '',
            relay: '',
        },
        {
            symbol: 'CTSI',
            token: '0x8da443f84fea710266c8eb6bc34b71702d033ef2',
            feed: '',
            relay: '',
        },
        {
            symbol: 'AI',//sleepless AI 
            token: '0xBDA011D7F8EC00F66C1923B049B94c67d148d8b2',
            feed: '',
            relay: '',
        },
        {
            symbol: 'CYBER',
            token: '0x14778860e937f509e651192a90589de711fb88a9',
            feed: '',
            relay: '',
        },
        {
            symbol: 'MNT',
            token: '0x3e81aa8d6813ec9d7e6ddb4e523fb1601a0e86f3',
            feed: '',
            relay: '',
        },
        {
            symbol: 'CGPT',
            token: '0x9840652DC04fb9db2C43853633f0F62BE6f00f98',
            feed: '',
            relay: '',
        },
        {
            symbol: 'HFT',
            token: '0x44Ec807ce2F4a6F2737A92e985f318d035883e47',
            feed: '',
            relay: '',
        },
        {
            symbol: 'MVL',
            token: '0x5f588efaf8eb57e3837486e834fc5a4e07768d98',
            feed: '',
            relay: '',
        },
        {
            symbol: 'NMT',
            token: '0x03AA6298F1370642642415EDC0db8b957783e8D6',
            feed: '',
            relay: '',
        },
        {
            symbol: 'HOOK',
            token: '0xa260e12d2b924cb899ae80bb58123ac3fee1e2f0',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: '',
            token: '',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };


}
export class OptimisimAddresses extends ChainAddresses {

    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

    readonly allTokens: tokenInfo[] = [
        { symbol: "WETH", token: "0x4200000000000000000000000000000000000006", feed: "0x13e3ee699d1909e989722e753853ae30b17e08c5", relay: "0x064E3A830f905686a718cb100708ff3D90aB5202" },
        { symbol: "OP", token: "0x4200000000000000000000000000000000000042", feed: "0x0d276fc14719f9292d5c1ea2198673d1f4269246", relay: "0xCBd011dACB8270E5235CB18b3b189Ff7d7fF5f28" },
        { symbol: "DAI", token: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", feed: "", relay: "" },
        { symbol: "WBTC", token: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", feed: "0xD702DD976Fb76Fffc2D3963D037dfDae5b04E593", relay: "0x210e8Ed0AaaF3A59FD2BD761b081F2B1c246c428" },
        { symbol: "AAVE", token: "0x76FB31fb4af56892A25e32cFC43De717950c9278", feed: "0x338ed6787f463394d24813b297401b9f05a8c9d1", relay: "0x1bfeb157400A05C010C34bfA0Baf89822D14a5e4" },
        { symbol: "UNI", token: "0x6fd9d7AD17242c41f7131d257212c54A0e816691", feed: "0x11429ee838cc01071402f21c219870cbac0a59a0", relay: "0x5B4784247dFCA5d0cB73E8ad46114eA3E65cF237" },
        { symbol: "WSTETH", token: "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb", feed: "0x698b585cbc4407e2d54aa898b2600b53c68958f7", relay: "0x1792ea57b9DB08A077101999b309E951fe576792" },
        { symbol: "RETH", token: "0x9Bcef72be871e61ED4fBbc7630889beE758eb81D", feed: "", relay: "" },
        { symbol: "SNX", token: "0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4", feed: "0x2fcf37343e916eaed1f1ddaaf84458a359b53877", relay: "0x2DBe413536CBa5f4Eb832f94427Be980dDbAa0aa" },
        { symbol: "USDT", token: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", feed: "", relay: "" },
        { symbol: "PYTH", token: "0x99C59ACeBFEF3BBFB7129DC90D1a11DB0E91187f", feed: "0x0838cFe6A97C9CE1611a6Ed17252477a3c71eBEb", relay: "0xe4f974b9DB33b9132709F2BadC0cf24954167FD2" },
        { symbol: "WLD", token: "0xdc6ff44d5d932cbd77b52e5612ba0529dc6226f1", feed: "0x4e1C6B168DCFD7758bC2Ab9d2865f1895813D236", relay: "0x588ede0BF90d9E883303b7F6F2f2814B5c129717" },
        { symbol: "LDO", token: "0xfdb794692724153d1488ccdbe0c56c252596735f", feed: "0x221618871470f78D8a3391d35B77dFb3C0fbc383", relay: "0x7AC2e13d63bFE22DB4bf5aa0DaD2bC2C028b362F" },
        { symbol: "PENDLE", token: "0xbc7b1ff1c6989f006a1185318ed4e7b5796e66e1", feed: "0x58F23F80bF389DB1af9e3aA8c59679806749A8a4", relay: "0x17781589c1088038652A4877bB0b170a1a37951F" },
        { symbol: "FRAX", token: "0x2E3D870790dC77A83DD1d18184Acc7439A53f475", feed: "0xc7D132BeCAbE7Dcc4204841F33bae45841e41D9C", relay: "0xb1A9A0A5D4426A5Ce322639C9f4E8F27193e32A1" },
        { symbol: "RPL", token: "0xC81D1F0EB955B0c020E5d5b264E1FF72c14d1401", feed: "0xADE082c91A6AeCC86fC11704a830e933e1b382eA", relay: "0xFB92D97223FEB34A0e33A1A4a439bAa1789D683D" },
        { symbol: "YFI", token: "0x9046d36440290ffde54fe0dd84db8b1cfee9107b", feed: "0x5cdC797acCBf57EE2363Fed9701262Abc87a232e", relay: "0x5aBB6d9735e7131f39F06A4AA7c789EBfC295241" },
        { symbol: "FXS", token: "0x67CCEA5bb16181E7b4109c9c2143c24a1c2205Be", feed: "0xB9B16330671067B1b062B9aC2eFd2dB75F03436E", relay: "0x0c0337e0283d8547b54E15b0A5C5B2248Ff5FCE5" },
        { symbol: "BAL", token: "0xfe8b128ba8c78aabc59d4c64cee7ff28e9379921", feed: "0x30D9d31C1ac29Bc2c2c312c1bCa9F8b3D60e2376", relay: "0xe6daa90Bae9cAB1c171eefA561fF9b381ee5C19A" },
        { symbol: "KNC", token: "0xa00e3a3511aac35ca78530c85007afcd31753819", feed: "0xCB24d22aF35986aC1feb8874AdBbDF68f6dC2e96", relay: "0x73F77640f5428348c99041D9806e5dDAf3eAA32A" },
        { symbol: "VELO", token: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", feed: "0x0f2Ed59657e391746C1a097BDa98F2aBb94b1120", relay: "0x23cFAE143Fa7cc5b9AA32c3857d3D1aE1193061E" },
        { symbol: "USDC", token: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", feed: "0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3", relay: "0x8B5AbFbdC5Ec4B88A4e94afBf9f22b81F71a25a9" },
        { symbol: "LINK", token: "0x350a791bfc2c21f9ed5d10980dad2e2638ffa7f6", feed: "0xCc232dcFAAE6354cE191Bd574108c1aD03f86450", relay: "0x0f39bf4De2F2Ee7f1fbc9084E6F5e2E87CD6738d" },
        { symbol: "CRV", token: "0x0994206dfE8De6Ec6920FF4D779B0d950605Fb53", feed: "0xbD92C6c284271c227a1e0bF1786F468b539f51D9", relay: "0x40680A87E630d7d1E05cA1413448e0Dee1C3702c" },
        { symbol: "STG", token: "0x296F55F8Fb28E498B858d0BcDA06D955B2Cb3f97", feed: "", relay: "" },
        { symbol: "CBETH", token: "0xadDb6A0412DE1BA0F936DCaeb8Aaa24578dcF3B2", feed: "", relay: "" },
        { symbol: "PEPE", token: "0x12ff4a259e14D4DCd239C447D23C9b00F7781d8F", feed: "0x64Ecf089a6594Be781908D5a26FC8fA6CB08A2C7", relay: "0xfdf6D84f6dfFE2D439c43EDAC0d617eD91756db0" },
        { symbol: "USDT", token: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", feed: "0xECef79E109e997bCA29c1c0897ec9d7b03647F5E", relay: "0xA97A40bBb5E6C17eae6EdA9F999F9b19A9dEF3b8" }

    ]

    /**
        master: "0x940De081B76AbDa22F7E1Dfcfcf666354665c0Ae",
        bracket: "0x908E2b7C9C5559834776eebe101947e38b66b2CA",
        stopLimit: "0x7627EDD2357e4F49a1E3D9ae1f353a00DBd67dFA",
        oracleLess: "0xB2c42eBC823877e23128DDcadD562402d84ca95d",

        readonly coreDeployments = {
        master: '0xa3EB0e5B79cFa0bee52c5Bfaf2B46B20a3E46Ba5',
        bracket: '0x29C6B745D21FF53140B11d4B5999564E1057F6F1',
        stopLimit: '0xDd10e34AB58aF00693f2bFAc483139C8EEe2D5Ab',
        oracleLess: '0x8c8D62eBFE417c9eA8c51583A516a5476388a5D9'

        //pre audit fix review
        readonly coreDeployments = {
        master: '0x7d7B52AB13cbC0aBD7FEAE84799a22d22a186079',
        bracket: '0x1EB68eBA2471D4d72a20b55369F1BdBcF10155bc',
        stopLimit: '0xF9fFbA0fE174bf7a099B10D1142379322CD1Bf46',
        oracleLess: '0x7B0Dee8e9d7B22b6c4DddbB76008A7bf7C5937a1'
        };

        readonly coreDeployments = {
        master: '0x3dA4EB538B78240f21f102F7A9b3A2a79519F2F4',
        bracket: '0x34677d225E05E892a72E2538Df6727a0F2B62F12',
        stopLimit: '0x4FD3A1652AA1BC60fCa09B57f26962f9009c25f0',
        oracleLess: '0x6fA93071d2dC44D7bD86c6807B73e9B6a71d10c8'
        };

        master: '0x78efE174bF9c70379C3b5c6e03694C28245DcE22',
        bracket: '0x59b19d9a19e1A10A2698b8Db631D8b40e1D92E6d',
        stopLimit: '0x544802bBD54BD6162151df6936dbdAA1D2f0493e',
        oracleLess: '0xd6A3cACe4E2c4bDE4Ee07E7835700074F926b2Cf'
        };

        //prod deploys 1
        readonly coreDeployments = {
        master: '0x3B73E27B8dDdB727cC469ee26A96bb7013d7C359',
        bracket: '0xB1C1E10b2525Aa3f6E1298538F2B53AAfBD6E378',
        stopLimit: '0xC727477b2Ff7C92abFC75b74531a6C3d36b1D467',
        oracleLess: '0x48eA18dba592550aBDf53De4D98A97C3A09d1923'

        master: '0x6A8A7b6d85064744A02d41d6D7F5ecD7b77fe6C2',
        bracket: '0xC403Bd2e26c81049d73600Df1424ce53a945f124',
        stopLimit: '0xb6D84CF63D503CE9068F91775b5F3e32D89F21D5',
        oracleLess: '0xbBC8A0c5358eEb3A11bc4aF4d03231F95913ee8e'
    };
     */


    //final deploys
    readonly coreDeployments = {
        master: '0xCaE450Ba6e9d6e9A5A719C1B4b3d2033C3047B3e',
        bracket: '0x8e9a03e2533f8B4641a271429496F582B89c8fD7',
        stopLimit: '0xfdcFdd8267F7054facF9eA2aAD538d74da4B65c8',
        oracleLess: '0x5ce1E92eBB96deee97F4a225DF97EDadF5fb76e9'
    };
}
export class ZkSyncAddresses extends ChainAddresses {
    readonly permit2: string = "0x0000000000225e31d15943971f47ad3022f714fa"
    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0xf00DAD97284D0c6F06dc4Db3c32454D4292c6813',
            feed: '0x6D41d1dc818112880b40e26BD6FD347E41008eDA',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4',
            feed: '0x1824D297C6d6D311A204495277B63e943C2D376E',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0xCafB42a2654C20cb3739F04243E925aa47302bec',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C',
            feed: '0xB615075979AE1836B476F651f1eB79f0Cd3956a9',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class ScrollAddresses extends ChainAddresses {
    readonly permit2: string = "0xFcf5986450E4A014fFE7ad4Ae24921B589D039b5"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x5300000000000000000000000000000000000004',
            feed: '0x6bF14CB0A831078629D993FDeBcB182b21A8774C',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4',
            feed: '0x43d12Fb3AfCAd5347fA764EeAB105478337b7200',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0xf610A9dfB7C89644979b4A0f27063E9e7d7Cda32',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df',
            feed: '0xf376A91Ae078927eb3686D6010a6f1482424954E',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class FilecoinAddresses extends ChainAddresses {
    readonly permit2: string = "0xb81363578d377F8DA3902e9e705FD60198a9cEc2"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: 'f410fkivwc5k3l74bo2zjghnhx4nf7fau5nyqep3rtta',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: 'f410fiiuetm2vaon4ldzhqdgeqvert7e47l4upp6ugly',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class MoonbeamAddresses extends ChainAddresses {
    readonly permit2: string = "0xe96e30e92e01dc8a880f701b2d2160f93da18df7"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x30D2a9F5FDf90ACe8c17952cbb4eE48a55D916A7',
            feed: '0x9ce2388a1696e22F870341C3FC1E89710C7569B5',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x8f552a71EFE5eeFc207Bf75485b356A0b3f01eC9',
            feed: '0xA122591F60115D63421f66F752EF9f6e0bc73abC',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0xeFAeeE334F0Fd1712f9a8cc375f427D9Cdd40d73',
            feed: '0xD925C5BF88Bd0ca09312625d429240F811b437c6',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };

}
export class PolygonZkEvmAddresses extends ChainAddresses {
    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
            feed: '0x97d9F9A00dEE0004BE8ca0A8fa374d486567eE2D',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035',
            feed: '0x0167D934CB7240e65c35e347F00Ca5b12567523a',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0x5D8cfF95D7A57c0BF50B30b43c7CC0D52825D4a9',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
            feed: '0x8499f6E7D6Ac56C83f66206035D33bD1908a8b5D',
            relay: '',
        },
        {
            symbol: 'WBTC',
            token: '0xEA034fb02eB1808C2cc3adbC15f447B93CbE08e1',
            feed: '0xAE243804e1903BdbE26ae5f35bc6E4794Be21574',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class BlastAddresses extends ChainAddresses {
    readonly permit2: string = "0x000000000022d473030f116ddee9f6b43ac78ba3"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x4300000000000000000000000000000000000004',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0xCdB5835bdb75c5B3671633d12d7E0DB6be5873A5',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x0be9A0e280962213bF85C4F8669359291b2E404A',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class RootstockAddresses extends ChainAddresses {
    readonly permit2: string = "0xFcf5986450E4A014fFE7ad4Ae24921B589D039b5"

    //https://rootstock.blockscout.com/tokens?sort=holder_count&order=desc
    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '',
            feed: '',
            relay: '',
        }
        /**
        
        ,
        {
            symbol: 'RIF',
            token: '0x2aCc95758f8b5F583470bA265Eb685a8f45fC9D5',
            feed: '', 
            relay: '', 
        },
        {
            symbol: 'SOV',
            token: '0xEfC78FC7D48B64958315949279bA181C2114abbD',
            feed: '', 
            relay: '', 
        },
        {
            symbol: 'RDOC',
            token: '0x2d919f19D4892381d58EdEbEcA66D5642ceF1A1F',
            feed: '', 
            relay: '', 
        },
        {
            symbol: 'USDRIF',
            token: '0x3A15461d8AE0f0Fb5fA2629e9dA7D66A794a6E37',
            feed: '', 
            relay: '', 
        },
        {
            symbol: 'RUSDT',
            token: '0xEf213441a85DF4d7acBdAe0Cf78004E1e486BB96',
            feed: '', 
            relay: '', 
        },*/
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class MantaPacificAddresses extends ChainAddresses {
    readonly permit2: string = "0x83986Ff655A54ee061F6B7F476B92f4Fed111B93"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x0Dc808adcE2099A9F62AA87D9670745AbA741746',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0xb73603C5d87fA094B7314C74ACE2e64D165016fb',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0x2FE3AD97a60EB7c79A976FC18Bb5fFD07Dd94BA5',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0xf417F5A458eC102B90352F697D6e2Ac3A3d2851f',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class BobaAddresses extends ChainAddresses {
    readonly permit2: string = ""//no permit 2

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x66a2A913e447d6b4BF33EFbec43aAeF87890FBbc',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x5DE1677344D3Cb0D7D465c10b72A8f60699C062d',
            feed: '',
            relay: '',
        },
        {
            symbol: 'BOBA',
            token: '0xa18bF3994C0Cc6E3b63ac420308E5383f53120D7',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };

    ;
}
export class LineaAddresses extends ChainAddresses {
    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
            feed: '0x3c6Cd9Cc7c7a4c2Cf5a82734CD249D7D593354dA',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
            feed: '0xAADAa473C1bDF7317ec07c915680Af29DeBfdCb5',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0xB5beDd42000b71FddE22D3eE8a79Bd49A568fC8F',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0xA219439258ca9da29E9Cc4cE5596924745e12B93',
            feed: '0xefCA2bbe0EdD0E22b2e0d2F8248E99F4bEf4A7dB',
            relay: '',
        },
        {
            symbol: 'WBTC',
            token: '0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4',
            feed: '0x7A99092816C8BD5ec8ba229e3a6E6Da1E628E1F9',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class TaikoAddresses extends ChainAddresses {
    readonly permit2: string = "0x1b35fbA9357fD9bda7ed0429C8BbAbe1e8CC88fc"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0xA51894664A773981C6C112C43ce576f315d5b1B6',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x07d83526730c7438048D55A4fc0b850e2aaB6f0b',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x2DEF195713CF4a606B49D07E520e22C17899a736',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class SeiAddresses extends ChainAddresses {
    readonly permit2: string = "0xB952578f3520EE8Ea45b7914994dcf4702cEe578"

    readonly allTokens: tokenInfo[] = [

    ]

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class GnosisAddresses extends ChainAddresses {
    readonly permit2: string = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
            feed: '0xa767f745331D267c7751297D982b050c93985627',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x2a22f9c3b484c3629090FeED35F17Ff8F88f76F0',
            feed: '0x26C31ac71010aF62E6B486D1132E266D6298857D',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0x6C76971f98945AE98dD7d4DFcA8711ebea946eA6',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x4ECaBa5870353805a9F068101A40E0f32ed605C6',
            feed: '0x68811D7DF835B1c33e6EEae8E7C141eF48d48cc7',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };;
}
export class BobAddresses extends ChainAddresses {
    readonly permit2: string = ""//no permit 2

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x4200000000000000000000000000000000000006',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0xe75D0fB2C24A55cA1e3F96781a2bCC7bdba058F0',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '0x85008aE6198BC91aC0735CB5497CF125ddAAc528',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x05D032ac25d322df992303dCa074EE7392C117b9',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class XLayerAddresses extends ChainAddresses {
    readonly permit2: string = ""//no permit 2

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x5a77f1443d16ee5761d310e38b62f77f726bc71c',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0x74b7f16337b8972027f6196a17a631ac6de26d22',
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '0x1e4a5963abfd975d8c9021ce480b42188849d41d',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}
export class Metall2Addresses extends ChainAddresses {
    readonly permit2: string = ""//no permit 2

    readonly allTokens: tokenInfo[] = [
        {
            symbol: 'WETH',
            token: '0x4200000000000000000000000000000000000006',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC',
            token: '0xb91CFCcA485C6E40E3bC622f9BFA02a8ACdEeBab', // native USDC
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDC.e',
            token: '0x51E85d70944256710cb141847F1a04f568C1Db0e', // bridged USDC
            feed: '',
            relay: '',
        },
        {
            symbol: 'WSTETH',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'USDT',
            token: '',
            feed: '',
            relay: '',
        },
        {
            symbol: 'METAL',
            token: '0xBCFc435d8F276585f6431Fc1b9EE9A850B5C00A9',
            feed: '',
            relay: '',
        },
    ];

    readonly coreDeployments = {
        master: "",
        bracket: "",
        stopLimit: "",
        oracleLess: "",
    };
}

// Function to retrieve the addresses by chain ID
export function getAddressesByChainId(chainId: number) {
    const addresses = chainIdToAddresses[chainId];
    if (!addresses) {
        throw new Error(`Addresses not available for chain ID ${chainId}`);
    }
    return addresses;
}

export function getFeeByChainId(chainId: number) {
    const fee = chainIdFeeAmount[chainId]
    if (!fee) {
        throw new Error(`Fee not available for chain ID ${chainId}`);
    }
    return fee
}

//targeting a ~$0.5 fee in the native gas token
const chainIdFeeAmount: Record<number, bigint> = {
    1: ethers.parseEther("0.0001"),
    42161: ethers.parseEther("0.0001"),
    137: ethers.parseEther("1"),//MATIC
    10: ethers.parseEther("0.0001"),
    8453: ethers.parseEther("0.0001"),
    56: ethers.parseEther("0.0007"),//BNB
    324: ethers.parseEther("0.0001"),
    534353: ethers.parseEther("0.0001"),
    314: ethers.parseEther("0.08"), //FIL
    1284: ethers.parseEther("1.75"), //GLMR
    1101: ethers.parseEther("0.0001"),
    81457: ethers.parseEther("0.0001"),
    30: ethers.parseUnits("0.00000475", 8), //RBTC
    169: ethers.parseEther("0.5"), //MANTA
    288: ethers.parseEther("2"), //BOBA
    59144: ethers.parseEther("0.0001"),
    167000: ethers.parseEther("0.0001"),
    15000: ethers.parseUnits("1", 8), //SEI
    100: ethers.parseEther("0.5"), //xDAI
    1294: ethers.parseEther("0.0001"),
    2025: ethers.parseEther("0.01"), //OKB
    1750: ethers.parseUnits("0.4", 8) //MTL
};

const chainIdToAddresses: Record<number, any> = {
    1: new MainnetAddresses(),
    42161: new ArbAddresses(),
    137: new PolygonAddresses(),//MATIC
    10: new OptimisimAddresses(),
    8453: new BaseAddresses(),
    56: new BscAddresses(),//BNB
    324: new ZkSyncAddresses(),
    534353: new ScrollAddresses(),
    314: new FilecoinAddresses(), //FIL
    1284: new MoonbeamAddresses(), //GLMR
    1101: new PolygonZkEvmAddresses(),
    81457: new BlastAddresses(),
    30: new RootstockAddresses(), //RBTC
    169: new MantaPacificAddresses(), //MANTA
    288: new BobaAddresses(), //BOBA
    59144: new LineaAddresses(),
    167000: new TaikoAddresses(),
    15000: new SeiAddresses(), //SEI
    100: new GnosisAddresses(), //xDAI
    1294: new BobAddresses(),
    2025: new XLayerAddresses(), //OKB
    1750: new Metall2Addresses() //MTL
};
