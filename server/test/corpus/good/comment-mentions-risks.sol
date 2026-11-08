pragma solidity ^0.8.0;
// NOTE: never use tx.origin for auth. No blacklist, no owner sweep, no mint here.
/* selfdestruct is deprecated; delegatecall is dangerous */
contract Plain { uint public x; function set(uint v) external { x = v; } }
