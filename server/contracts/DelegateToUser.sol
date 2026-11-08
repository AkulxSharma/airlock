// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Dangerous delegatecall: runs code at an address chosen by the caller, in this contract's storage and with its funds.
contract DelegateToUser {
    address public owner = msg.sender;

    function execute(address target, bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.delegatecall(data);
        require(ok, "call failed");
        return ret;
    }
}
