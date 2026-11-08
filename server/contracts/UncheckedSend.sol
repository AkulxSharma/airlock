// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Unchecked call: the return value of send() is ignored, so a failed payout still marks the user as paid.
contract UncheckedSend {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    mapping(address => uint256) public owed;
    mapping(address => bool) public paid;

    function credit(address to) external payable {
        owed[to] += msg.value;
    }

    function claim() external {
        paid[msg.sender] = true;
        payable(msg.sender).send(owed[msg.sender]);
        owed[msg.sender] = 0;
    }
}
