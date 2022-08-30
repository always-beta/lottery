require("dotenv").config()
require("@nomicfoundation/hardhat-toolbox")
require("@nomicfoundation/hardhat-chai-matchers")
require("@nomiclabs/hardhat-ethers")
require("@nomiclabs/hardhat-etherscan")
require("hardhat-gas-reporter")
require("hardhat-deploy")
require("hardhat-contract-sizer")

const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || ""
const RINKEBY_RPC_URL = process.env.RINKEBY_RPC_URL || ""
const GOERLI_RPC_URL = process.env.GOERLI_RPC_URL || ""
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x"

const CHAIN_ID_RINKEBY = 4
const CHAIN_ID_GOERLI = 5
const CHAIN_ID_HARDHAT = 31337

module.exports = {
    solidity: {
        version: "0.8.15",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000,
            },
        },
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            name: "hardhat",
            chainId: CHAIN_ID_HARDHAT,
            accounts: {
                count: 1000,
            },
            needMock: true,
        },
        rinkeby: {
            name: "rinkeby",
            url: RINKEBY_RPC_URL,
            chainId: CHAIN_ID_RINKEBY,
            accounts: [PRIVATE_KEY],
            coordinator: "0x6168499c0cFfCaCD319c818142124B7A15E857ab",
            needMock: false,
        },
        goerli: {
            name: "goerli",
            url: GOERLI_RPC_URL,
            chainId: CHAIN_ID_GOERLI,
            accounts: [PRIVATE_KEY],
            coordinator: "0x2Ca8E0C643bDe4C2E08ab1fA0da3401AdAD7734D",
            needMock: false,
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
    gasReporter: {
        enabled: true,
        currency: "CNY",
        gasPrice: 10,
        showTimeSpent: true,
        excludeContracts: ["VRFCoordinatorV2Mock.sol"],
        noColors: false,
        coinmarketcap: COINMARKETCAP_API_KEY,
    },
    contractSizer: {
        runOnCompile: true,
    },
}
