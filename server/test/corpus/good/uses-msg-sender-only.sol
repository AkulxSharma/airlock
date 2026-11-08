pragma solidity ^0.8.0;
contract Wallet {
  address owner = msg.sender;
  receive() external payable {}
  function send(address payable to, uint a) external { require(msg.sender == owner); to.transfer(a); }
}
