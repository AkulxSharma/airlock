pragma solidity ^0.8.0;
contract Proxyish {
  function execute(address target, bytes calldata data) external { (bool ok,) = target.delegatecall(data); require(ok); }
}
