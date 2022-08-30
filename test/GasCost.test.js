const { ethers } = require("hardhat")
const { expect } = require("chai")
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs")
const helpers = require("@nomicfoundation/hardhat-network-helpers")

describe("Test gas cost", () => {
    const BANKER_FEE = ethers.utils.parseEther("0.003")
    const LUCKY_NUMBERS = [1, 2, 3, 4, 5]
    const BET_AMOUNT = ethers.utils.parseEther("0.01")
    const BET_FEE = ethers.utils.parseEther("0.0005")
    const MIN_PLAYER_COUNT = 5
    const MAX_PLAYER_COUNT = 100000
    const GAME_LAST_SECOND = 60 * 60
    const REQUIRED_BET_VALUE = BET_AMOUNT.add(BET_FEE)

    const MAX_ROUND_COUNT = 5
    const MAX_ACCOUNT_COUNT = 200

    let coordinator, lottery
    let contractOwner, banker, accounts
    let capturedValues = []
    const captureEventValue = (reqId) => {
        capturedValues.push(reqId)
        return true
    }

    it("Deploy Contracts", async () => {
        const Coordinator = await ethers.getContractFactory(
            "VRFCoordinatorV2Mock"
        )
        coordinator = await Coordinator.deploy(100000, 100000)
        await coordinator.deployed()

        accounts = await ethers.getSigners()
        contractOwner = accounts[0]
        banker = accounts[1]
        accounts = accounts.slice(2, MAX_ACCOUNT_COUNT)

        const Lottery = await ethers.getContractFactory(
            "Lottery",
            contractOwner
        )
        lottery = await Lottery.deploy(coordinator.address)
        await lottery.deployed()
        capturedValues = []
        await expect(coordinator.createSubscription())
            .to.emit(coordinator, "SubscriptionCreated")
            .withArgs(captureEventValue, anyValue)
        const subId = capturedValues[0]
        await coordinator.fundSubscription(
            subId,
            ethers.utils.parseEther("100")
        )
        await coordinator.addConsumer(subId, lottery.address)
        await lottery.setVRFSubscriptionId(subId)
        await lottery.setVRFCallbackGasLimit(1000000000)
        await lottery.setBankerFee(BANKER_FEE)
    })
    for (let round = 1; round <= MAX_ROUND_COUNT; round++) {
        const msg = "Loop Round: " + round.toString()
        it(msg, async () => {
            const beforeBankerBalance = await ethers.provider.getBalance(
                banker.address
            )
            const beforeContractBalance = await ethers.provider.getBalance(
                lottery.address
            )
            lottery = lottery.connect(banker)
            capturedValues = []
            await expect(
                lottery.start(
                    LUCKY_NUMBERS,
                    BET_AMOUNT,
                    BET_FEE,
                    MIN_PLAYER_COUNT,
                    MAX_PLAYER_COUNT,
                    GAME_LAST_SECOND,
                    { value: BANKER_FEE }
                )
            )
                .to.emit(lottery, "StatusChanged")
                .withArgs(
                    captureEventValue,
                    captureEventValue,
                    captureEventValue
                )
            const gameId = capturedValues[0].toNumber()
            let betIndex = 0
            for (let i = 0; i < accounts.length; i++) {
                await lottery
                    .connect(accounts[i])
                    .bet(gameId, betIndex, { value: REQUIRED_BET_VALUE })
                betIndex = (betIndex + 1) % LUCKY_NUMBERS.length
            }
            const { endTimestamp } = await lottery.getBasicGameInfo(gameId)
            await helpers.time.increaseTo(endTimestamp + 1)
            capturedValues = []
            await expect(lottery.connect(banker).draw(gameId))
                .to.emit(coordinator, "RandomWordsRequested")
                .withArgs(
                    anyValue,
                    captureEventValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue,
                    anyValue
                )
            await coordinator.fulfillRandomWords(
                capturedValues[0],
                lottery.address
            )
            await expect(lottery.connect(banker).settle(gameId))
                .to.emit(lottery, "NumberWon")
                .withArgs(gameId, captureEventValue, captureEventValue)
            console.log(
                "Game Round:",
                round,
                "Settled, Bet Fee Sum:",
                ethers.utils.formatEther(
                    BET_FEE.mul(accounts.length).toString()
                )
            )
            console.log("\tWining number index:", capturedValues[1])
            console.log(
                "\tWin amount per player:",
                ethers.utils.formatEther(capturedValues[2].toString())
            )
            for (let i = 0; i < accounts.length; i++) {
                const { award, withdrew } = await lottery
                    .connect(accounts[i])
                    .getPlayerGameAward(gameId)
                if (award > 0 && !withdrew) {
                    await lottery.connect(accounts[i]).withdrawGameAward(gameId)
                }
            }
            await lottery.connect(banker).withdrawBalance()
            await lottery.connect(contractOwner).withdrawBalance()
            const afterBankerBalance = await ethers.provider.getBalance(
                banker.address
            )
            const afterContractBalance = await ethers.provider.getBalance(
                lottery.address
            )
            console.log(
                "\tBanker Balance change:",
                ethers.utils.formatEther(
                    (afterBankerBalance - beforeBankerBalance).toString()
                )
            )
            console.log(
                "\tContract Balance change:",
                ethers.utils.formatEther(
                    (afterContractBalance - beforeContractBalance).toString()
                )
            )
        })
    }
})
