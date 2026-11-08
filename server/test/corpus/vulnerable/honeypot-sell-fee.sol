pragma solidity ^0.8.0;
contract Token {
  address owner; uint public sellFee = 1;
  function setSellFee(uint f) external { require(msg.sender == owner); sellFee = f; }
}
