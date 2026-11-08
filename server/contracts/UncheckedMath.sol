// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Unchecked arithmetic: the balance update is inside unchecked{}, so a large withdraw wraps the balance around to a huge number instead of reverting.
contract UncheckedMath {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        unchecked {
            balances[msg.sender] -= amount;
        }
        payable(msg.sender).transfer(amount);
    }
}
