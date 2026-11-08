// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Unchecked call: the return value of send() is ignored, so a failed payout still marks the user as paid.
contract UncheckedSend {
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
