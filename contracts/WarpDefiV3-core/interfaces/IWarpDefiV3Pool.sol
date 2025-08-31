// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './pool/IWarpDefiV3PoolImmutables.sol';
import './pool/IWarpDefiV3PoolState.sol';
import './pool/IWarpDefiV3PoolDerivedState.sol';
import './pool/IWarpDefiV3PoolActions.sol';
import './pool/IWarpDefiV3PoolOwnerActions.sol';
import './pool/IWarpDefiV3PoolEvents.sol';

/// @title The interface for a WarpDefiV3 Pool
/// @notice A WarpDefi pool facilitates swapping and automated market making between any two assets that strictly conform
/// to the ERC20 specification
/// @dev The pool interface is broken up into many smaller pieces
interface IWarpDefiV3Pool is
    IWarpDefiV3PoolImmutables,
    IWarpDefiV3PoolState,
    IWarpDefiV3PoolDerivedState,
    IWarpDefiV3PoolActions,
    IWarpDefiV3PoolOwnerActions,
    IWarpDefiV3PoolEvents
{

}
