// SPDX-License-Identifier: GPLv3
pragma solidity 0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IWarpDefiChef {
    function rewardsToken() external view returns (address);

    function addReward(uint256 amount) external;

    function hasRole(bytes32 role, address account) external view returns (bool);
}

/**
 * @author WarpDefi
 * @notice
 *
 * Funder -> RewardFundingForwarder -> WarpDefiChef
 *               OR
 * Funder -> RewardFundingForwarder -> WarpDefiStakingPositions
 *
 * Funder is any contract that was written for Synthetix' StakingRewards, or for MiniChef.
 * RewardFundingForwarder provides compatibility for these old funding contracts.
 */
contract RewardFundingForwarder {
    IWarpDefiChef public immutable warpdefiChef;
    address public immutable rewardsToken;
    bytes32 private constant FUNDER_ROLE = keccak256("FUNDER_ROLE");

    modifier onlyFunder() {
        require(warpdefiChef.hasRole(FUNDER_ROLE, msg.sender), "unauthorized");
        _;
    }

    constructor(address newWarpDefiChef) {
        require(newWarpDefiChef.code.length != 0, "empty contract");
        address newRewardsToken = IWarpDefiChef(newWarpDefiChef).rewardsToken();
        IERC20(newRewardsToken).approve(newWarpDefiChef, type(uint256).max);
        warpdefiChef = IWarpDefiChef(newWarpDefiChef);
        rewardsToken = newRewardsToken;
    }

    function notifyRewardAmount(uint256 amount) external onlyFunder {
        warpdefiChef.addReward(amount);
    }

    function fundRewards(uint256 amount, uint256) external {
        addReward(amount);
    }

    function addReward(uint256 amount) public onlyFunder {
        IERC20(rewardsToken).transferFrom(msg.sender, address(this), amount);
        warpdefiChef.addReward(amount);
    }
}
