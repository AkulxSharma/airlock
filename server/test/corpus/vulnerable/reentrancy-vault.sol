pragma solidity ^0.8.0;
contract Bank {
  mapping(address=>uint) public bal;
  function deposit() external payable { bal[msg.sender] += msg.value; }
  function withdraw() external { uint a = bal[msg.sender]; (bool ok,) = msg.sender.call{value: a}(""); require(ok); bal[msg.sender] = 0; }
}
