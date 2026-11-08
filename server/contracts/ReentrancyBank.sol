// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Reentrancy: sends ether BEFORE zeroing the balance, so a contract can re-enter withdraw() and drain the bank.
contract ReentrancyBank {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        balances[msg.sender] = 0;
    }
}
