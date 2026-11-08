// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Unchecked arithmetic: the balance update is inside unchecked{}, so a large withdraw wraps the balance around to a huge number instead of reverting.
contract UncheckedMath {
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
