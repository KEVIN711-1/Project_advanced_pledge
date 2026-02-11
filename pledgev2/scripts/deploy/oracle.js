const {ethers} = require("hardhat");

let multiSignatureAddress = "0x35553116E662c39a56380584c0352375E8D06380";

async function main() {
  const [deployerMin,,,,deployerMax] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployerMin.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployerMin.address)).toString());

  const oracleToken = await ethers.getContractFactory("BscPledgeOracle");
  const oracle = await oracleToken.connect(deployerMin).deploy(multiSignatureAddress);
  
  await oracle.waitForDeployment();
  console.log("Oracle address:", await oracle.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });