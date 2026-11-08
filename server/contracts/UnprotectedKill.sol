// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Access control: anyone can call kill() and destroy the contract, sending its funds to themselves.
contract UnprotectedKill {
    function deposit() external payable {}

    function kill() external {
        selfdestruct(payable(msg.sender));
    }
}
