pragma solidity ^0.8.0;
contract Wallet {
  address owner = msg.sender;
  function send(address payable to, uint a) external { require(tx.origin == owner); to.transfer(a); }
}
