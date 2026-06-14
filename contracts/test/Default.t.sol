// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Fixtures } from "./Fixtures.sol";
import { StakeAndAdvance } from "../src/StakeAndAdvance.sol";

contract DefaultTest is Fixtures {
    function setUp() public {
        _deployPool(0);
    }

    function test_markDefaulted_revertsWithoutDebt() public {
        _deposit(alice, 1000 * USDC1);
        vm.expectRevert(StakeAndAdvance.NoDebt.selector);
        pool.markDefaulted();
    }

    function test_markDefaulted_revertsBeforeWindow() public {
        _deposit(alice, 1000 * USDC1);
        _deliverTerms(1000 * USDC1, _farExpiry(), 1000);
        pool.drawdown(1000 * USDC1);
        vm.expectRevert(StakeAndAdvance.NotDefaultable.selector);
        pool.markDefaulted();
    }

    function test_markDefaulted_writesDownNav_membersLose() public {
        _deposit(alice, 1000 * USDC1);
        _deliverTerms(1000 * USDC1, _farExpiry(), 1000);
        pool.drawdown(600 * USDC1);
        assertEq(pool.cash(), 400 * USDC1, "liquid remainder");

        vm.warp(block.timestamp + REPAYMENT_WINDOW + GRACE + 1);
        vm.prank(bob);
        pool.markDefaulted();

        assertEq(pool.outstandingPrincipal(), 0, "principal written off");
        assertEq(pool.totalDefaultedAmount(), 600 * USDC1, "loss recorded");
        assertEq(pool.totalAssets(), 400 * USDC1, "NAV backing fell");
        assertEq(uint256(pool.navPerShare1e18()), 0.4e18, "NAV dropped to 0.4");
        assertEq(pool.defaulted(), true, "default flag set");

        vm.prank(alice);
        uint256 assets = pool.redeem(1000 * USDC1);
        assertEq(assets, 400 * USDC1, "member takes loss");
    }
}
