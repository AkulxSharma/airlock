// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Access control: initialize() has no guard, so anyone can call it and become the owner.
contract UnprotectedInit {
    address public owner;
    mapping(address => uint256) public balances;

    function initialize(address newOwner) external {
        owner = newOwner;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }
}
