pragma solidity ^0.8.0;
contract Pool {
  address owner;
  modifier auth() { require(msg.sender == owner); _; }
  function exit(address payable to) external auth { to.transfer(address(this).balance); }
}
