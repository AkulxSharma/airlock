// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Signature replay: a signed withdrawal is checked with ecrecover but never marked used, so the same signature can be replayed until the vault is empty.
contract SignatureReplay {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    address public signer = msg.sender;

    function deposit() external payable {}

    function withdrawWithSig(address payable to, uint256 amount, uint8 v, bytes32 r, bytes32 s) external {
        bytes32 digest = keccak256(abi.encodePacked(to, amount));
        require(ecrecover(digest, v, r, s) == signer, "bad signature");
        to.transfer(amount);
    }
}
