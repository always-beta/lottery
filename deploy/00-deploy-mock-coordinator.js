const { network } = require("hardhat")

const BASE_FEE = "250000000000000000"
const GAS_PRICE_LINK = 1e9

module.exports = async ({ deployments }) => {
    const networkConfig = network.config
    if (!networkConfig.needMock) {
        return
    }
    const { deploy } = deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0]
    const mock = await deploy("VRFCoordinatorV2Mock", {
        from: deployer.address,
        args: [BASE_FEE, GAS_PRICE_LINK],
        log: true,
    })
}
module.exports.tags = ["all", "mocks"]
