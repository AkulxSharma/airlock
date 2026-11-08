pragma solidity ^0.8.0;
abstract contract Context { function _msgSender() internal view virtual returns (address) { return msg.sender; } }
abstract contract Ownable is Context {
  address private _owner;
  constructor() { _owner = _msgSender(); }
  modifier onlyOwner() { _checkOwner(); _; }
  function owner() public view returns (address) { return _owner; }
  function _checkOwner() internal view { require(owner() == _msgSender(), "Ownable: caller is not the owner"); }
  function renounceOwnership() public onlyOwner { _owner = address(0); }
}
contract Token is Ownable {
  mapping(address=>uint) public balanceOf;
  function transfer(address to, uint v) external returns (bool) { balanceOf[msg.sender]-=v; balanceOf[to]+=v; return true; }
}
