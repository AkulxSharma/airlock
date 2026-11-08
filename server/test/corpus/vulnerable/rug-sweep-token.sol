pragma solidity ^0.8.0;
interface IERC20 { function balanceOf(address) external view returns (uint); function transfer(address,uint) external returns (bool); }
contract Staking {
  address owner; IERC20 token;
  modifier onlyOwner() { require(msg.sender == owner, "no"); _; }
  function emergencyExit(address to) external onlyOwner { token.transfer(to, token.balanceOf(address(this))); }
}
