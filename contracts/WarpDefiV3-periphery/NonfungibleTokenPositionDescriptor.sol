// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '../WarpDefiV3-core/interfaces/IWarpDefiV3Pool.sol';
import '../warpdefi-lib/libraries/SafeERC20Namer.sol';

import './libraries/ChainId.sol';
import './interfaces/INonfungiblePositionManager.sol';
import './interfaces/INonfungibleTokenPositionDescriptor.sol';
import './interfaces/IERC20Metadata.sol';
import './libraries/PoolAddress.sol';
import './libraries/NFTDescriptor.sol';
import './libraries/TokenRatioSortOrder.sol';

/// @title Describes NFT token positions
/// @notice Produces a string containing the data URI for a JSON metadata string
contract NonfungibleTokenPositionDescriptor is INonfungibleTokenPositionDescriptor {
    address private constant ETH_DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address private constant ETH_USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address private constant ETH_USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address private constant ETH_TBTC = 0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa;
    address private constant ETH_WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;

    address private constant AVAX_BUSD = 0x9C9e5fD8bbc25984B178FdCE6117Defa39d2db39;
    address private constant AVAX_USDC = 0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E;
    address private constant AVAX_USDT = 0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7;
    address private constant AVAX_WETH = 0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB;
    address private constant AVAX_BTCB = 0x152b9d0FdC40C096757F570A51E494bd4b943E50;

    address public immutable WETH9;

    constructor(address _WETH9) {
        WETH9 = _WETH9;
    }

    /// @inheritdoc INonfungibleTokenPositionDescriptor
    function tokenURI(INonfungiblePositionManager positionManager, uint256 tokenId)
        external
        view
        override
        returns (string memory)
    {
        (, , address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, , , , , ) =
            positionManager.positions(tokenId);

        IWarpDefiV3Pool pool =
            IWarpDefiV3Pool(
                PoolAddress.computeAddress(
                    positionManager.factory(),
                    PoolAddress.PoolKey({token0: token0, token1: token1, fee: fee})
                )
            );

        bool _flipRatio = flipRatio(token0, token1, ChainId.get());
        address quoteTokenAddress = !_flipRatio ? token1 : token0;
        address baseTokenAddress = !_flipRatio ? token0 : token1;
        (, int24 tick, , , , , ) = pool.slot0();

        return
            NFTDescriptor.constructTokenURI(
                NFTDescriptor.ConstructTokenURIParams({
                    tokenId: tokenId,
                    quoteTokenAddress: quoteTokenAddress,
                    baseTokenAddress: baseTokenAddress,
                    quoteTokenSymbol: SafeERC20Namer.tokenSymbol(quoteTokenAddress),
                    baseTokenSymbol: SafeERC20Namer.tokenSymbol(baseTokenAddress),
                    quoteTokenDecimals: IERC20Metadata(quoteTokenAddress).decimals(),
                    baseTokenDecimals: IERC20Metadata(baseTokenAddress).decimals(),
                    flipRatio: _flipRatio,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    tickCurrent: tick,
                    tickSpacing: pool.tickSpacing(),
                    fee: fee,
                    poolAddress: address(pool)
                })
            );
    }

    function flipRatio(
        address token0,
        address token1,
        uint256 chainId
    ) public view returns (bool) {
        return tokenRatioPriority(token0, chainId) > tokenRatioPriority(token1, chainId);
    }

    function tokenRatioPriority(address token, uint256 chainId) public view returns (int256) {
        if (token == WETH9) {
            return TokenRatioSortOrder.DENOMINATOR;
        }
        if (chainId == 1) {
            if (token == ETH_USDC) {
                return TokenRatioSortOrder.NUMERATOR_MOST;
            } else if (token == ETH_USDT) {
                return TokenRatioSortOrder.NUMERATOR_MORE;
            } else if (token == ETH_DAI) {
                return TokenRatioSortOrder.NUMERATOR;
            } else if (token == ETH_TBTC) {
                return TokenRatioSortOrder.DENOMINATOR_MORE;
            } else if (token == ETH_WBTC) {
                return TokenRatioSortOrder.DENOMINATOR_MOST;
            }
        } else if (chainId == 43114) {
            if (token == AVAX_USDC) {
                return TokenRatioSortOrder.NUMERATOR_MOST;
            } else if (token == AVAX_USDT) {
                return TokenRatioSortOrder.NUMERATOR_MORE;
            } else if (token == AVAX_BUSD) {
                return TokenRatioSortOrder.NUMERATOR;
            } else if (token == AVAX_WETH) {
                return TokenRatioSortOrder.DENOMINATOR_MORE;
            } else if (token == AVAX_BTCB) {
                return TokenRatioSortOrder.DENOMINATOR_MOST;
            }
        }
        return 0;
    }
}