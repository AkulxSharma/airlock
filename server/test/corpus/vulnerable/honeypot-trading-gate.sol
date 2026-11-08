pragma solidity ^0.8.0;
contract Token {
  address owner; bool public tradingEnabled; mapping(address=>uint) bal;
  function enableTrading(bool on) external { require(msg.sender == owner); tradingEnabled = on; }
  function transfer(address to, uint v) external returns (bool) { require(tradingEnabled || msg.sender == owner, "trading closed"); bal[msg.sender]-=v; bal[to]+=v; return true; }
}
