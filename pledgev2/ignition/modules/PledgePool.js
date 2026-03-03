// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");


module.exports = buildModule("PledgePoolModule", (m) => {
  // ==========================这部分参数记得替换=============================
  const oracle = "0x18bC845077415Ed55600684f1E5B475247cF5161";
  const swapRouter = "0xbd679839DD6990f5B690E0E1BF32129d737D4307";
  const feeAddress = "0x0eD4b67d787bB1a47E06F0C6927C223FFd2cB6BC";
  const multiSignature = "0x35553116E662c39a56380584c0352375E8D06380";
// ==========================这部分参数记得替换=============================
  const pledgePool = m.contract(
    "PledgePool",
    [oracle, swapRouter, feeAddress, multiSignature],
    {}
  );

  return { pledgePool };
});
