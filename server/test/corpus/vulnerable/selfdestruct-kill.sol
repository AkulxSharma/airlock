pragma solidity ^0.8.0;
contract Kill {
  address payable owner;
  function kill() external { require(msg.sender == owner); selfdestruct(owner); }
}
