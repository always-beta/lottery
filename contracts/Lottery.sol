// SPDX-License-Identifier: None
pragma solidity ^0.8.15;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

/// @author Johnny Li
/// @custom:email lijinglong68@gmail.com
contract Lottery is VRFConsumerBaseV2 {
    /// @param players players list
    /// @param playersMap key: user address, value: bet count
    struct BetInfo {
        address[] players;
        mapping(address => uint256) playersMap;
    }

    /// @notice Contains all information of one game
    /// @param banker banker that starts this game
    /// @param betInfoMap number index to bettors info map
    /// @param winnerAward how much do each winner earns
    /// @param withdrawMap if players already withdrew their awards
    struct GameInfo {
        uint8[] luckyNumbers;
        uint128 betAmount;
        uint128 betFee;
        Status status;
        uint32 minPlayerCount;
        uint32 maxPlayerCount;
        uint32 endTimestamp;
        uint32 totalBetCount;
        uint8 winningNumberIndex;
        address banker;
        uint256 winnerAward;
        mapping(uint8 => BetInfo) betInfoMap;
        mapping(address => bool) withdrawMap;
    }

    /// @dev ChainLink VRF service related params
    struct VRFParams {
        bytes32 keyHash;
        VRFCoordinatorV2Interface vrfCoordinator;
        uint64 subscriptionId;
        uint32 callbackGasLimit;
        uint16 requestConfirmations;
    }

    /// @notice Reprensents the game status
    /// @param Init Initial state
    /// @param Open Game is ongoing, players can bet
    /// @param Drawing Time up, no more bet, choosing the winning number
    /// @param Settling Winning number is selected, settling all the remaing work
    /// @param Closed Game ended
    enum Status {
        Init,
        Open,
        Drawing,
        Settling,
        Closed
    }

    error IncorrectAmount();
    error IncorrectStatus(Status expected);
    error IncorrectTiming();
    error InvalidIndex();
    error AlreadyWithdrew();
    error NotAuthorized();
    error ReachPlayerLimit();

    /// @notice Emit when a number is bet by a player
    /// @return gameId game id
    /// @return numberIndex the index of the bet number
    /// @return totalBetCount total bet count of this number
    event NumberBet(
        uint64 indexed gameId,
        uint8 numberIndex,
        uint256 totalBetCount
    );
    /// @notice Emit when status is changed by any reason
    /// @return gameId game id
    /// @return from status before the change
    /// @return to status after the change
    event StatusChanged(uint64 indexed gameId, Status from, Status to);
    /// @notice Emit when the game finished, and the winning number selected
    /// @return gameId game id
    /// @return numberIndex the winning number's index, if it's not in range, means no winning number
    /// @return winnerAward the award amount every winner can get
    event NumberWon(
        uint64 indexed gameId,
        uint8 numberIndex,
        uint256 winnerAward
    );

    /// @notice Every player should pay this fee to start a new game as game banker
    uint256 public bankerFee = type(uint256).max;
    mapping(address => uint256) playerBalance;
    /// @notice game id to game info map
    mapping(uint64 => GameInfo) gameInfoMap;
    /// @notice sent VRF request id to game id map;
    mapping(uint256 => uint64) vrfRequestGameIdMap;
    /// @notice banker address to game id array that started by this banker
    mapping(address => uint64[]) bankerGameIdMap;
    VRFParams vrfParams;
    address contractOwner;
    uint64 public gameIdCounter;

    constructor(address coordinatorAddr) VRFConsumerBaseV2(coordinatorAddr) {
        contractOwner = msg.sender;
        vrfParams.vrfCoordinator = VRFCoordinatorV2Interface(coordinatorAddr);
    }

    /// @notice Players can send ether to deposit as their balance
    receive() external payable {
        playerBalance[msg.sender] += msg.value;
    }

    // @notice Transfer contract's ownership, and the balance as well
    function setContractOwner(address newOwner) external {
        onlyAllowOwner();
        require(newOwner != address(0));
        uint256 balance = playerBalance[contractOwner];
        playerBalance[contractOwner] = 0;
        contractOwner = newOwner;
        playerBalance[contractOwner] = balance;
    }

    function setBankerFee(uint256 fee) external {
        onlyAllowOwner();
        bankerFee = fee;
    }

    function setVRFSubscriptionId(uint64 subscriptionId) external {
        onlyAllowOwner();
        vrfParams.subscriptionId = subscriptionId;
    }

    function setVRFKeyHash(bytes32 keyHash) external {
        onlyAllowOwner();
        vrfParams.keyHash = keyHash;
    }

    function setVRFCallbackGasLimit(uint32 callbackGasLimit) external {
        onlyAllowOwner();
        vrfParams.callbackGasLimit = callbackGasLimit;
    }

    function setVRFRequestConfirmations(uint16 requestConfirmations) external {
        onlyAllowOwner();
        vrfParams.requestConfirmations = requestConfirmations;
    }

    /// @notice Start a new game
    /// @param luckyNumbers The numbers players can bet on
    /// @param betAmount The amount every bet need to put on the table
    /// @param betFee The extra amount to pay for the game for every single bet
    /// @param minPlayerCount (Inclusive) The minimun player count to draw the game at the end
    /// @param maxPlayerCount (Inclusive) The maximum player count that can bet
    /// @param lastSeconds How long the game lasts
    function start(
        uint8[] memory luckyNumbers,
        uint128 betAmount,
        uint128 betFee,
        uint32 minPlayerCount,
        uint32 maxPlayerCount,
        uint32 lastSeconds
    ) external payable {
        if (msg.value < bankerFee) {
            revert IncorrectAmount();
        }
        unchecked {
            require(lastSeconds < 3600 * 24 * 7);
            require(luckyNumbers.length > 0 && luckyNumbers.length < 1000);
            gameIdCounter += 1;
            uint64 gameId = gameIdCounter;
            GameInfo storage gameInfo = gameInfoMap[gameId];
            gameInfo.banker = msg.sender;
            gameInfo.luckyNumbers = luckyNumbers;
            gameInfo.status = Status.Open;
            gameInfo.betAmount = betAmount;
            gameInfo.betFee = betFee;
            gameInfo.minPlayerCount = minPlayerCount;
            gameInfo.maxPlayerCount = maxPlayerCount;
            gameInfo.endTimestamp = uint32(block.timestamp + lastSeconds);
            emit StatusChanged(gameId, Status.Init, Status.Open);
            bankerGameIdMap[msg.sender].push(gameId);
            playerBalance[contractOwner] += msg.value;
        }
    }

    /// @notice Bet a specific number by the number index
    ///         with either ether or balance (or use both, compensate with balance if ether is insufficient).
    ///         A player can bet one number multiple times.
    /// @param gameId game id
    /// @param luckyNumberIndex the index of the number
    function bet(uint64 gameId, uint8 luckyNumberIndex) external payable {
        GameInfo storage gameInfo = gameInfoMap[gameId];
        if (gameInfo.status != Status.Open) {
            revert IncorrectStatus(Status.Open);
        }
        if (block.timestamp > gameInfo.endTimestamp) {
            revert IncorrectTiming();
        }

        if (gameInfo.totalBetCount >= gameInfo.maxPlayerCount) {
            revert ReachPlayerLimit();
        }
        if (luckyNumberIndex >= gameInfo.luckyNumbers.length) {
            revert InvalidIndex();
        }

        uint256 required = gameInfo.betAmount + gameInfo.betFee;
        if (msg.value > required) {
            revert IncorrectAmount();
        }

        uint256 balance = playerBalance[msg.sender];
        if (msg.value + balance < required) {
            revert IncorrectAmount();
        }

        if (required > msg.value) {
            uint256 requiredBalance = required - msg.value;
            playerBalance[msg.sender] -= requiredBalance;
        }
        unchecked {
            gameInfo.totalBetCount += 1;
            BetInfo storage betInfo = gameInfo.betInfoMap[luckyNumberIndex];
            betInfo.players.push(msg.sender);
            betInfo.playersMap[msg.sender] += 1;
            emit NumberBet(gameId, luckyNumberIndex, betInfo.players.length);
        }
    }

    /// @notice Draw the game
    ///         The game can draw properly only if there are enough participants and
    ///         every number has at least one bet.
    function draw(uint64 gameId) external {
        GameInfo storage gameInfo = gameInfoMap[gameId];
        if (gameInfo.status != Status.Open) {
            revert IncorrectStatus(Status.Open);
        }
        if (block.timestamp < gameInfo.endTimestamp) {
            revert IncorrectTiming();
        }
        if (gameInfo.banker != msg.sender) {
            revert NotAuthorized();
        }

        gameInfo.status = Status.Drawing;
        emit StatusChanged(gameId, Status.Open, Status.Drawing);

        uint256 numbersLength = gameInfo.luckyNumbers.length;
        uint32 totalBetCount = gameInfo.totalBetCount;
        bool canDraw = totalBetCount >= gameInfo.minPlayerCount;
        mapping(uint8 => BetInfo) storage betInfoMap = gameInfo.betInfoMap;
        if (canDraw) {
            unchecked {
                for (uint8 i = 0; i < numbersLength; i++) {
                    if (betInfoMap[i].players.length == 0) {
                        canDraw = false;
                        break;
                    }
                }
            }
        }
        if (canDraw) {
            requestVRF(gameId);
        } else {
            gameInfo.winningNumberIndex = uint8(numbersLength);
            gameInfo.status = Status.Settling;
            emit StatusChanged(gameId, Status.Drawing, Status.Settling);
            doSettle(gameId, gameInfo);
        }
    }

    /// @notice After winning number is selected, banker call this function to finish all remaining work
    function settle(uint64 gameId) external {
        GameInfo storage gameInfo = gameInfoMap[gameId];
        if (gameInfo.banker != msg.sender) {
            revert NotAuthorized();
        }
        doSettle(gameId, gameInfo);
    }

    /// @notice In case of can't receive randomWords from VRF service,
    ///         contractOwner should call it manually after fix all VRF related issues
    ///         so that can request random words again.
    function reDraw(uint64 gameId) external {
        if (msg.sender != contractOwner) {
            revert NotAuthorized();
        }
        if (gameInfoMap[gameId].status != Status.Drawing) {
            revert IncorrectStatus(Status.Drawing);
        }
        requestVRF(gameId);
    }

    /// @notice withdraw player's balance (usually for game bankers or contract owner)
    function withdrawBalance() external {
        uint256 balance = playerBalance[msg.sender];
        require(balance > 0);
        playerBalance[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success);
    }

    /// @notice Winners withdraw their winning award from game play
    function withdrawGameAward(uint64 gameId) external {
        GameInfo storage gameInfo = gameInfoMap[gameId];
        if (gameInfo.status != Status.Closed) {
            revert IncorrectStatus(Status.Closed);
        }
        (uint256 award, bool withdrew) = getPlayerGameAward(gameId);
        if (withdrew) {
            revert AlreadyWithdrew();
        }
        if (award > 0) {
            gameInfo.withdrawMap[msg.sender] = true;
            (bool success, ) = payable(msg.sender).call{value: award}("");
            require(success);
        } else {
            revert IncorrectAmount();
        }
    }

    /// @notice Return game ids with certain status in DESC order
    /// @param onlyActive If true, return currently active games only
    /// @param onlyPlayed If true, return games this player bet only
    /// @param maxCount Result will be sorted by game id DESC, capped with maxCount
    function getGames(
        bool onlyActive,
        bool onlyPlayed,
        uint256 maxCount
    ) external view returns (uint64[] memory result) {
        require(maxCount > 0 && maxCount <= 100);
        uint64 maxGameId = gameIdCounter;
        uint64[] memory gameIds = new uint64[](maxCount);
        uint64 currentIndex = 0;

        unchecked {
            for (uint64 i = maxGameId; currentIndex < maxCount && i > 0; i--) {
                GameInfo storage gameInfo = gameInfoMap[i];
                if (onlyActive && (gameInfo.status == Status.Closed)) {
                    continue;
                }
                if (onlyPlayed && !hasPlayed(gameInfo)) {
                    continue;
                }
                gameIds[currentIndex] = i;
                currentIndex += 1;
            }
            if (currentIndex == 0) return result;

            if (currentIndex < maxCount - 1) {
                result = new uint64[](currentIndex);
                for (uint256 i = 0; i < currentIndex; i++) {
                    result[i] = gameIds[i];
                }
                return result;
            } else {
                return gameIds;
            }
        }
    }

    /// @notice Get all basic game info
    function getBasicGameInfo(uint64 gameId)
        external
        view
        returns (
            Status status,
            uint8[] memory luckyNumbers,
            uint32 endTimestamp,
            uint32 minPlayerCount,
            uint32 maxPlayerCount,
            uint128 betAmount,
            uint128 betFee,
            uint8 winningNumberIndex,
            uint256 winnerAward
        )
    {
        GameInfo storage gameInfo = gameInfoMap[gameId];
        status = gameInfo.status;
        luckyNumbers = gameInfo.luckyNumbers;
        endTimestamp = gameInfo.endTimestamp;
        minPlayerCount = gameInfo.minPlayerCount;
        maxPlayerCount = gameInfo.maxPlayerCount;
        betAmount = gameInfo.betAmount;
        betFee = gameInfo.betFee;
        winningNumberIndex = gameInfo.winningNumberIndex;
        winnerAward = gameInfo.winnerAward;
    }

    /// @notice Return player's balance
    function getPlayerBalance() external view returns (uint256) {
        return playerBalance[msg.sender];
    }

    /// @notice Return player's game award
    /// @param gameId The game id
    /// @return award The award won in this game
    /// @return withdrew True if already withdrew
    function getPlayerGameAward(uint64 gameId)
        public
        view
        returns (uint256 award, bool withdrew)
    {
        GameInfo storage gameInfo = gameInfoMap[gameId];
        if (gameInfo.status != Status.Closed) {
            return (0, false);
        }
        withdrew = gameInfo.withdrawMap[msg.sender];
        uint256 luckyNumberLength = gameInfo.luckyNumbers.length;
        uint8 winningNumberIndex = gameInfo.winningNumberIndex;
        uint256 playerBetCount = 0;
        if (winningNumberIndex < luckyNumberLength) {
            playerBetCount = gameInfo.betInfoMap[winningNumberIndex].playersMap[
                    msg.sender
                ];
            unchecked {
                award = playerBetCount * gameInfo.winnerAward;
            }
        } else {
            // No winning players
            unchecked {
                for (uint8 i = 0; i < luckyNumberLength; i++) {
                    playerBetCount += gameInfo.betInfoMap[i].playersMap[
                        msg.sender
                    ];
                }
                award = gameInfo.betAmount * playerBetCount;
            }
        }
    }

    /// @notice Return all game ids a banker has started
    function getBankerGames() external view returns (uint64[] memory) {
        return bankerGameIdMap[msg.sender];
    }

    /// @notice Check if a player already bet the specific number for current game round
    function getPlayerNumberBetCount(uint64 gameId, uint8 luckyNumberIndex)
        external
        view
        returns (uint256)
    {
        return
            gameInfoMap[gameId].betInfoMap[luckyNumberIndex].playersMap[
                msg.sender
            ];
    }

    /// @notice Get total bet player count for a specific number
    function getNumberBetCount(uint64 gameId, uint8 luckyNumberIndex)
        external
        view
        returns (uint256)
    {
        return gameInfoMap[gameId].betInfoMap[luckyNumberIndex].players.length;
    }

    /// @notice Start to request a random number (Chanlink VRF service) to decide the winning number
    function requestVRF(uint64 gameId) internal {
        uint256 requestId = vrfParams.vrfCoordinator.requestRandomWords(
            vrfParams.keyHash,
            vrfParams.subscriptionId,
            vrfParams.requestConfirmations,
            vrfParams.callbackGasLimit,
            1
        );
        vrfRequestGameIdMap[requestId] = gameId;
    }

    // @notice Check if msg.sender has any bet on this game
    function hasPlayed(GameInfo storage gameInfo)
        private
        view
        returns (bool played)
    {
        unchecked {
            uint256 length = gameInfo.luckyNumbers.length;
            for (uint8 i = 0; i < length; i++) {
                if (gameInfo.betInfoMap[i].playersMap[msg.sender] > 0) {
                    return true;
                }
            }
            return false;
        }
    }

    /// @dev Callback function of Chainlink VRF service.
    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords)
        internal
        override
    {
        uint64 gameId = vrfRequestGameIdMap[requestId];
        if (gameId == 0) {
            // Invalid request id, ignore
            return;
        }
        GameInfo storage gameInfo = gameInfoMap[gameId];
        if (gameInfo.status != Status.Drawing) {
            // Already handled, ignore
            return;
        }

        gameInfo.status = Status.Settling;
        emit StatusChanged(gameId, Status.Drawing, Status.Settling);
        gameInfo.winningNumberIndex = uint8(
            randomWords[0] % gameInfo.luckyNumbers.length
        );
        delete vrfRequestGameIdMap[requestId];
    }

    // @dev Final setup after winning number is selected
    function doSettle(uint64 gameId, GameInfo storage gameInfo) private {
        if (gameInfo.status != Status.Settling) {
            revert IncorrectStatus(Status.Settling);
        }
        gameInfo.status = Status.Closed;
        emit StatusChanged(gameId, Status.Settling, Status.Closed);
        uint8 winningNumberIndex = gameInfo.winningNumberIndex;
        uint256 winnerAward;
        if (winningNumberIndex < gameInfo.luckyNumbers.length) {
            unchecked {
                winnerAward =
                    (gameInfo.betAmount * gameInfo.totalBetCount) /
                    gameInfo.betInfoMap[winningNumberIndex].players.length;
            }
        }
        gameInfo.winnerAward = winnerAward;
        emit NumberWon(gameId, winningNumberIndex, winnerAward);
        unchecked {
            playerBalance[gameInfo.banker] +=
                gameInfo.totalBetCount *
                gameInfo.betFee;
        }
    }

    /// @dev Use function instead of modifier in order to reduce contract code size
    function onlyAllowOwner() internal view {
        if (msg.sender != contractOwner) {
            revert NotAuthorized();
        }
    }
}
