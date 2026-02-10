// test/helper/init.js
async function initFactory(minter) {
    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    // 使用 await minter.getAddress() 而不是 minter.address
    const factory = await Factory.deploy(await minter.getAddress());
    await factory.waitForDeployment();
    return factory;
}

async function initWETH() {
    const WETH = await ethers.getContractFactory("WETH9");
    const weth = await WETH.deploy();
    await weth.waitForDeployment();
    return weth;
}

async function initRouter(factory, weth) {
    const Router = await ethers.getContractFactory("UniswapV2Router02");
    // 关键修复：使用 getAddress() 方法
    const router = await Router.deploy(
        await factory.getAddress(),
        await weth.getAddress()
    );
    await router.waitForDeployment();
    return router;
}

async function initBusd() {
    const Busd = await ethers.getContractFactory("BEP20Token");
    const busd = await Busd.deploy();
    await busd.waitForDeployment();
    return busd;
}

async function initBtc() {
    const Btc = await ethers.getContractFactory("BtcToken");
    const btc = await Btc.deploy();
    await btc.waitForDeployment();
    return btc;
}

async function initAll(minter) {
    // mock weth
    let weth = await initWETH();
    let factory = await initFactory(minter);
    
    // build router binded with factory and weth
    let router = await initRouter(factory, weth);
    
    let busd = await initBusd();
    let btc = await initBtc();
    
    return [weth, factory, router, busd, btc];
}

module.exports = {
    initWETH,
    initFactory,
    initRouter,
    initBusd,
    initBtc,
    initAll
};