// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Denial of service: pays every backer in one loop, so a single backer that rejects ether (or a long list) blocks everyone's refund.
contract DosRefund {
    address[] public backers;
    mapping(address => uint256) public pledged;

    function pledge() external payable {
        if (pledged[msg.sender] == 0) backers.push(msg.sender);
        pledged[msg.sender] += msg.value;
    }

    function refundAll() external {
        for (uint256 i = 0; i < backers.length; i++) {
            payable(backers[i]).transfer(pledged[backers[i]]);
        }
    }
}
