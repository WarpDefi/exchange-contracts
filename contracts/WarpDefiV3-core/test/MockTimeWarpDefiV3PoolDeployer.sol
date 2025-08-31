// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.7.6;

import "openzeppelin-contracts-solc-0.7/proxy/Clones.sol";

import "../interfaces/IWarpDefiV3Pool.sol";

import "./MockTimeWarpDefiV3Pool.sol";

contract MockTimeWarpDefiV3PoolDeployer {
    address public immutable implementation;

    // struct Parameters {
    //     address factory;
    //     address token0;
    //     address token1;
    //     uint24 fee;
    //     int24 tickSpacing;
    // }

    // Parameters public parameters;

    event PoolDeployed(address pool);

    constructor(address _implementation) {
        implementation = _implementation;
    }

    function deploy(
        address factory,
        address token0,
        address token1,
        uint24 fee,
        int24 tickSpacing
    ) external returns (address pool) {
        // parameters = Parameters({
        //     factory: factory,
        //     token0: token0,
        //     token1: token1,
        //     fee: fee,
        //     tickSpacing: tickSpacing
        // });
        pool = Clones.cloneDeterministic(
            implementation,
            keccak256(abi.encode(token0, token1, fee))
        );
        IWarpDefiV3Pool(pool).initialize(token0, token1, fee, tickSpacing);
        MockTimeWarpDefiV3Pool(pool).setFactory(factory);
        emit PoolDeployed(pool);
        // delete parameters;
    }
}
