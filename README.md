# Solidity Learning Project

This project implements a Lottery game where users can participate either as a banker starting new games or as a player joining existing games, with the chance to earn ether.

Goerli Testnet: [Lottery](https://goerli.etherscan.io/address/0x24326c8d6ea12bd09620c6b069addc135c383cda)

## Table of Contents

* [Goals](#goals)
* [Game play explanation](#game-play-explanation)
* [Getting Started](#getting-started)
* [Contributing](#contributing)
* [License](#license)

---

## Goals

This blockchain/ethereum learning project aims to cover at least the following aspects:

1. Solidity
    * Programming language itself
    * Data types and their storage layout
    * Security considerations
    * Coding style guide
2. Hardhat Framework
    * Project settings
    * Writing tests
    * Contract deployment
    * Gas optimization with Gas-Reporter
    * Code coverage
3. Chainlink Service
    * VRF Service
    * Subscription Manager
4. Ethereum mainnet/testnet, EtherScan, Alchemy, etc
5. Remix IDE & Metamask

---

## Game play explanation

### 1. Game Play

1. The contract owner sets the banker fee.
2. Players can start a game as a banker by paying the banker fee.
3. Game settings include: 1) wager numbers (a selection of numbers to bet on), 2) the bet amount, and 3) the bet fee (ante).
4. Players can bet on chosen numbers by paying the bet amount plus the bet fee for each bet.
5. The banker initiates the draw, determining the winning number by retrieving a random number from the Chainlink VRF service.
6. Winners receive their awards, the banker collects all bet fees, and the contract owner receives the banker fee.

### 2. Winner Award Algorithm

Consider a scenario with:

1. A banker: X, three players: A, B, C
2. A game with wager numbers of **[1,2,3]**, bet amount: **0.1 ether**, and bet fee: **0.001 ether**.

The game proceeds as follows:

1. Player A bets number 1 twice
2. Player B bets number 2 once
3. Player C bets number 2 twice, and number 3 once
4. With a total of 6 bets, the **TOTAL BET FEE is: bet fee \* 6 = 0.006 ether**, and the **TOTAL BET AMOUNT is: bet amount \* 6 = 0.6 ether**.
5. If the winning number is 2, and players B and C contributed a total of 3 bets on number 2, each winning bet receives **0.6 ether / 3 = 0.2 ether**.
6. Player A loses their bets.
7. Player B receives an award of **0.2 ether \* 1 = 0.2 ether**.
8. Player C receives an award of **0.2 ether \* 2 = 0.4 ether**.
9. The banker receives the **TOTAL BET FEE: 0.006 ether**.

---

## Getting Started

To get this project up and running on your local machine, follow these steps:

1.  **Clone the repository:**
    First, clone this repository to your local machine. You can typically find the clone URL on the main page of the repository on your Git hosting platform (e.g., GitHub).
    ```bash
    git clone <URL_OF_THIS_REPOSITORY>
    cd <LOCAL_REPOSITORY_DIRECTORY_NAME>
    ```
    (Navigate into the cloned directory before proceeding.)

2.  **Install dependencies:**
    This project uses Yarn for package management.
    ```bash
    yarn install
    ```

3.  **Compile the contracts:**
    ```bash
    yarn hardhat compile
    ```
    This will compile your Solidity contracts and generate TypeChain typings.

4.  **Run tests:**
    ```bash
    yarn hardhat test
    ```
    This will execute the automated tests located in the `test/` directory.

5.  **Deploy the contracts:**

    *   **Local Hardhat Network:**
        To deploy the contracts to the local Hardhat network (for development and testing):
        ```bash
        yarn hardhat deploy
        ```
        This network is transient and exists only for the duration of the command or a local node session.

    *   **Testnets (e.g., Goerli):**
        To deploy to a testnet like Goerli, you need to configure your environment variables first. Create a `.env` file in the project root and add the following:
        ```
        GOERLI_RPC_URL="your_alchemy_or_infura_goerli_rpc_url"
        PRIVATE_KEY="your_goerli_account_private_key"
        ETHERSCAN_API_KEY="your_etherscan_api_key" # Optional, for contract verification
        ```
        Replace the placeholder values with your actual credentials.
        Then, run the deployment command:
        ```bash
        yarn hardhat deploy --network goerli
        ```

    The deployment scripts are located in the `deploy/` directory. The `hardhat deploy` command will execute them in order.

---

## Contributing

Contributions are welcome and greatly appreciated! If you have suggestions for improving the project, please feel free to fork the repository and submit a pull request.

To contribute:

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** to your local machine:
    Replace `<URL_OF_YOUR_FORK>` with the actual URL of your forked repository.
    ```bash
    git clone <URL_OF_YOUR_FORK>
    cd <LOCAL_REPOSITORY_DIRECTORY_NAME>
    ```
    (Navigate into the cloned directory before proceeding.)
3.  **Create a new branch** for your changes:
    ```bash
    git checkout -b feature/your-feature-name
    ```
    Or for bug fixes:
    ```bash
    git checkout -b fix/issue-number-or-description
    ```
4.  **Make your changes** and commit them with clear, descriptive messages.
5.  **Ensure all tests pass** before submitting your changes:
    ```bash
    yarn hardhat test
    ```
6.  **Push your changes** to your fork on GitHub:
    ```bash
    git push origin feature/your-feature-name
    ```
7.  **Submit a pull request** from your fork to the original repository's `main` branch (or the appropriate target branch).

Please provide a clear description of the changes in your pull request. If your PR addresses an existing issue, please link to it.

---

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.
