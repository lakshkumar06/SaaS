// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { StakeAndAdvanceHarness } from "./StakeAndAdvance.t.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { TestBase } from "./TestBase.sol";

contract PlatformTrackRecordTest is TestBase {
    uint256 internal constant USDC = 1e6;

    MockUSDC internal token;
    StakeAndAdvanceHarness internal creditLine;

    address internal vendor = address(0xA11CE);
    address internal arbiter = address(0xA4B17E4);
    address internal forwarder = address(0xF04);
    address internal user = address(0xB0B);

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

    function test_platformTrackRecord_countsOnTimeRepayment() external {
        vm.warp(100);
        _depositAndDraw();

        vm.warp(100 + 29 days);
        vm.prank(vendor);
        creditLine.repay(100 * USDC);

        (
            uint256 drawdownCount,
            uint256 repaymentCount,
            uint256 onTimeCount,
            uint256 lateCount,
            uint256 repaidAmount,
            uint256 outstandingDebt,
            uint64 debtDueAt
        ) = creditLine.platformTrackRecord(vendor);

        assertEq(drawdownCount, 1, "drawdowns");
        assertEq(repaymentCount, 1, "repayments");
        assertEq(onTimeCount, 1, "on time");
        assertEq(lateCount, 0, "late");
        assertEq(repaidAmount, 100 * USDC, "repaid");
        assertEq(outstandingDebt, 0, "outstanding");
        assertEq(debtDueAt, 0, "due reset");
    }

    function test_platformTrackRecord_countsLateRepayment() external {
        vm.warp(100);
        _depositAndDraw();

        vm.warp(100 + 31 days);
        vm.prank(vendor);
        creditLine.repay(100 * USDC);

        (,, uint256 onTimeCount, uint256 lateCount,,,) = creditLine.platformTrackRecord(vendor);

        assertEq(onTimeCount, 0, "on time");
        assertEq(lateCount, 1, "late");
    }

    function test_platformTrackRecord_keepsDueDateUntilDebtClears() external {
        vm.warp(100);
        _depositAndDraw();

        vm.prank(vendor);
        creditLine.repay(40 * USDC);

        (, uint256 repaymentCount,,,, uint256 outstandingDebt, uint64 debtDueAt) =
            creditLine.platformTrackRecord(vendor);

        assertEq(repaymentCount, 0, "no closed cycle");
        assertEq(outstandingDebt, 60 * USDC, "outstanding");
        assertEq(debtDueAt, 100 + 30 days, "due date");
    }

    function _depositAndDraw() internal {
        vm.prank(user);
        creditLine.deposit(user, 250 * USDC);
        creditLine.setCreditCap(vendor, 100 * USDC, 0);

        vm.prank(vendor);
        creditLine.drawdown(100 * USDC);
    }
}
