pragma solidity =0.5.16;

import '../WarpDefiERC20.sol';

contract ERC20 is WarpDefiERC20 {
    constructor(uint _totalSupply) public {
        _mint(msg.sender, _totalSupply);
    }
}
