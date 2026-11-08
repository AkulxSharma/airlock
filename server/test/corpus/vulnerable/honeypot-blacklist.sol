pragma solidity ^0.8.0;
contract Token {
  address owner; mapping(address=>bool) blacklisted; mapping(address=>uint) bal;
  function addToBlacklist(address a) external { require(msg.sender == owner); blacklisted[a] = true; }
  function transfer(address to, uint v) external returns (bool) { require(!blacklisted[msg.sender]); bal[msg.sender]-=v; bal[to]+=v; return true; }
}
