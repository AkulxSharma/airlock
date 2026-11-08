pragma solidity ^0.8.0;
contract Registry {
  address public owner = msg.sender; mapping(bytes32=>address) public entries;
  modifier onlyOwner() { require(msg.sender == owner); _; }
  function transferOwnership(address n) external onlyOwner { owner = n; }
  function set(bytes32 k, address v) external onlyOwner { entries[k] = v; }
}
