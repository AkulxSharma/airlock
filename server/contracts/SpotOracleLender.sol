// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Oracle manipulation: collateral is priced from this pool's own live reserves, which a flash loan can move in one transaction.
contract SpotOracleLender {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    uint256 public reserveEth;
    uint256 public reserveToken;
    mapping(address => uint256) public collateralToken;

    function price() public view returns (uint256) {
        return (reserveEth * 1e18) / reserveToken;
    }

    function addLiquidity(uint256 tokens) external payable {
        reserveEth += msg.value;
        reserveToken += tokens;
    }

    function borrow(uint256 tokens) external {
        collateralToken[msg.sender] += tokens;
        uint256 loan = (tokens * price()) / 1e18;
        payable(msg.sender).transfer(loan);
    }
}
