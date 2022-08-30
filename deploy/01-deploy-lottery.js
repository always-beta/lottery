const { network, ethers } = require("hardhat")

module.exports = async ({ deployments }) => {
    const { deploy } = deployments
    const accounts = await ethers.getSigners()
    const deployer = accounts[0]
    const networkConfig = network.config
    coordinatorAddr = networkConfig.coordinator
    if (!coordinatorAddr || networkConfig.needMock) {
        const coordinator = await ethers.getContract("VRFCoordinatorV2Mock")
        coordinatorAddr = coordinator.address
    }
    const arguments = [coordinatorAddr]
    await deploy("Lottery", {
        from: deployer.address,
        args: arguments,
        log: true,
    })
}
module.exports.tags = ["all", "lottery"]
