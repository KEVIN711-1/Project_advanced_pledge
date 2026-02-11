const { ethers } = require("hardhat");

let multiSignatureAddress = [
    "0x0eD4b67d787bB1a47E06F0C6927C223FFd2cB6BC",
    "0xAa1e61Bb5b5f43eF299DB79380790e2e0d4c07fb",
    "0xCc8198a070f2D21BA9Ba558Fca185E232a6971cD"
];
let threshold = 2;

async function main() {
    const [deployerMax, , , , deployerMin] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployerMax.address);

    // 修复1: getBalance() → provider.getBalance()
    const balance = await ethers.provider.getBalance(deployerMax.address);
    console.log("Account balance:", ethers.formatEther(balance), "ETH");

    // 修复2: 合约名首字母大写 (Solidity 规范)
    const MultiSignature = await ethers.getContractFactory("multiSignature");
    const multiSignature = await MultiSignature.connect(deployerMax).deploy(multiSignatureAddress, threshold);

    // 修复3: waitForDeployment() 等待部署完成
    await multiSignature.waitForDeployment();

    // 修复4: .address → .getAddress()
    console.log("MultiSignature address:", await multiSignature.getAddress());
    
    // 可选：打印交易hash
    console.log("Transaction hash:", multiSignature.deploymentTransaction().hash);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });