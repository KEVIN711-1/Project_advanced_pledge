const { expect } = require("chai");
const { show } = require("./helper/meta.js");
const BN = require('bn.js');


describe("BscPledgeOracle", function (){
    let bscPledgeOracle, busdAddrress,btcAddress;
    beforeEach(async ()=>{
        [minter, alice, bob, carol, _] = await ethers.getSigners();
        const multiSignatureToken = await ethers.getContractFactory("MockMultiSignature");
        const multiSignature = await multiSignatureToken.deploy();
        await multiSignature.waitForDeployment();

        const bscPledgeOracleToken = await ethers.getContractFactory("BscPledgeOracle");
        bscPledgeOracle = await bscPledgeOracleToken.deploy(await multiSignature.getAddress());
        await bscPledgeOracle.waitForDeployment();
        const busdToken = await ethers.getContractFactory("BEP20Token");
        busdAddrress = await busdToken.deploy();
        await busdAddrress.waitForDeployment();
        const btcToken = await ethers.getContractFactory("BtcToken");
        btcAddress = await btcToken.deploy();
        await btcAddress.waitForDeployment();
    });

    it ("set price succeeds with mocked multiSignature", async function() {
        const busd = await busdAddrress.getAddress();
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(0).toString()));
        await bscPledgeOracle.connect(alice).setPrice(busd, 100000000);
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(100000000).toString()));
    });

    it ("Admin set price operation", async function (){
        const busd = await busdAddrress.getAddress();
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(0).toString()));
        await bscPledgeOracle.connect(minter).setPrice(busd, 100000000);
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(100000000).toString()));
    });

    it("Administrators set prices in batches", async function (){
        const busd = await busdAddrress.getAddress();
        const btc = await btcAddress.getAddress();
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(0).toString()));
        expect(await bscPledgeOracle.getPrice(btc)).to.equal((BigInt(0).toString()));
        let busdIndex = new BN((busd).substring(2),16).toString(10);
        let btcIndex = new BN((btc).substring(2),16).toString(10);
        await bscPledgeOracle.connect(minter).setPrices([busdIndex,btcIndex],[100,100]);
        expect(await bscPledgeOracle.getUnderlyingPrice(0)).to.equal((BigInt(100).toString()));
        expect(await bscPledgeOracle.getUnderlyingPrice(1)).to.equal((BigInt(100).toString()));
    });

    it("Get price according to INDEX",async function () {
        const busd = await busdAddrress.getAddress();
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(0).toString()));
        let underIndex = new BN((busd).substring(2),16).toString(10);
        await bscPledgeOracle.connect(minter).setUnderlyingPrice(underIndex, 100000000);
        expect(await bscPledgeOracle.getUnderlyingPrice(underIndex)).to.equal((BigInt(100000000).toString()));
    });

    it("Set price according to INDEX", async function (){
        const busd = await busdAddrress.getAddress();
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(0).toString()));
        let underIndex = new BN((busd).substring(2),16).toString(10);
        await bscPledgeOracle.connect(minter).setUnderlyingPrice(underIndex, 100000000);
        expect(await bscPledgeOracle.getPrice(busd)).to.equal((BigInt(100000000).toString()));
    });

    it("Set AssetsAggregator", async function (){
        const busd = await busdAddrress.getAddress();
        const btc = await btcAddress.getAddress();
        let arrData = await bscPledgeOracle.getAssetsAggregator(busd)
        show(arrData[0]);
        expect(arrData[0]).to.equal('0x0000000000000000000000000000000000000000');
        await bscPledgeOracle.connect(minter).setAssetsAggregator(busd,btc,18);
        let data = await bscPledgeOracle.getAssetsAggregator(busd);
        expect(data[0]).to.equal(btc);
        expect(data[1]).to.equal(18);
    });



})