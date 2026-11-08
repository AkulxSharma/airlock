// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Dangerous delegatecall: runs code at an address chosen by the caller, in this contract's storage and with its funds.
contract DelegateToUser {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    address public owner = msg.sender;

    function execute(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.delegatecall(data);
        require(ok, "call failed");
        return ret;
    }
}
