const { ethers } = require("hardhat");

// Sepolia 测试网已部署合约地址
let oracleAddress = "0x18bC845077415Ed55600684f1E5B475247cF5161";
let swapRouter = "0xbd679839DD6990f5B690E0E1BF32129d737D4307"; 
let feeAddress = "0x0eD4b67d787bB1a47E06F0C6927C223FFd2cB6BC"; //接收合约收益的地址
let multiSignatureAddress = "0x35553116E662c39a56380584c0352375E8D06380";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying PledgePool with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  console.log("\n📋 Deployment parameters:");
  console.log("  Oracle:", oracleAddress);
  console.log("  SwapRouter:", swapRouter);
  console.log("  FeeAddress:", feeAddress);
  console.log("  MultiSignature:", multiSignatureAddress);

  const PledgePool = await ethers.getContractFactory("PledgePool");
  const pledgePool = await PledgePool.connect(deployer).deploy(
    oracleAddress,
    swapRouter, 
    feeAddress,
    multiSignatureAddress
  );

  await pledgePool.waitForDeployment();
  const pledgeAddress = await pledgePool.getAddress();
  
  console.log("\n✅ PledgePool deployed to:", pledgeAddress);
  console.log("🔗 Transaction hash:", pledgePool.deploymentTransaction().hash);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("\n❌ Deployment failed:", error.message);
    process.exit(1);
  });