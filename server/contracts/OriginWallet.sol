// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY (Sepolia, test ETH). A wallet that checks tx.origin, so a malicious contract the owner calls can spend from it.
contract OriginWallet {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    receive() external payable {}

    function sendTo(address payable to, uint256 amount) external {
        require(tx.origin == owner, "not owner");
        to.transfer(amount);
    }
}
