pragma solidity ^0.8.0;
contract Wallet {
  address owner = msg.sender;
  function send(address payable to, uint a) external { address who = tx.origin; require(who == owner); to.transfer(a); }
}
