// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IReceiver } from "./interfaces/IReceiver.sol";
import { IERC20 } from "./token/IERC20.sol";
import { SafeERC20 } from "./token/SafeERC20.sol";
import { ReentrancyGuard } from "./utils/ReentrancyGuard.sol";

contract StakeAndAdvance is IReceiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS = 10_000;

    enum StakeState {
        None,
        Active,
        Cancelled,
        Disputed,
        Resolved
    }

    enum Outcome {
        RefundUser,
        ReleaseToVendor,
        Split
    }

    struct Stake {
        address user;
        address vendor;
        uint256 amount;
        uint256 collateral;
        uint256 creditAllocation;
        uint256 pendingObligation;
        StakeState state;
        uint64 createdAt;
        uint64 disputedAt;
    }

    IERC20 public immutable usdc;
    address public immutable vendor;
    address public arbiter;
    address public keystoneForwarder;
    address public treasury;
    uint64 public disputeWindow;
    uint16 public collateralBps;
    uint256 public nextStakeId = 1;
    uint256 public collateralReservedTotal;
    uint256 public collateralInYield;

    mapping(uint256 stakeId => Stake stake) public stakes;
    mapping(address vendor => uint256 allocation) public vendorCreditAllocationTotal;
    mapping(address vendor => uint256 debt) public currentOutstandingDebt;
    mapping(address vendor => uint256 obligation) public priorityObligation;

    mapping(address vendor => uint256 cap) internal _vendorCreditCap;
    mapping(address vendor => uint64 expiry) internal _vendorCapExpiry;

    event Deposited(
        uint256 indexed stakeId,
        address indexed user,
        address indexed vendor,
        address payer,
        uint256 amount,
        uint256 collateral,
        uint256 creditAllocation
    );
    event DrawnDown(address indexed vendor, uint256 amount, uint256 outstandingDebt);
    event Repaid(address indexed vendor, uint256 amount, uint256 outstandingDebt);
    event TreasuryUpdated(address indexed previousTreasury, address indexed newTreasury);
    event CollateralPulledForYield(address indexed treasury, uint256 amount);
    event CollateralReturnedFromYield(address indexed treasury, uint256 amount);
    event Settled(
        uint256 indexed stakeId,
        address indexed user,
        address indexed vendor,
        uint256 immediateRefund,
        uint256 pendingObligation
    );
    event DisputeRaised(uint256 indexed stakeId, address indexed raisedBy, uint64 disputedAt);
    event DisputeResolved(
        uint256 indexed stakeId,
        Outcome indexed outcome,
        uint256 userAmount,
        uint256 vendorAmount,
        uint256 pendingObligation
    );
    event AutoReleased(uint256 indexed stakeId, uint256 immediateRefund, uint256 pendingObligation);
    event CreditCapUpdated(address indexed vendor, uint256 cap, uint64 expiry);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidCollateralBps();
    error OnlyVendor();
    error OnlyTreasury();
    error OnlyStakeUser();
    error OnlyStakeParty();
    error OnlyArbiter();
    error StakeNotActive();
    error StakeNotDisputed();
    error DisputeWindowOpen();
    error CreditLimitExceeded();
    error RepayTooLarge();
    error UnauthorizedReportSender();

    constructor(
        IERC20 usdc_,
        address arbiter_,
        address keystoneForwarder_,
        uint64 disputeWindow_,
        uint16 collateralBps_
    ) {
        if (address(usdc_) == address(0) || arbiter_ == address(0)) {
            revert InvalidAddress();
        }
        if (collateralBps_ > BPS) revert InvalidCollateralBps();

        usdc = usdc_;
        vendor = msg.sender;
        arbiter = arbiter_;
        keystoneForwarder = keystoneForwarder_;
        treasury = msg.sender;
        disputeWindow = disputeWindow_;
        collateralBps = collateralBps_;
    }

    modifier onlyVendor() {
        if (msg.sender != vendor) revert OnlyVendor();
        _;
    }

    modifier onlyTreasury() {
        if (msg.sender != treasury) revert OnlyTreasury();
        _;
    }

    function deposit(address user, uint256 amount) external nonReentrant returns (uint256 stakeId) {
        if (user == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();

        uint256 collateral = amount * collateralBps / BPS;
        uint256 creditAllocation = amount - collateral;

        stakeId = nextStakeId++;
        stakes[stakeId] = Stake({
            user: user,
            vendor: vendor,
            amount: amount,
            collateral: collateral,
            creditAllocation: creditAllocation,
            pendingObligation: 0,
            state: StakeState.Active,
            createdAt: uint64(block.timestamp),
            disputedAt: 0
        });

        vendorCreditAllocationTotal[vendor] += creditAllocation;
        collateralReservedTotal += collateral;
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(stakeId, user, vendor, msg.sender, amount, collateral, creditAllocation);
    }

    function effectiveCreditLimit(address vendor_) public view returns (uint256) {
        uint256 cap = _activeCreditCap(vendor_);
        uint256 allocation = vendorCreditAllocationTotal[vendor_];
        return cap < allocation ? cap : allocation;
    }

    function availableCredit(address vendor_) external view returns (uint256) {
        uint256 limit = effectiveCreditLimit(vendor_);
        uint256 outstanding = currentOutstandingDebt[vendor_];
        return outstanding >= limit ? 0 : limit - outstanding;
    }

    function vendorCreditCap(address vendor_) external view returns (uint256) {
        return _vendorCreditCap[vendor_];
    }

    function vendorCapExpiry(address vendor_) external view returns (uint64) {
        return _vendorCapExpiry[vendor_];
    }

    function drawdown(uint256 amount) external onlyVendor nonReentrant {
        if (amount == 0) revert InvalidAmount();

        uint256 nextDebt = currentOutstandingDebt[msg.sender] + amount;
        if (nextDebt > effectiveCreditLimit(msg.sender)) revert CreditLimitExceeded();

        currentOutstandingDebt[msg.sender] = nextDebt;
        usdc.safeTransfer(msg.sender, amount);

        emit DrawnDown(msg.sender, amount, nextDebt);
    }

    function repay(uint256 amount) external onlyVendor nonReentrant {
        if (amount == 0) revert InvalidAmount();

        uint256 outstanding = currentOutstandingDebt[msg.sender];
        if (amount > outstanding) revert RepayTooLarge();

        currentOutstandingDebt[msg.sender] = outstanding - amount;
        _reducePriorityObligation(msg.sender, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Repaid(msg.sender, amount, outstanding - amount);
    }

    function setTreasury(address newTreasury) external onlyVendor {
        if (newTreasury == address(0)) revert InvalidAddress();

        address previousTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(previousTreasury, newTreasury);
    }

    function pullCollateralForYield(uint256 amount) external onlyTreasury nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (collateralInYield + amount > collateralReservedTotal) revert InvalidAmount();

        collateralInYield += amount;
        usdc.safeTransfer(treasury, amount);

        emit CollateralPulledForYield(treasury, amount);
    }

    function returnCollateralFromYield(uint256 amount) external onlyTreasury nonReentrant {
        if (amount == 0) revert InvalidAmount();
        if (amount > collateralInYield) revert InvalidAmount();

        collateralInYield -= amount;
        usdc.safeTransferFrom(treasury, address(this), amount);

        emit CollateralReturnedFromYield(treasury, amount);
    }

    function cancel(uint256 stakeId) external nonReentrant {
        Stake storage stake = stakes[stakeId];
        if (stake.state != StakeState.Active) revert StakeNotActive();
        if (msg.sender != stake.user) revert OnlyStakeUser();

        (uint256 immediateRefund, uint256 pendingObligation) =
            _settleByCreditRule(stakeId, StakeState.Cancelled);

        emit Settled(stakeId, stake.user, stake.vendor, immediateRefund, pendingObligation);
    }

    function raiseDispute(uint256 stakeId) external {
        Stake storage stake = stakes[stakeId];
        if (stake.state != StakeState.Active) revert StakeNotActive();
        if (msg.sender != stake.user && msg.sender != stake.vendor) revert OnlyStakeParty();

        stake.state = StakeState.Disputed;
        stake.disputedAt = uint64(block.timestamp);

        emit DisputeRaised(stakeId, msg.sender, uint64(block.timestamp));
    }

    function resolveDispute(uint256 stakeId, Outcome outcome) external nonReentrant {
        if (msg.sender != arbiter) revert OnlyArbiter();

        Stake storage stake = stakes[stakeId];
        if (stake.state != StakeState.Disputed) revert StakeNotDisputed();

        _removeAllocation(stake);
        stake.state = StakeState.Resolved;

        uint256 userAmount;
        uint256 vendorAmount;
        uint256 pendingObligation;

        if (outcome == Outcome.RefundUser) {
            userAmount = stake.amount;
        } else if (outcome == Outcome.ReleaseToVendor) {
            vendorAmount = stake.amount;
        } else {
            userAmount = stake.collateral;
            vendorAmount = stake.creditAllocation;
        }

        if (userAmount != 0) usdc.safeTransfer(stake.user, userAmount);
        if (vendorAmount != 0) usdc.safeTransfer(stake.vendor, vendorAmount);

        emit DisputeResolved(stakeId, outcome, userAmount, vendorAmount, pendingObligation);
    }

    function autoRelease(uint256 stakeId) external nonReentrant {
        Stake storage stake = stakes[stakeId];
        if (stake.state != StakeState.Disputed) revert StakeNotDisputed();
        if (block.timestamp <= stake.disputedAt + disputeWindow) revert DisputeWindowOpen();

        (uint256 immediateRefund, uint256 pendingObligation) =
            _settleByCreditRule(stakeId, StakeState.Resolved);

        emit AutoReleased(stakeId, immediateRefund, pendingObligation);
    }

    function onReport(bytes calldata, bytes calldata report) external virtual override {
        if (msg.sender != keystoneForwarder) revert UnauthorizedReportSender();

        (address reportVendor, uint256 cap, uint64 expiry) =
            abi.decode(report, (address, uint256, uint64));
        _setCreditCap(reportVendor, cap, expiry);
    }

    function _setCreditCap(address vendor_, uint256 cap, uint64 expiry) internal {
        if (vendor_ == address(0)) revert InvalidAddress();
        _vendorCreditCap[vendor_] = cap;
        _vendorCapExpiry[vendor_] = expiry;
        emit CreditCapUpdated(vendor_, cap, expiry);
    }

    function _activeCreditCap(address vendor_) internal view returns (uint256) {
        uint64 expiry = _vendorCapExpiry[vendor_];
        if (expiry != 0 && block.timestamp > expiry) return 0;
        return _vendorCreditCap[vendor_];
    }

    function _attributedDebt(address vendor_, uint256 allocation, uint256 totalAllocation)
        internal
        view
        returns (uint256)
    {
        if (allocation == 0 || totalAllocation == 0) return 0;

        uint256 outstanding = currentOutstandingDebt[vendor_];
        uint256 debtShare = outstanding * allocation / totalAllocation;
        return debtShare > allocation ? allocation : debtShare;
    }

    function _settleByCreditRule(uint256 stakeId, StakeState finalState)
        internal
        returns (uint256 immediateRefund, uint256 pendingObligation)
    {
        Stake storage stake = stakes[stakeId];
        uint256 totalAllocationBeforeSettle = vendorCreditAllocationTotal[stake.vendor];

        pendingObligation =
            _attributedDebt(stake.vendor, stake.creditAllocation, totalAllocationBeforeSettle);
        immediateRefund = stake.amount - pendingObligation;

        stake.pendingObligation = pendingObligation;
        stake.state = finalState;
        _removeAllocation(stake);

        if (pendingObligation != 0) {
            priorityObligation[stake.vendor] += pendingObligation;
        }

        usdc.safeTransfer(stake.user, immediateRefund);
    }

    function _removeAllocation(Stake storage stake) internal {
        vendorCreditAllocationTotal[stake.vendor] -= stake.creditAllocation;
        collateralReservedTotal -= stake.collateral;
    }

    function _reducePriorityObligation(address vendor_, uint256 amount) internal {
        uint256 obligation = priorityObligation[vendor_];
        if (obligation == 0) return;
        priorityObligation[vendor_] = amount >= obligation ? 0 : obligation - amount;
    }
}
