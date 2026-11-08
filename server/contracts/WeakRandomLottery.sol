// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// DEMO ONLY. Weak randomness: the "random" winner comes from block.timestamp, which a validator or a same-block contract can predict.
contract WeakRandomLottery {
    address[] public players;

    function enter() external payable {
        require(msg.value == 0.01 ether, "entry fee");
        players.push(msg.sender);
    }

    function draw() external {
        require(players.length > 0, "empty");
        uint256 winner = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao))) % players.length;
        payable(players[winner]).transfer(address(this).balance);
        delete players;
    }
}
