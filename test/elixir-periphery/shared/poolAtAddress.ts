import { abi as POOL_ABI } from "../../../artifacts/contracts/WarpDefiV3-core/ElixirPool.sol/ElixirPool.json";
import { Contract, Wallet } from "ethers";
import { IWarpDefiV3Pool } from "../../../typechain";

export default function poolAtAddress(
  address: string,
  wallet: Wallet
): IWarpDefiV3Pool {
  return new Contract(address, POOL_ABI, wallet) as IWarpDefiV3Pool;
}
