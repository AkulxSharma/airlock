pragma solidity ^0.8.0;
contract Token {
  address owner; mapping(address=>uint) bal; uint total;
  modifier onlyOwner() { require(msg.sender == owner); _; }
  function mint(address to, uint v) external onlyOwner { bal[to]+=v; total+=v; }
}
