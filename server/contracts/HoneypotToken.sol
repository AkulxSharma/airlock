// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY (Sepolia, test tokens). A token that lets you buy but gives the owner the switches to stop you selling.
contract HoneypotToken {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    string public name = "Honey Demo";
    string public symbol = "HNY";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;
    uint256 public sellFee = 1;
    bool public tradingEnabled = true;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public blacklisted;

    constructor() {
        owner = msg.sender;
        totalSupply = 1_000_000 ether;
        balanceOf[msg.sender] = totalSupply;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // The traps: block any address, raise the fee to 100%, or close trading.
    function addToBlacklist(address a) external onlyOwner {
        blacklisted[a] = true;
    }

    function setSellFee(uint256 f) external onlyOwner {
        sellFee = f;
    }

    function enableTrading(bool on) external onlyOwner {
        tradingEnabled = on;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        require(tradingEnabled || msg.sender == owner, "trading closed");
        require(!blacklisted[msg.sender], "blocked");
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }
}
