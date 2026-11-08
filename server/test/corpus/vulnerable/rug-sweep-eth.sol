pragma solidity ^0.8.0;
contract Vault {
  address public owner;
  mapping(address=>uint) public balances;
  constructor(){ owner = msg.sender; }
  function deposit() external payable { balances[msg.sender] += msg.value; }
  function withdraw(uint a) external { balances[msg.sender] -= a; payable(msg.sender).transfer(a); }
  function rescue() external { require(msg.sender == owner); payable(owner).transfer(address(this).balance); }
}
