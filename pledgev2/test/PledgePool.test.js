const { expect } = require("chai");
const { show } = require("./helper/meta.js");
const { initAll } = require("./helper/init.js");
const { latestBlock, advanceBlockTo, latestBlockNum, stopAutoMine, latest, increase } = require("./helper/time.js");
const { mockUniswap, mockAddLiquidity, mockSwap } = require('./helper/mockUniswap.js');

// 描述 PledgePool 智能合约的测试套件
describe("PledgePool", function () {
    // 定义合约和地址变量
    let busdAddress, btcAddress, spAddress, jpAddress, bscPledgeOracle, pledgeAddress;
    let weth, factory, router;
    let minter, alice, bob, carol, _;
    let multiSignature;
    
    // 每个测试用例执行前的初始化工作
    beforeEach(async () => {
        await stopAutoMine(); // 停止自动挖矿，PledgePool 对时间极其敏感，手动控制区块时间
        [minter, alice, bob, carol, _] = await ethers.getSigners(); // 获取测试账户
        
        // 部署多签合约
        // 调用mock 模拟合约
        //  聚焦测试点：只测试当前关注的功能
        //  跳过无关逻辑：如治理、费用分配等
        //  添加测试钩子：如强制状态转换
        const multiSignatureToken = await ethers.getContractFactory("MockMultiSignature");
        multiSignature = await multiSignatureToken.deploy();
        await multiSignature.waitForDeployment();

        // 部署预言机合约
        const bscPledgeOracleToken = await ethers.getContractFactory("MockOracle");
        bscPledgeOracle = await bscPledgeOracleToken.deploy();
        await bscPledgeOracle.waitForDeployment();

        // 部署债务代币合约 (SP和JP)
        const spToken = await ethers.getContractFactory("DebtToken");
        // 作用：贷款人(Lender)的**债权凭证**
        spAddress = await spToken.deploy("spBUSD_1", "spBUSD_1", await multiSignature.getAddress()); 
        await spAddress.waitForDeployment();

        const jpToken = await ethers.getContractFactory("DebtToken");
        // 作用：借款人(Borrower)的**抵押品权益凭证**
        jpAddress = await jpToken.deploy("jpBTC_1", "jpBTC_1", await multiSignature.getAddress()); 
        await jpAddress.waitForDeployment();

        // 初始化Uniswap相关合约和代币
        // weth 模拟以太坊的WETH功能
        // factory 创建和管理代币交易对（Pair） 设置minter为feeToSetter（可设置手续费接收地址）
        // router 提供swapExactTokensForTokens() 等交换函数 清算时，将抵押物换成稳定币归还借款人
        // busdAddress 模拟BUSD稳定币 （贷款人存入，借款人借出）
        // btcAddress 模拟比特币（WBTC或类似）作为抵押的代币（借款人存入）
        [weth, factory, router, busdAddress, btcAddress] = await initAll(minter);
        
        // 部署PledgePool质押池合约
        const pledgeToken = await ethers.getContractFactory("MockPledgePool");
        pledgeAddress = await pledgeToken.deploy(
            await bscPledgeOracle.getAddress(),
            await router.getAddress(), //  swaprouter 合约地址
            await minter.getAddress(),  // 管理员地址 - 修复这里
            await multiSignature.getAddress()
        );
        await pledgeAddress.waitForDeployment();
    });
    
    // 辅助函数：初始化创建池信息
    async function initCreatePoolInfo(pledgeAddress, minter, time0, time1) {
        // 初始化池的时间参数
        let startTime = await latest(); // 获取当前区块时间
        let settleTime = (parseInt(startTime) + parseInt(time0)); // 结算时间
        show({ settleTime });
        let endTime = (parseInt(settleTime) + parseInt(time1)); // 结束时间
        show({ endTime });
        
        // 池参数配置
        let interestRate = 1000000; // 利率
        let maxSupply = BigInt(100000000000000000000000); // 最大供应量
        let martgageRate = 200000000; // 抵押率
        let autoLiquidateThreshold = 20000000; // 自动清算阈值
        
        // 创建池信息 - 使用统一的地址获取方式
        await pledgeAddress.connect(minter).createPoolInfo(
            settleTime,
            endTime,
            interestRate,
            maxSupply,
            martgageRate,
            await busdAddress.getAddress(),  // 修复这里
            await btcAddress.getAddress(),  // 修复这里
            await spAddress.getAddress(),   // 修复这里
            await jpAddress.getAddress(),   // 修复这里
            autoLiquidateThreshold
        );
    }
    
    // reverted - 用于智能合约交易失败
    // solidity
    // // 当合约执行 revert() 或 require() 失败时
    // function withdraw(uint256 amount) external {
    //     require(balance >= amount, "Insufficient balance"); // 条件失败会revert
    //     // 或者直接：
    //     if (amount > balance) revert("Insufficient balance");
    // }
    // // 测试中：
    // await expect(contract.withdraw(1000)).to.be.reverted;
    // await expect(contract.withdraw(1000)).to.be.revertedWith("Insufficient balance");
    
    // rejected - 用于普通Promise拒绝
    // javascript
    // // 当异步操作被 Promise.reject() 时
    // async function fetchData() {
    //     if (!networkAvailable) {
    //         return Promise.reject(new Error("Network error"));
    //     }
    //     return data;
    // }
    // // 测试中：
    // await expect(fetchData()).to.be.rejected;
    // await expect(fetchData()).to.be.rejectedWith(Error, "Network error");
    
    // 核心业务流程（四大阶段）
    // 阶段1：产品发行期（限时认购）
    // 时间窗口：创建池后至settleTime（如100秒内）
    // 贷款人：存入稳定币（BUSD）
    // 借款人：存入抵押品（BTC）
    // 特点：双方必须都在这个窗口期内完成，逾期无法参与
    
    // 阶段2：结算期（统一审核）
    // 触发时间：达到settleTime时
    // 管理员操作：调用settle()函数
    // 完成三件事：
    // 计算总利息（从存款到结束时间的全部利息）
    // 检查风险：抵押品价值是否足够覆盖本息
    // 状态转换：从"存款期"进入"执行期"
    
    // 阶段3：执行期（凭证分发）
    // 时间窗口：settleTime后至endTime前
    // 贷款人：领取SP代币（1 SP ≈ 1 BUSD本金 + 相应利息份额）
    // 借款人：领取JP代币（1 JP ≈ 1 BTC的赎回权）
    // 特点：代币可以在二级市场交易，实现流动性
    
    // 阶段4：结束期（资金赎回）
    // 触发时间：达到endTime后
    // 贷款人：燃烧SP代币，取回BUSD本金+利息
    // 借款人：燃烧JP代币，取回BTC（扣除可能的清算损失）
    
    // 与灵活借贷协议的对比
    // 特性              Pledge（固定期限）        Aave（灵活借贷）
    // 提前还款          ❌ 不允许                  ✅ 随时可以
    // 利息计算          固定，提前确定            浮动，实时计算
    // 资金锁定          完全锁定到期              随时可取（有健康因子要求）
    // 适合场景          确定性收益需求            短期/灵活资金需求
    
    // 测试用例1：检查SP和JP代币的铸造权限和功能
    it("check if mint right", async function () {
        // 为SP和JP代币添加铸币者权限
        await spAddress.addMinter(await minter.getAddress());
        await jpAddress.addMinter(await minter.getAddress());
        
        // 铸造代币给alice
        await spAddress.connect(minter).mint(await alice.getAddress(), BigInt(100000000));
        await jpAddress.connect(minter).mint(await alice.getAddress(), BigInt(100000000));
        
        // 验证总供应量和余额
        expect((await spAddress.totalSupply()).toString()).to.equal(BigInt(100000000).toString());
        expect((await spAddress.balanceOf(await alice.getAddress())).toString()).to.equal(BigInt(100000000).toString());
        expect((await jpAddress.totalSupply()).toString()).to.equal(BigInt(100000000).toString());
        expect((await jpAddress.balanceOf(await alice.getAddress())).toString()).to.equal(BigInt(100000000).toString());
    });
    
    // 测试用例2：创建池信息
    it("Create Pool info", async function () {
        // 创建池信息
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        // 验证池的数量
        expect((await pledgeAddress.poolLength()).toString()).to.be.equal("1");
    });
    
    // 测试用例3：非管理员创建池（应该失败）
    it("Non-administrator creates pool", async function () {
        // 测试跳过，因为使用了不支持的断言语法
        // await expect(initCreatePoolInfo(pledgeAddress, alice, 100, 200)).to.be.rejectedWith(Error);
        await expect(initCreatePoolInfo(pledgeAddress, alice, 100, 200)).to.be.revertedWith("Ownable: caller is not the owner"); // ✅
    });
    
    // 测试用例4：创建池后存款借贷，验证池状态匹配
    it("deposit lend after create pool info, pool state is match", async function () {
        // 创建池信息 由项目方创建
        // 控制抵押物质量：只选主流、高流动性代币
        // 专业参数设定：基于风险评估设置利率、抵押率
        // 系统性风控：保护所有参与者
        // 建立协议信誉：用户信任平台的审核能力
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        // 验证第一个池（0）的初始状态为0（未开始）
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");

        // 授权PledgePool合约使用BUSD
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        show(await pledgeAddress.poolLength());
        // 输出类似：
        // { poolLength: 1 }
        
        // 存入借贷资金
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 检查用户借贷信息
        let data = await pledgeAddress.userLendInfo(await minter.getAddress(), 0);
        show({ data });
        expect(data[0].toString()).to.be.equal(BigInt(1000 * 1e18).toString());
        
        // 增加时间，使池状态改变
        await increase(1000);
        // 存款期1000s，超时之后，再次借款应该失败revert
        // 测试跳过，因为使用了不支持的断言语法
        await expect(pledgeAddress.connect(minter).depositLend(0, BigInt(1000*1e18))).to.be.reverted;  // ✅ 对于合约交易失败
    });
    
    // 测试用例5：创建池后存款抵押，验证池状态匹配
    it("deposit borrow after create pool info, pool state is match", async function () {
        await initCreatePoolInfo(pledgeAddress, minter, 1000, 2000);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");

        // 授权PledgePool合约使用BTC
        await btcAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        let timestamp = await latest();
        let deadLine = timestamp + 100; // 设置交易截止时间
        
        // 存入抵押品
        await pledgeAddress.connect(minter).depositBorrow(0, BigInt(1000 * 1e18), deadLine);
        
        // 检查用户抵押信息
        let data = await pledgeAddress.userBorrowInfo(await minter.getAddress(), 0);
        show({ data });
        expect(data[0].toString()).to.be.equal(BigInt(1000 * 1e18).toString());
        
        await increase(1000);
        // 存款期1000s，超时之后，再次借款应该失败revert
        // 测试跳过，因为使用了不支持的断言语法
        await expect(pledgeAddress.connect(minter).depositBorrow(0, BigInt(1000*1e18), deadLine)).to.be.reverted;
    });
    
    // 测试用例6：暂停功能检查
    it("pause check", async function () {
        // 创建池信息
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        
        // 授权并存款
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 检查存款信息
        let num = await pledgeAddress.userLendInfo(await minter.getAddress(), 0);
        expect(num[0].toString()).to.be.equal(BigInt(1000000000000000000000).toString());
        
        // 暂停合约
        await pledgeAddress.connect(minter).setPause();
        
        // 在调用 setPause() 暂停合约后，再次调用 depositLend() 应该失败，交易被revert
        await expect(pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18))).to.be.reverted;
    });
    
    // PoolState的完整生命周期：
    // 状态        值      业务含义           触发条件
    // MATCH       0       匹配期             池创建后自动
    // EXECUTION   1       执行期             结算后双方都有存款
    // FINISH      2       正常完成           到达endTime后管理员结束
    // LIQUIDATION 3       清算完成           价格下跌触发清算
    // UNDONE      4       未完成             结算时一方无存款，参与人数不足
    
    // 测试用例7：池状态检查（时间推进和状态转换）
    it("pool state check", async function () {
        let blockNum = await latestBlock();
        show({ blockNum });
        let newTime = await latest();
        show({ newTime });
        
        // 创建池信息
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        let poolstate = await pledgeAddress.getPoolState(0);
        show({ poolstate });
        
        // 存款并推进时间
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        // await advanceBlockTo(100);
        
        // let blockNum1 = await latestBlock();
        // show({ blockNum1 });
        let endtime = await latest();
        show({ endtime });
        
        // 增加时间前打印
        let timeBefore = await latest();
        let poolstateBefore = await pledgeAddress.getPoolState(0);
        show({ timeBefore, poolstateBefore });
        
        // 增加时间并结算
        await increase(10);

        // 增加时间后打印
        let timeAfter = await latest();
        let poolstateAfter = await pledgeAddress.getPoolState(0);
        show({ timeAfter, poolstateAfter });
    
        await expect(pledgeAddress.connect(minter).settle(0)).to.be.revertedWith("settle: less than settleTime");
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");
        await increase(96);

        await pledgeAddress.connect(minter).settle(0);
        let poolstateBefore2 = await pledgeAddress.getPoolState(0);
        let timeAfter2 = await latest();

        show({ timeAfter2, poolstateBefore2 });

        // 验证池状态变为4（已完成结算）
        // UNDONE 4 未完成 结算时一方无存款，只有借款人，没有借贷人参加，参与人数不足
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("4");
    });
    
    // 测试用例8：借贷方紧急提款（池状态为undone）
    it("emergencyLendWithdrawal for lend, pool state is undone", async function () {
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");
        
        // 存款并推进时间
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 增加时间并结算
        await increase(1000);
        await pledgeAddress.connect(minter).settle(0);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("4");
        
        // UNDONE 4 未完成 结算时一方无存款，只有借款人，没有借贷人参加，参与人数不足
        // 借贷方紧急提款
        await pledgeAddress.connect(minter).emergencyLendWithdrawal(0);
        let data = await pledgeAddress.userLendInfo(await minter.getAddress(), 0);
        expect(data[2]).to.equal(true); // 验证紧急提款标记为true
        // 借款用户信息
        // struct LendInfo {
        //     uint256 stakeAmount;          // 当前借款的质押金额
        //     uint256 refundAmount;         // 超额退款金额
        //     bool hasNoRefund;             // 默认为false，false = 无退款，true = 已退款
        //     bool hasNoClaim;              // 默认为false，false = 无索赔，true = 已索赔
        // }
        // Info of each user that stakes tokens.  {user.address : {pool.index : user.lendInfo}}
        // mapping (address => mapping (uint256 => LendInfo)) public userLendInfo; 
        // data[2] 相当于访问结构体中的第三个变量的值hasNoRefund
    });
    
    // 测试用例9：抵押方紧急提款（池状态为undone）
    it("emergencyBorrowWithdrawal for borrow, pool state is undone", async function () {
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");
        
        // 抵押并推进时间
        await btcAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        let timestamp = await latest();
        let deadLine = timestamp + 100;
        await pledgeAddress.connect(minter).depositBorrow(0, BigInt(1000 * 1e18), deadLine);
        
        // 增加时间并结算
        await increase(1000);
        await pledgeAddress.connect(minter).settle(0);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("4");
        
        // 抵押方紧急提款
        // UNDONE 4 未完成 结算时一方无存款，只有贷款款人，没有借贷人参加，参与人数不足
        await pledgeAddress.connect(minter).emergencyBorrowWithdrawal(0);
        let data = await pledgeAddress.userBorrowInfo(await minter.getAddress(), 0);
        expect(data[2]).to.equal(true); // 验证紧急提款标记为true
    });
    
    // 测试用例10：领取SP和JP代币（池状态为execution）
    it("claim spToken or jpToken, pool state is execution", async function () {
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");

        // 抵押BTC
        await btcAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(500 * 1e18));
        let timestamp = await latest();
        let deadLine = timestamp + 100;
        await pledgeAddress.connect(minter).depositBorrow(0, BigInt(500 * 1e18), deadLine);
        
        // 借贷BUSD
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 增加时间并设置预言机价格
        // await increase(1000);
        await bscPledgeOracle.connect(minter).setPrice(await busdAddress.getAddress(), BigInt(1e8));
        await bscPledgeOracle.connect(minter).setPrice(await btcAddress.getAddress(), BigInt(1e8));
        
        // 结算池
        // PoolState的完整生命周期：
        // 状态        值      业务含义           触发条件
        // MATCH       0       匹配期             池创建后自动
        // EXECUTION   1       执行期             结算后双方都有存款
        // FINISH      2       正常完成           到达endTime后管理员结束
        // LIQUIDATION 3       清算完成           价格下跌触发清算
        // UNDONE      4       未完成             结算时一方无存款，参与人数不足
        await increase(1000);

        await pledgeAddress.connect(minter).settle(0);
        show(await pledgeAddress.getPoolState(0));
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("1"); // 执行状态
        
        // 查看池数据
        let poolDataInfo = await pledgeAddress.poolDataInfo(0);
        show({ poolDataInfo });
        
        // 为PledgePool合约添加铸币者权限
        await spAddress.connect(minter).addMinter(await pledgeAddress.getAddress());
        await jpAddress.connect(minter).addMinter(await pledgeAddress.getAddress());
        
        // 领取SP和JP代币
        await pledgeAddress.connect(minter).claimLend(0);
        await pledgeAddress.connect(minter).claimBorrow(0);
        
        // 验证代币余额
        expect((await spAddress.balanceOf(await minter.getAddress())).toString()).to.equal(BigInt(250000000000000000000).toString());
        expect((await jpAddress.balanceOf(await minter.getAddress())).toString()).to.equal(BigInt(500000000000000000000).toString());
    });
    
    // 测试用例11：退款数量检查（池状态为execution）
    it("Number of refunds, pool state is execution", async function () {
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");
        
        // 抵押和借贷
        await btcAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(500 * 1e18));
        let timestamp = await latest();
        let deadLine = timestamp + 100;
        await pledgeAddress.connect(minter).depositBorrow(0, BigInt(500 * 1e18), deadLine);
        
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 增加时间并设置预言机价格
        // await increase(1000);
        await bscPledgeOracle.connect(minter).setPrice(await busdAddress.getAddress(), BigInt(1e8));
        await bscPledgeOracle.connect(minter).setPrice(await btcAddress.getAddress(), BigInt(1e8));
        
        // 结算
        await increase(1000);
        await pledgeAddress.connect(minter).settle(0);
        show(await pledgeAddress.getPoolState(0));
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("1");
        
        // 借贷方退款
        await pledgeAddress.connect(minter).refundLend(0);
        let lendInfoData = await pledgeAddress.userLendInfo(await minter.getAddress(), 0);
        show({ lendInfoData });
        expect(lendInfoData[2]).to.equal(true); // 验证退款标记
    });
    
    // 测试用例12：燃烧SP和JP代币，池完成（finish状态）
    it("lend burn sp token and borrow burn jp token, pool is finish", async function () {
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");
        
        // 抵押和借贷
        await btcAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(500 * 1e18));
        let timestamp = await latest();
        let deadLine = timestamp + 100;
        await pledgeAddress.connect(minter).depositBorrow(0, BigInt(500 * 1e18), deadLine);
        
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 增加时间并设置预言机价格
        // await increase(1000);
        await bscPledgeOracle.connect(minter).setPrice(await busdAddress.getAddress(), BigInt(1e8));
        await bscPledgeOracle.connect(minter).setPrice(await btcAddress.getAddress(), BigInt(1e8));
        
        // 结算
        await increase(1000);
        await pledgeAddress.connect(minter).settle(0);
        show(await pledgeAddress.getPoolState(0));
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("1");
        
        // 查看池数据
        let poolDataInfo = await pledgeAddress.poolDataInfo(0);
        show({ poolDataInfo });
        
        // 添加铸币者权限并领取代币
        await spAddress.connect(minter).addMinter(await pledgeAddress.getAddress());
        await jpAddress.connect(minter).addMinter(await pledgeAddress.getAddress());
        await pledgeAddress.connect(minter).claimLend(0);
        await pledgeAddress.connect(minter).claimBorrow(0);
        
        // 验证代币余额
        expect((await spAddress.balanceOf(await minter.getAddress())).toString()).to.equal(BigInt(250000000000000000000).toString());
        expect((await jpAddress.balanceOf(await minter.getAddress())).toString()).to.equal(BigInt(500000000000000000000).toString());
        
        // 增加时间并添加流动性
        await increase(3000);
        let deadLineAddLiquidate = timestamp + 1000;
        let busdAmount = BigInt(1000000 * 1e18);
        let btcAmount = BigInt(500000 * 1e18);
        await mockAddLiquidity(router, busdAddress, btcAddress, minter, deadLineAddLiquidate, busdAmount, btcAmount);
        
        // 完成池
        await pledgeAddress.connect(minter).finish(0);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("2"); // 完成状态
        
        let poolDataInfo1 = await pledgeAddress.poolDataInfo(0);
        show({ poolDataInfo1 });
        
        // 燃烧SP代币，提取借贷资金+利息
        let remainSp = await spAddress.balanceOf(await minter.getAddress());
        show({ remainSp });
        await pledgeAddress.connect(minter).withdrawLend(0, remainSp);
        
        // 燃烧JP代币，提取抵押资金
        let remainJp = await jpAddress.balanceOf(await minter.getAddress());
        show({ remainJp });
        await pledgeAddress.connect(minter).withdrawBorrow(0, remainJp, deadLineAddLiquidate);
    });
    
    // 测试用例13：燃烧SP和JP代币，池清算（liquidation状态）
    it("lend burn sp token and borrow burn jp token, pool is liquidation", async function () {
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("0");
        
        // 抵押和借贷
        await btcAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(500 * 1e18));
        let timestamp = await latest();
        let deadLine = timestamp + 100;
        await pledgeAddress.connect(minter).depositBorrow(0, BigInt(500 * 1e18), deadLine);
        
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(1000 * 1e18));
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 增加时间并设置预言机价格
        // await increase(1000);
        await bscPledgeOracle.connect(minter).setPrice(await busdAddress.getAddress(), BigInt(1e8));
        await bscPledgeOracle.connect(minter).setPrice(await btcAddress.getAddress(), BigInt(1e8));
        
        // 结算
        await increase(1000);
        await pledgeAddress.connect(minter).settle(0);
        show(await pledgeAddress.getPoolState(0));
        expect((await pledgeAddress.getPoolState(0)).toString()).to.equal("1");
        
        // 查看池数据
        let poolDataInfo = await pledgeAddress.poolDataInfo(0);
        show({ poolDataInfo });
        
        // 添加铸币者权限并领取代票
        await spAddress.connect(minter).addMinter(await pledgeAddress.getAddress());
        await jpAddress.connect(minter).addMinter(await pledgeAddress.getAddress());
        await pledgeAddress.connect(minter).claimLend(0);
        await pledgeAddress.connect(minter).claimBorrow(0);
        
        // 验证代币余额
        expect((await spAddress.balanceOf(await minter.getAddress())).toString()).to.equal(BigInt(250000000000000000000).toString());
        expect((await jpAddress.balanceOf(await minter.getAddress())).toString()).to.equal(BigInt(500000000000000000000).toString());
        
        // 增加时间并添加流动性
        await increase(3000);
        let deadLineAddLiquidate = timestamp + 1000;
        let busdAmount = BigInt(1000000 * 1e18);
        let btcAmount = BigInt(500000 * 1e18);
        await mockAddLiquidity(router, busdAddress, btcAddress, minter, deadLineAddLiquidate, busdAmount, btcAmount);
        
        // 清算流程
        // 更新预言机价格（BTC价格下跌触发清算）
        await bscPledgeOracle.connect(minter).setPrice(await busdAddress.getAddress(), BigInt(1e8));
        await bscPledgeOracle.connect(minter).setPrice(await btcAddress.getAddress(), BigInt(0.1 * 1e8));
        
        // 检查清算状态
        let result = await pledgeAddress.checkoutLiquidate(0);
        show({ result });
        
        // 执行清算
        await pledgeAddress.connect(minter).liquidate(0);
        let poolDataInfo1 = await pledgeAddress.poolDataInfo(0);
        show({ poolDataInfo1 });
        
        // 燃烧SP代币提取资金
        let remainSp = await spAddress.balanceOf(await minter.getAddress());
        show({ remainSp });
        await pledgeAddress.connect(minter).withdrawLend(0, remainSp);
        
        // 燃烧JP代币提取资金
        let remainJp = await jpAddress.balanceOf(await minter.getAddress());
        show({ remainJp });
        await pledgeAddress.connect(minter).withdrawBorrow(0, remainJp, deadLineAddLiquidate);
    });
    
    // 测试用例14：时间条件测试（时间过早）
    it("time condition,time Before", async function () {
        // 创建池信息
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(2000 * 1e18));
        
        // 存款
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 检查存款信息
        let num = await pledgeAddress.userLendInfo(await minter.getAddress(), 0);
        expect(num[0].toString()).to.be.equal(BigInt(1000000000000000000000).toString());
        
        // 增加大量时间
        await increase(100000);
        
        // 测试跳过，因为使用了不支持的断言语法
        await expect(pledgeAddress.connect(minter).depositLend(0, BigInt(1000*1e18))).to.be.reverted;
    });
    
    // 测试用例15：时间条件测试（领取时间过早）
    it("time condition, time before", async function () {
        // 创建池信息
        await initCreatePoolInfo(pledgeAddress, minter, 100, 200);
        await busdAddress.connect(minter).approve(await pledgeAddress.getAddress(), BigInt(2000 * 1e18));
        
        // 存款
        await pledgeAddress.connect(minter).depositLend(0, BigInt(1000 * 1e18));
        
        // 检查存款信息
        let num = await pledgeAddress.userLendInfo(await minter.getAddress(), 0);
        expect(num[0].toString()).to.be.equal(BigInt(1000000000000000000000).toString());
        
        // 测试跳过，因为使用了不支持的断言语法
        await expect(pledgeAddress.connect(minter).claimLend(0)).to.be.reverted;
    });
});