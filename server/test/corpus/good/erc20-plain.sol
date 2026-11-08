pragma solidity ^0.8.0;
contract Token {
  string public name = "T"; mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance; uint public totalSupply;
  constructor(uint s){ totalSupply = s; balanceOf[msg.sender] = s; }
  function transfer(address to, uint v) external returns (bool) { balanceOf[msg.sender]-=v; balanceOf[to]+=v; return true; }
  function approve(address s, uint v) external returns (bool) { allowance[msg.sender][s]=v; return true; }
  function transferFrom(address f, address t, uint v) external returns (bool) { allowance[f][msg.sender]-=v; balanceOf[f]-=v; balanceOf[t]+=v; return true; }
}
