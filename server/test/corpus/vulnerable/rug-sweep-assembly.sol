pragma solidity ^0.8.0;
contract Pool {
  address owner;
  modifier onlyOwner() { require(msg.sender == owner); _; }
  function exit(address payable to) external onlyOwner { assembly { let ok := call(gas(), to, selfbalance(), 0, 0, 0, 0) } }
}
