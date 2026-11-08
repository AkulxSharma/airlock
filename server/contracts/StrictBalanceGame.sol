// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Forced ether: the game requires the balance to be exactly 1 ether, so anyone can lock it forever by sending a little ether through selfdestruct.
contract StrictBalanceGame {
    // Accepts a plain ETH transfer, so the only thing that can stop money reaching this demo contract is Airlock's own gate.
    receive() external payable {}

    address public winner;

    function play() external payable {
        require(msg.value == 0.1 ether, "bet");
        require(address(this).balance <= 1 ether, "over");
        if (address(this).balance == 1 ether) {
            winner = msg.sender;
            payable(msg.sender).transfer(address(this).balance);
        }
    }
}
