const { ethers } = require("hardhat")
const { expect } = require("chai")
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs")
const helpers = require("@nomicfoundation/hardhat-network-helpers")

const Status = {
    Init: 0,
    Open: 1,
    Drawing: 2,
    Settling: 3,
    Closed: 4,
}
const Error = {
    IncorrectAmount: "IncorrectAmount",
    IncorrectStatus: "IncorrectStatus",
    InvalidIndex: "InvalidIndex",
    NotAuthorized: "NotAuthorized",
    AlreadyBet: "AlreadyBet",
    AlreadyWithdrew: "AlreadyWithdrew",
    IncorrectTiming: "IncorrectTiming",
    ReachPlayerLimit: "ReachPlayerLimit",
}
const Event = {
    NumberBet: "NumberBet",
    StatusChanged: "StatusChanged",
    NumberWon: "NumberWon",
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

describe("Lottery Game Rounds", () => {
    // Note that the testcase should run as a whole test chain,
    // in order to make sure everything works as expected with multiple game rounds.
    // Thus, you should not run specific testcases separately.
    let coordinator, lottery, subscriptionId
    let contractOwner, banker, players
    let gameId

    const LUCKY_NUMBERS = [1, 2, 3]
    const BANKER_FEE = ethers.utils.parseEther("0.01")
    const BET_AMOUNT = ethers.utils.parseEther("0.1")
    const BET_FEE = ethers.utils.parseEther("0.001")
    const GAME_LAST_SECOND = 60 * 60 * 3
    const REQUIRED_BET_VALUE = BET_AMOUNT.add(BET_FEE)
    let minPlayerCount = 5
    let maxPlayerCount = 10

    let capturedValues = []
    const captureEventValue = (reqId) => {
        capturedValues.push(reqId)
        return true
    }
    const increaseTime = async (lottery, gameId) => {
        const { endTimestamp } = await lottery.getBasicGameInfo(gameId)
        await helpers.time.increaseTo("0x" + (endTimestamp + 1).toString(16))
    }

    it("Deploy Mock Coordinator contract", async () => {
        const Coordinator = await ethers.getContractFactory(
            "VRFCoordinatorV2Mock"
        )
        coordinator = await Coordinator.deploy(100000, 100000)
        await coordinator.deployed()
    })

    it("Deploy Lottery contract", async () => {
        accounts = await ethers.getSigners()
        contractOwner = accounts[0]
        banker = accounts[1]
        players = accounts.slice(2, 100)

        const Lottery = await ethers.getContractFactory("Lottery")
        lottery = await Lottery.deploy(coordinator.address)
        await lottery.deployed()

        // Try some transactions with an invalid game id
        gameId = Math.floor(Math.random() * 10000)
        expect((await lottery.getBasicGameInfo(gameId)).status).to.equal(
            Status.Init
        )
        await expect(
            lottery.bet(gameId, 0, { value: REQUIRED_BET_VALUE })
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectStatus)
        await expect(lottery.draw(gameId)).to.be.revertedWithCustomError(
            lottery,
            Error.IncorrectStatus
        )
    })

    it("Set VRF params", async () => {
        capturedValues = []
        await expect(coordinator.createSubscription())
            .to.emit(coordinator, "SubscriptionCreated")
            .withArgs(captureEventValue, anyValue)
        subscriptionId = capturedValues[0]
        await coordinator.addConsumer(subscriptionId, lottery.address)
        await lottery.setVRFSubscriptionId(subscriptionId)
        await lottery.setVRFRequestConfirmations(3)
        await lottery.setVRFKeyHash(ethers.utils.formatBytes32String(""))
        await lottery.setVRFCallbackGasLimit(10000000)
    })

    it("Start a game round", async () => {
        lottery = lottery.connect(banker)
        await expect(lottery.getGames(false, false, 0)).to.be.reverted
        await expect(lottery.getGames(false, false, 1000)).to.be.reverted
        expect(await lottery.getGames(false, false, 10)).to.lengthOf(0)
        expect(await lottery.bankerFee()).to.greaterThan(
            ethers.utils.parseEther((10 ** 18).toString()),
            "Without setting banker fee yet, it should be high enough that no one start game"
        )
        await expect(lottery.setBankerFee(100)).to.be.revertedWithCustomError(
            lottery,
            Error.NotAuthorized
        )
        await lottery.connect(contractOwner).setBankerFee(BANKER_FEE)
        expect(await lottery.bankerFee()).to.equal(BANKER_FEE)

        await expect(
            lottery.start(
                [],
                BET_AMOUNT,
                BET_FEE,
                minPlayerCount,
                maxPlayerCount,
                GAME_LAST_SECOND,
                { value: BANKER_FEE }
            )
        ).to.be.reverted
        await expect(
            lottery.start(
                LUCKY_NUMBERS,
                BET_AMOUNT,
                BET_FEE,
                minPlayerCount,
                maxPlayerCount,
                3600 * 24 * 30,
                { value: BANKER_FEE }
            )
        ).to.be.reverted
        await expect(
            lottery.start(
                LUCKY_NUMBERS,
                BET_AMOUNT,
                BET_FEE,
                minPlayerCount,
                maxPlayerCount,
                GAME_LAST_SECOND,
                { value: BANKER_FEE.sub(1) }
            )
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectAmount)

        capturedValues = []
        await expect(
            lottery.start(
                LUCKY_NUMBERS,
                BET_AMOUNT,
                BET_FEE,
                minPlayerCount,
                maxPlayerCount,
                GAME_LAST_SECOND,
                { value: BANKER_FEE }
            )
        )
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(captureEventValue, Status.Init, Status.Open)
        gameId = capturedValues[0]
        expect(await lottery.getGames(false, false, 10)).deep.to.equal([gameId])
        expect(await lottery.getGames(false, true, 10)).to.lengthOf(0)
        expect(await lottery.getBankerGames()).deep.to.equal([gameId])
        const basicInfo = await lottery.getBasicGameInfo(gameId)
        expect(basicInfo.status).to.equal(Status.Open)
        expect(basicInfo.luckyNumbers).deep.to.equal(LUCKY_NUMBERS)
        expect(basicInfo.betAmount).to.equal(BET_AMOUNT)
        expect(basicInfo.betFee).to.equal(BET_FEE)
        expect(basicInfo.minPlayerCount).to.equal(minPlayerCount)
        expect(basicInfo.maxPlayerCount).to.equal(maxPlayerCount)
        expect(
            await lottery.connect(contractOwner).getPlayerBalance()
        ).to.equal(BANKER_FEE)
        const newContractOwner = players[players.length - 1]
        expect(newContractOwner.address).to.not.equal(
            contractOwner.address,
            "A new contract owner"
        )
        await expect(
            lottery.connect(contractOwner).setContractOwner(ZERO_ADDRESS)
        ).to.be.reverted
        await lottery
            .connect(contractOwner)
            .setContractOwner(newContractOwner.address)
        expect(
            await lottery.connect(contractOwner).getPlayerBalance()
        ).to.equal(0)
        contractOwner = newContractOwner
        expect(
            await lottery.connect(contractOwner).getPlayerBalance()
        ).to.equal(BANKER_FEE)
        await expect(
            lottery.connect(contractOwner).withdrawBalance()
        ).to.changeEtherBalance(contractOwner.address, BANKER_FEE)
    })

    it("Try draw without sufficient players", async () => {
        let player = players[0]
        lottery = lottery.connect(player)
        let numberIndex = LUCKY_NUMBERS.length
        await expect(
            lottery.bet(gameId, numberIndex, { value: REQUIRED_BET_VALUE })
        ).to.be.revertedWithCustomError(lottery, Error.InvalidIndex)

        numberIndex = 0

        await expect(
            lottery.bet(gameId, numberIndex, {
                value: REQUIRED_BET_VALUE.sub(1),
            })
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectAmount)

        await expect(
            lottery.bet(gameId, numberIndex, {
                value: REQUIRED_BET_VALUE.add(1),
            })
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectAmount)

        await expect(
            lottery.bet(gameId, numberIndex, {
                value: REQUIRED_BET_VALUE,
            })
        )
            .to.emit(lottery, Event.NumberBet)
            .to.withArgs(gameId, numberIndex, 1)
        expect((await lottery.getPlayerGameAward(gameId)).award).to.equal(0)
        expect(
            await lottery.getPlayerNumberBetCount(gameId, numberIndex)
        ).to.equal(1)
        await expect(
            lottery.bet(gameId, numberIndex, {
                value: REQUIRED_BET_VALUE,
            })
        )
            .to.emit(lottery, Event.NumberBet)
            .to.withArgs(gameId, numberIndex, 2)
        expect(
            await lottery.getPlayerNumberBetCount(gameId, numberIndex)
        ).to.equal(2)
        numberIndex = 1

        const extraValue = 1000
        const depositValue = REQUIRED_BET_VALUE.sub(extraValue)
        tx = {
            to: lottery.address,
            value: depositValue,
        }
        await player.sendTransaction(tx)
        expect(await lottery.getPlayerBalance()).to.equal(depositValue)

        await expect(
            lottery.bet(gameId, numberIndex, {
                value: REQUIRED_BET_VALUE.add(1),
            })
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectAmount)
        await expect(
            lottery.bet(gameId, numberIndex, {
                value: extraValue - 1,
            })
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectAmount)

        await expect(
            lottery.bet(gameId, numberIndex, {
                value: extraValue,
            })
        )
            .to.emit(lottery, Event.NumberBet)
            .to.withArgs(gameId, numberIndex, 1)
        expect(
            await lottery.getPlayerNumberBetCount(gameId, numberIndex)
        ).to.equal(1)
        expect(await lottery.getPlayerBalance()).to.equal(0)
        await expect(
            lottery.withdrawGameAward(gameId)
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectStatus)
        expect(await lottery.getGames(true, true, 10)).deep.to.equal([gameId])
        await expect(lottery.draw(gameId)).to.revertedWithCustomError(
            lottery,
            Error.IncorrectTiming
        )
        await increaseTime(lottery, gameId)

        await expect(
            lottery.bet(gameId, numberIndex, { value: REQUIRED_BET_VALUE })
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectTiming)

        await expect(lottery.draw(gameId)).to.revertedWithCustomError(
            lottery,
            Error.NotAuthorized
        )
        lottery = lottery.connect(banker)
        capturedValues = []
        await expect(lottery.draw(gameId))
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Open, Status.Drawing)
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Drawing, Status.Settling)
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Settling, Status.Closed)
            .to.emit(lottery, Event.NumberWon)
            .withArgs(gameId, captureEventValue, 0)
        expect(capturedValues[0]).greaterThanOrEqual(LUCKY_NUMBERS.length)
        lottery = lottery.connect(player)
        await expect(lottery.withdrawGameAward(gameId)).to.changeEtherBalance(
            player,
            BET_AMOUNT.mul(3)
        )
        await expect(
            lottery.withdrawGameAward(gameId)
        ).to.be.revertedWithCustomError(lottery, Error.AlreadyWithdrew)

        lottery = lottery.connect(banker)
        expect(await lottery.getPlayerBalance()).equal(BET_FEE.mul(3))
        await expect(lottery.withdrawBalance()).to.changeEtherBalance(
            banker,
            BET_FEE.mul(3)
        )
        await expect(lottery.withdrawBalance()).to.be.reverted
        await expect(
            lottery.withdrawGameAward(gameId)
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectAmount)
    })

    it("Try draw with sufficient players but some numbers are not bet", async () => {
        capturedValues = []
        await expect(
            lottery
                .connect(banker)
                .start(
                    LUCKY_NUMBERS,
                    BET_AMOUNT,
                    BET_FEE,
                    minPlayerCount,
                    maxPlayerCount,
                    GAME_LAST_SECOND,
                    { value: BANKER_FEE }
                )
        )
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(captureEventValue, Status.Init, Status.Open)
        gameId = capturedValues[0]
        expect(await lottery.getGames(true, false, 10)).deep.to.equal([gameId])
        expect(await lottery.getGames(false, false, 10)).to.length.greaterThan(
            1
        )
        expect(await lottery.getGames(false, false, 1)).deep.to.equal([gameId])
        let betIndex = 0
        let notBetIndex = LUCKY_NUMBERS.length - 1
        const getNextBetIndex = () => {
            // Skip index 0 number
            betIndex = (betIndex + 1) % LUCKY_NUMBERS.length
            if (betIndex == notBetIndex) {
                return getNextBetIndex()
            } else {
                return betIndex
            }
        }
        for (let i = 1; i <= maxPlayerCount; i++) {
            await lottery.connect(players[i]).bet(gameId, getNextBetIndex(), {
                value: REQUIRED_BET_VALUE,
            })
        }
        await expect(
            lottery
                .connect(banker)
                .bet(gameId, getNextBetIndex(), { value: REQUIRED_BET_VALUE })
        ).to.be.revertedWithCustomError(lottery, Error.ReachPlayerLimit)
        expect(await lottery.getNumberBetCount(gameId, notBetIndex)).to.equal(0)
        await increaseTime(lottery, gameId)
        capturedValues = []
        await expect(lottery.connect(banker).draw(gameId))
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Open, Status.Drawing)
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Drawing, Status.Settling)
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Settling, Status.Closed)
            .to.emit(lottery, Event.NumberWon)
            .withArgs(gameId, captureEventValue, 0)
        expect(capturedValues[0]).greaterThanOrEqual(LUCKY_NUMBERS.length)
        for (let i = 1; i <= maxPlayerCount; i++) {
            await lottery.connect(players[i]).withdrawGameAward(gameId)
        }
        await lottery.connect(banker).withdrawBalance()
    })

    it("Test normal draw case", async () => {
        capturedValues = []
        await expect(
            lottery
                .connect(banker)
                .start(
                    LUCKY_NUMBERS,
                    BET_AMOUNT,
                    BET_FEE,
                    LUCKY_NUMBERS.length,
                    maxPlayerCount,
                    GAME_LAST_SECOND,
                    { value: BANKER_FEE }
                )
        )
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(captureEventValue, Status.Init, Status.Open)
        gameId = capturedValues[0]
        for (let i = 0; i < LUCKY_NUMBERS.length; i++) {
            await lottery
                .connect(players[i])
                .bet(gameId, i, { value: REQUIRED_BET_VALUE })
        }
        await increaseTime(lottery, gameId)

        await expect(
            lottery.connect(contractOwner).reDraw(gameId)
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectStatus)

        // Set very little gas limit to cause it fail
        await lottery.connect(contractOwner).setVRFCallbackGasLimit(1)
        capturedValues = []
        await expect(lottery.connect(banker).draw(gameId))
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Open, Status.Drawing)
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
        let reqId = capturedValues[0]

        await expect(
            coordinator.fulfillRandomWords(reqId, lottery.address)
        ).to.be.revertedWithCustomError(coordinator, "InsufficientBalance")

        await coordinator.fundSubscription(
            subscriptionId,
            ethers.utils.parseEther("10")
        )
        await expect(coordinator.fulfillRandomWords(reqId, lottery.address))
            .to.emit(coordinator, "RandomWordsFulfilled")
            .withArgs(reqId, reqId, anyValue, false)

        // Now due to insufficient callback gas limit, reqId is consumed with result of failure
        await lottery.connect(contractOwner).setVRFCallbackGasLimit(100000000)
        await expect(
            coordinator.fulfillRandomWords(reqId, lottery.address)
        ).to.be.revertedWith("nonexistent request")

        await expect(lottery.reDraw(gameId)).to.be.revertedWithCustomError(
            lottery,
            Error.NotAuthorized
        )
        capturedValues = []
        await expect(lottery.connect(contractOwner).reDraw(gameId))
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
        reqId = capturedValues[0]

        await expect(
            lottery.connect(contractOwner).settle(gameId)
        ).to.be.revertedWithCustomError(lottery, Error.NotAuthorized)
        await expect(
            lottery.connect(banker).settle(gameId)
        ).to.be.revertedWithCustomError(lottery, Error.IncorrectStatus)

        capturedValues = []
        await expect(coordinator.fulfillRandomWords(reqId, lottery.address))
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Drawing, Status.Settling)

        await expect(
            lottery.connect(contractOwner).settle(gameId)
        ).to.be.revertedWithCustomError(lottery, Error.NotAuthorized)
        await expect(lottery.connect(banker).settle(gameId))
            .to.emit(lottery, Event.StatusChanged)
            .withArgs(gameId, Status.Settling, Status.Closed)
            .to.emit(lottery, Event.NumberWon)
            .withArgs(gameId, captureEventValue, captureEventValue)
        const winningIndex = capturedValues[0]
        const winnerAward = capturedValues[1]
        const winnersCount = 1
        expect(winnerAward).to.equal(
            BET_AMOUNT.mul(LUCKY_NUMBERS.length).div(winnersCount)
        )
        const winner = players[winningIndex]
        await expect(
            lottery.connect(winner).withdrawGameAward(gameId)
        ).to.changeEtherBalance(winner, winnerAward, "winner")
        await expect(
            lottery.connect(banker).withdrawBalance()
        ).to.changeEtherBalance(
            banker,
            BET_FEE.mul(LUCKY_NUMBERS.length),
            "banker"
        )
    })
})
