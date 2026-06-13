// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { StakeAndAdvance } from "../src/StakeAndAdvance.sol";
import { StakeAndAdvanceHarness } from "./StakeAndAdvance.t.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { TestBase } from "./TestBase.sol";

contract AttestationTest is TestBase {
    uint256 internal constant USDC = 1e6;

    MockUSDC internal token;
    StakeAndAdvanceHarness internal creditLine;

    address internal vendor = address(0xA11CE);
    address internal arbiter = address(0xA4B17E4);
    address internal forwarder = address(0xF04);
    address internal user = address(0xB0B);
    address internal attacker = address(0xBAD);

    function setUp() external {
        token = new MockUSDC();
        vm.prank(vendor);
        creditLine = new StakeAndAdvanceHarness(token, arbiter, forwarder, 10 minutes, 6000);

        token.mint(user, 1_000 * USDC);
        token.mint(vendor, 1_000 * USDC);

        vm.prank(user);
        token.approve(address(creditLine), type(uint256).max);
        vm.prank(vendor);
        token.approve(address(creditLine), type(uint256).max);
    }

    function test_onReport_setsTerms_onlyForwarder() external {
        bytes memory report = abi.encode(vendor, 100 * USDC, uint64(block.timestamp + 1 days), 6500);

        vm.expectRevert(StakeAndAdvance.UnauthorizedReportSender.selector);
        vm.prank(attacker);
        creditLine.onReport("", report);

        vm.prank(forwarder);
        creditLine.onReport("", report);

        assertEq(creditLine.vendorCreditCap(vendor), 100 * USDC, "cap");
        assertEq(creditLine.vendorCapExpiry(vendor), block.timestamp + 1 days, "expiry");
        assertEq(creditLine.vendorCreditAllocationBps(vendor), 6500, "allocation bps");
    }

    function test_drawdown_unlockedAfterAttestation() external {
        vm.prank(user);
        creditLine.deposit(user, 250 * USDC);

        vm.expectRevert(StakeAndAdvance.CreditLimitExceeded.selector);
        vm.prank(vendor);
        creditLine.drawdown(100 * USDC);

        bytes memory report = abi.encode(vendor, 100 * USDC, uint64(block.timestamp + 1 days), 4000);
        vm.prank(forwarder);
        creditLine.onReport("", report);

        vm.prank(vendor);
        creditLine.drawdown(100 * USDC);

        assertEq(creditLine.currentOutstandingDebt(vendor), 100 * USDC, "debt");
    }

    function test_onReport_changesFutureDepositSupply() external {
        bytes memory report = abi.encode(vendor, 175 * USDC, uint64(block.timestamp + 1 days), 7000);

        vm.prank(forwarder);
        creditLine.onReport("", report);

        vm.prank(user);
        uint256 stakeId = creditLine.deposit(user, 250 * USDC);

        (,,, uint256 collateral, uint256 creditAllocation,,,,) = creditLine.stakes(stakeId);

        assertEq(collateral, 75 * USDC, "collateral");
        assertEq(creditAllocation, 175 * USDC, "allocation");
        assertEq(creditLine.vendorCreditAllocationTotal(vendor), 175 * USDC, "total allocation");
    }

    function test_onReport_revertsInvalidCreditAllocationBps() external {
        bytes memory report =
            abi.encode(vendor, 100 * USDC, uint64(block.timestamp + 1 days), 10_001);

        vm.expectRevert(StakeAndAdvance.InvalidCreditAllocationBps.selector);
        vm.prank(forwarder);
        creditLine.onReport("", report);
    }
}
