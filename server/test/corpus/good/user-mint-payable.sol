pragma solidity ^0.8.0;
contract Sale {
  mapping(address=>uint) public bal; uint public price = 1 ether;
  function mint(uint n) external payable { require(msg.value == n * price); bal[msg.sender] += n; }
}
