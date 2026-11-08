pragma solidity ^0.8.0;
contract Escrow {
  mapping(address=>uint) public owed;
  function credit(address to) external payable { owed[to] += msg.value; }
  function claim() external { uint a = owed[msg.sender]; owed[msg.sender] = 0; payable(msg.sender).transfer(a); }
}
