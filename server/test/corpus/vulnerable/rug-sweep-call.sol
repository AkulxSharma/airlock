pragma solidity ^0.8.0;
contract Pool {
  address admin;
  function drain(address payable to) external { require(msg.sender == admin); (bool ok,) = to.call{value: address(this).balance}(""); require(ok); }
}
