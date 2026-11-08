// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY (Sepolia, test ETH). A plain vault: you can only ever withdraw your own deposit. No owner, no admin, no switches.
contract CleanVault {
    mapping(address => uint256) public balances;
    bool private locked;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(!locked, "busy");
        locked = true;
        balances[msg.sender] -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        locked = false;
    }
}
