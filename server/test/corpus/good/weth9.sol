pragma solidity ^0.8.0;
contract WETH9 {
  mapping(address=>uint) public balanceOf;
  function deposit() public payable { balanceOf[msg.sender] += msg.value; }
  function withdraw(uint wad) public { require(balanceOf[msg.sender] >= wad); balanceOf[msg.sender] -= wad; payable(msg.sender).transfer(wad); }
  function totalSupply() public view returns (uint) { return address(this).balance; }
}
