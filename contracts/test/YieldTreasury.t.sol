// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { StakeAndAdvance } from "../src/StakeAndAdvance.sol";
import { StakeAndAdvanceHarness } from "./StakeAndAdvance.t.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { TestBase } from "./TestBase.sol";

contract YieldTreasuryTest is TestBase {
    uint256 internal constant USDC = 1e6;

    MockUSDC internal token;
    StakeAndAdvanceHarness internal creditLine;

    address internal vendor = address(0xA11CE);
    address internal arbiter = address(0xA4B17E4);
    address internal forwarder = address(0xF04);
    address internal treasury = address(0x77EA5);
    address internal user = address(0xB0B);
    address internal outsider = address(0xBAD);

    function setUp() external {
        token = new MockUSDC();
        vm.prank(vendor);
        creditLine = new StakeAndAdvanceHarness(token, arbiter, forwarder, 10 minutes, 6000);

        vm.prank(vendor);
        creditLine.setTreasury(treasury);

        token.mint(user, 1_000 * USDC);
        token.mint(treasury, 1_000 * USDC);

        vm.prank(user);
        token.approve(address(creditLine), type(uint256).max);
        vm.prank(treasury);
        token.approve(address(creditLine), type(uint256).max);
    }

    function test_treasuryPullsAndReturnsCollateral() external {
        vm.prank(user);
        creditLine.deposit(user, 250 * USDC);

        assertEq(creditLine.collateralReservedTotal(), 150 * USDC, "reserved");

        vm.prank(treasury);
        creditLine.pullCollateralForYield(150 * USDC);

        assertEq(creditLine.collateralInYield(), 150 * USDC, "in yield");
        assertEq(token.balanceOf(treasury), 1_150 * USDC, "treasury balance");
        assertEq(token.balanceOf(address(creditLine)), 100 * USDC, "contract balance");

        vm.prank(treasury);
        creditLine.returnCollateralFromYield(150 * USDC);

        assertEq(creditLine.collateralInYield(), 0, "in yield after return");
        assertEq(token.balanceOf(address(creditLine)), 250 * USDC, "contract balance after return");
    }

    function test_onlyTreasuryPullsCollateral() external {
        vm.prank(user);
        creditLine.deposit(user, 250 * USDC);

        vm.expectRevert(StakeAndAdvance.OnlyTreasury.selector);
        vm.prank(outsider);
        creditLine.pullCollateralForYield(1 * USDC);
    }

    function test_cancelRemovesReservedCollateral() external {
        vm.prank(user);
        uint256 stakeId = creditLine.deposit(user, 250 * USDC);

        vm.prank(user);
        creditLine.cancel(stakeId);

        assertEq(creditLine.collateralReservedTotal(), 0, "reserved");
    }
}
