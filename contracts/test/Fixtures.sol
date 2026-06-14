// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { TestBase } from "./TestBase.sol";
import { StakeAndAdvance } from "../src/StakeAndAdvance.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
import { IERC20 } from "../src/token/IERC20.sol";

contract Fixtures is TestBase {
    MockUSDC internal usdc;
    StakeAndAdvance internal pool;

    address internal reporter = address(0xBEEF);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    address internal company = address(this);

    uint256 internal constant USDC1 = 1e6;
    uint64 internal constant REPAYMENT_WINDOW = 30 days;
    uint64 internal constant GRACE = 7 days;

    function _deployPool(uint16 minReserveBps) internal {
        usdc = new MockUSDC();
        pool = new StakeAndAdvance(
            IERC20(address(usdc)), company, reporter, REPAYMENT_WINDOW, GRACE, minReserveBps
        );
        usdc.mint(address(this), 1_000_000 * USDC1);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(pool), type(uint256).max);
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        _fund(who, amount);
        vm.prank(who);
        shares = pool.deposit(amount);
    }

    function _deliverTerms(uint256 cap, uint64 expiry, uint16 rateBps) internal {
        bytes memory report = abi.encode(company, cap, expiry, rateBps);
        vm.prank(reporter);
        pool.onReport("", report);
    }

    function _farExpiry() internal view returns (uint64) {
        return uint64(block.timestamp + 3650 days);
    }

    function _repayAll() internal {
        uint256 owed = pool.accruedInterest();
        uint256 principal = pool.outstandingPrincipal();
        pool.repay(principal + owed);
    }

    function _profitableCycle(uint256 principal, uint16 rateBps, uint64 elapsed) internal {
        _deliverTerms(principal, _farExpiry(), rateBps);
        pool.drawdown(principal);
        vm.warp(block.timestamp + elapsed);
        _repayAll();
    }
}
