const {ethers} = require("hardhat");

let tokenName = "spBTC_1";
let tokenSymbol = "spBTC_1";
let multiSignatureAddress = "0x35553116E662c39a56380584c0352375E8D06380";

async function main() {
  const [deployerMin,,,,deployerMax] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployerMin.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployerMin.address)).toString());

  const debtToken = await ethers.getContractFactory("DebtToken");
  // 只传3个参数: name, symbol, multiSignatureAddress
  const DebtToken = await debtToken.connect(deployerMin).deploy(
    tokenName, 
    tokenSymbol, 
    multiSignatureAddress  // 没有decimals参数！
  );
  
  await DebtToken.waitForDeployment();
  console.log("DebtToken address:", await DebtToken.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });