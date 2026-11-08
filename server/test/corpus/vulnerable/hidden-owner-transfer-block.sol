pragma solidity ^0.8.0;
contract Token {
  address owner; mapping(address=>bool) bots; mapping(address=>uint) bal;
  function setBots(address a, bool b) external { require(msg.sender == owner); bots[a] = b; }
  function transfer(address to, uint v) external returns (bool) { require(!bots[msg.sender]); bal[msg.sender]-=v; bal[to]+=v; return true; }
}
