const { ethers } = require("hardhat");
const BN = web3.utils.BN;

async function mockUniswap(minter, weth) {
    const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    let uniswapFactory = await UniswapV2Factory.deploy(await minter.getAddress());
    await uniswapFactory.waitForDeployment();

    const UniswapV2Router02 = await ethers.getContractFactory("UniswapV2Router02");
    let uniswapRouter = await UniswapV2Router02.deploy(
        await uniswapFactory.getAddress(), 
        await weth.getAddress()
    );
    await uniswapRouter.waitForDeployment();
    
    return [uniswapRouter, uniswapFactory];
}

async function mockAddLiquidity(router, token0, token1, minter, deadline, amount0, amount1) {
    console.log("mockAddLiquidity called with:");
    console.log("token0 type:", typeof token0);
    console.log("token1 type:", typeof token1);
    console.log("router type:", typeof router);
    
    // 使用 getAddress() 获取地址
    const token0Address = await token0.getAddress();
    const token1Address = await token1.getAddress();
    const routerAddress = await router.getAddress();
    const minterAddress = await minter.getAddress();
    
    console.log("token0 address:", token0Address);
    console.log("token1 address:", token1Address);
    console.log("router address:", routerAddress);
    console.log("amount0:", amount0.toString());
    console.log("amount1:", amount1.toString());
    
    // approve
    console.log("Approving token0...");
    await token0.connect(minter).approve(routerAddress, BigInt(amount0));
    console.log("Approving token1...");
    await token1.connect(minter).approve(routerAddress, BigInt(amount1));
    
    // add liquidity
    console.log("Adding liquidity...");
    await router.connect(minter).addLiquidity(
        token0Address,
        token1Address,
        BigInt(amount0),
        BigInt(amount1),
        BigInt(0),
        BigInt(0),
        minterAddress,
        deadline
    );
    console.log("Liquidity added successfully");
}

async function mockSwap(router, token0, swapAmount, minAmount, path, minter, deadline) {
    // 使用 getAddress() 获取地址
    const token0Address = await token0.getAddress();
    const routerAddress = await router.getAddress();
    const minterAddress = await minter.getAddress();
    
    // approve
    await token0.connect(minter).approve(routerAddress, BigInt(swapAmount));
    
    // swap
    await router.connect(minter).swapExactTokensForTokens(
        BigInt(swapAmount),
        BigInt(minAmount),
        path,
        minterAddress,
        deadline
    );
}

module.exports = {
    mockUniswap,
    mockSwap,
    mockAddLiquidity
};