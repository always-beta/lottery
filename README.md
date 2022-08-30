# Solidity Learning Project

This project implements a Lottery game which enables users either start lottery (gambling) games as a banker or join games as a player and earn ethers by luck.

Goerli Testnet: [Lottery](https://goerli.etherscan.io/address/0x24326c8d6ea12bd09620c6b069addc135c383cda)

---

## Goals

It's a blockchain/ethereum learning project aims at covering at least following aspects:

1. Solidity
    > - Programming language itself
    > - Data types and their storage layout
    > - Security considerations
    > - Coding style guide
2. Hardhat Framework
    > - Project settings
    > - Writing tests
    > - Contract deployment
    > - Gas optimization with Gas-Reporter
    > - Code coverage
3. Chainlink Service

    > - VRF Service
    > - Subscription Manager

4. Ethereum mainnet/testnet, EtherScan, Alchemy, etc
5. Remix IDE & Metamask

---

## Game play explanation

### 1. Game Play

1. Contract owner sets the banker fee
2. Any players can start a game as a banker by paying the banker fee
3. A game has settings of 1) a few numbers as wagers, 2) bet amount, 3) bet fee (ante fee)
4. Any players can bet against any numbers by paying bet amount + bet fee for each bet
5. The banker draws the game, decides the winning number by retrieving a random number from Chainlink VRF service
6. The winners get the award, banker gets all the bet fee, contract owner gets the banker fee

### 2. Winner Award Algorithm

Say there is:

1. A banker: X, three players: A, B, C
2. A game with wager numbers of **[1,2,3]**, bet amount: **0.1 ether**, bet fee: **0.001 ether**

Now starts the game:

1. Player A bets number 1 twice
2. Player B bets number 2 once
3. Player C bets number 2 twice, and number 3 once
4. There are total of 6 bet, so **TOTAL BET FEE: bet fee \* 6 = 0.006 ether**, **TOTAL BET AMOUNT: bet amount \* 6 = 0.6 ether**
5. Winning number turns to be 2, player B and C contributes 3 bets in total on number 2, every bet win **0.6 ether / 3 = 0.2 ether**
6. Player A loses all his bet
7. Player B gets award of **0.2 ether \* 1 = 0.2 ether**
8. Player C gets award of **0.2 ether \* 2 = 0.4 ether**
9. The banker gets all of the **TOTAL BET FEE: 0.006 ether**
