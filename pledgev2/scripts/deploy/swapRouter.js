const { ethers } = require("hardhat");

async function mockUniswap(minter, weth) {
    const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    let uniswapFactory = await UniswapV2Factory.deploy(minter.address);
    await uniswapFactory.waitForDeployment(); // 等待部署完成
    
    const UniswapV2Router02 = await ethers.getContractFactory("UniswapV2Router02");
    let uniswapRouter = await UniswapV2Router02.deploy(
        await uniswapFactory.getAddress(), // 使用 getAddress()
        await weth.getAddress() // 使用 getAddress()
    );
    await uniswapRouter.waitForDeployment(); // 等待部署完成
    
    return [uniswapRouter, uniswapFactory];
}

async function main() {
    const [deployerMin,,,,deployerMax] = await ethers.getSigners();
    
    // 部署 WETH9
    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = await WETH9.deploy();
    await weth.waitForDeployment();
    console.log("weth", await weth.getAddress());
    
    // 部署 Router 和 Factory
    const [router, factory] = await mockUniswap(deployerMin, weth);
    
    console.log("router", await router.getAddress());
    console.log("factory", await factory.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });