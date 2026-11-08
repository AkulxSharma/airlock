// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Access control: anyone can call kill() and destroy the contract, sending its funds to themselves.
contract UnprotectedKill {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    function deposit() external payable {}

    function kill() external {
        selfdestruct(payable(msg.sender));
    }
}
