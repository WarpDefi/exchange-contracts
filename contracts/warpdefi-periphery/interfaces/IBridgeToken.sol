pragma solidity >=0.5.0;

import "../../warpdefi-core/interfaces/IWarpDefiERC20.sol";

interface IBridgeToken is IWarpDefiERC20 {
    function swap(address token, uint256 amount) external;
    function swapSupply(address token) external view returns (uint256);
}