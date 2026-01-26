// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {MonmouthEscrow} from "../src/MonmouthEscrow.sol";

/**
 * @title MonmouthEscrow Tests
 * @notice Comprehensive test suite following Trail of Bits testing guidelines
 * @dev Test categories:
 *      1. Unit tests - Each function in isolation
 *      2. State transition tests - Valid state machine paths
 *      3. Access control tests - Permission boundaries
 *      4. Edge cases - Boundary conditions
 *      5. Invariant tests - Properties that must always hold
 */
contract MonmouthEscrowTest is Test {
    MonmouthEscrow public escrow;

    address public client = makeAddr("client");
    address public provider = makeAddr("provider");
    address public attacker = makeAddr("attacker");

    uint96 constant AMOUNT = 1 ether;
    bytes32 constant JOB_HASH = keccak256("analyze ETH/USD market");
    bytes32 constant RESULT_HASH = keccak256("bullish, 75% confidence");
    uint32 constant TIMEOUT = 1 hours;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed provider,
        uint96 amount,
        bytes32 jobHash,
        uint32 deadline
    );
    event EscrowClaimed(uint256 indexed escrowId, address indexed provider);
    event EscrowDelivered(uint256 indexed escrowId, bytes32 resultHash);
    event EscrowReleased(uint256 indexed escrowId, address indexed provider, uint96 amount);
    event EscrowExpired(uint256 indexed escrowId, address indexed client, uint96 amount);
    event EscrowDisputed(uint256 indexed escrowId);

    function setUp() public {
        escrow = new MonmouthEscrow();
        vm.deal(client, 100 ether);
        vm.deal(provider, 1 ether);
        vm.deal(attacker, 1 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CREATE TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_create_success() public {
        vm.prank(client);
        vm.expectEmit(true, true, true, true);
        emit EscrowCreated(0, client, provider, AMOUNT, JOB_HASH, uint32(block.timestamp) + TIMEOUT);

        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        assertEq(id, 0);
        assertEq(escrow.totalLocked(), AMOUNT);

        (
            address _client,
            address _provider,
            uint96 _amount,
            uint32 _deadline,
            MonmouthEscrow.State _state,
            bytes32 _jobHash,
            bytes32 _resultHash
        ) = escrow.getEscrow(id);

        assertEq(_client, client);
        assertEq(_provider, provider);
        assertEq(_amount, AMOUNT);
        assertEq(_deadline, uint32(block.timestamp) + TIMEOUT);
        assertEq(uint8(_state), uint8(MonmouthEscrow.State.OPEN));
        assertEq(_jobHash, JOB_HASH);
        assertEq(_resultHash, bytes32(0));
    }

    function test_create_multipleEscrows() public {
        vm.startPrank(client);

        uint256 id1 = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);
        uint256 id2 = escrow.create{value: AMOUNT}(provider, keccak256("job2"), TIMEOUT);
        uint256 id3 = escrow.create{value: AMOUNT}(provider, keccak256("job3"), TIMEOUT);

        vm.stopPrank();

        assertEq(id1, 0);
        assertEq(id2, 1);
        assertEq(id3, 2);
        assertEq(escrow.escrowCount(), 3);
        assertEq(escrow.totalLocked(), AMOUNT * 3);
    }

    function test_create_revert_zeroAmount() public {
        vm.prank(client);
        vm.expectRevert(MonmouthEscrow.ZeroAmount.selector);
        escrow.create{value: 0}(provider, JOB_HASH, TIMEOUT);
    }

    function test_create_revert_zeroProvider() public {
        vm.prank(client);
        vm.expectRevert(MonmouthEscrow.InvalidProvider.selector);
        escrow.create{value: AMOUNT}(address(0), JOB_HASH, TIMEOUT);
    }

    function test_create_revert_selfProvider() public {
        vm.prank(client);
        vm.expectRevert(MonmouthEscrow.InvalidProvider.selector);
        escrow.create{value: AMOUNT}(client, JOB_HASH, TIMEOUT);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CLAIM TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_claim_success() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        vm.expectEmit(true, true, false, false);
        emit EscrowClaimed(id, provider);
        escrow.claim(id);

        (, , , , MonmouthEscrow.State state, , ) = escrow.getEscrow(id);
        assertEq(uint8(state), uint8(MonmouthEscrow.State.CLAIMED));
    }

    function test_claim_revert_notProvider() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(attacker);
        vm.expectRevert(MonmouthEscrow.NotProvider.selector);
        escrow.claim(id);
    }

    function test_claim_revert_expired() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.warp(block.timestamp + TIMEOUT + 1);

        vm.prank(provider);
        vm.expectRevert(MonmouthEscrow.EscrowExpiredError.selector);
        escrow.claim(id);
    }

    function test_claim_revert_wrongState() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        // Try to claim again
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(
                MonmouthEscrow.InvalidState.selector,
                MonmouthEscrow.State.CLAIMED,
                MonmouthEscrow.State.OPEN
            )
        );
        escrow.claim(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELIVER TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_deliver_success() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        vm.prank(provider);
        vm.expectEmit(true, false, false, true);
        emit EscrowDelivered(id, RESULT_HASH);
        escrow.deliver(id, RESULT_HASH);

        (, , , , MonmouthEscrow.State state, , bytes32 resultHash) = escrow.getEscrow(id);
        assertEq(uint8(state), uint8(MonmouthEscrow.State.DELIVERED));
        assertEq(resultHash, RESULT_HASH);
    }

    function test_deliver_revert_notProvider() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        vm.prank(attacker);
        vm.expectRevert(MonmouthEscrow.NotProvider.selector);
        escrow.deliver(id, RESULT_HASH);
    }

    function test_deliver_revert_emptyResult() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        vm.prank(provider);
        vm.expectRevert(MonmouthEscrow.EmptyResultHash.selector);
        escrow.deliver(id, bytes32(0));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RELEASE TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_release_success() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        vm.prank(provider);
        escrow.deliver(id, RESULT_HASH);

        uint256 providerBalanceBefore = provider.balance;

        vm.prank(client);
        vm.expectEmit(true, true, false, true);
        emit EscrowReleased(id, provider, AMOUNT);
        escrow.release(id);

        (, , , , MonmouthEscrow.State state, , ) = escrow.getEscrow(id);
        assertEq(uint8(state), uint8(MonmouthEscrow.State.RESOLVED));
        assertEq(provider.balance, providerBalanceBefore + AMOUNT);
        assertEq(escrow.totalLocked(), 0);
    }

    function test_release_revert_notClient() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        vm.prank(provider);
        escrow.deliver(id, RESULT_HASH);

        vm.prank(attacker);
        vm.expectRevert(MonmouthEscrow.NotClient.selector);
        escrow.release(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXPIRE TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_expire_success() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.warp(block.timestamp + TIMEOUT);

        uint256 clientBalanceBefore = client.balance;

        vm.prank(client);
        vm.expectEmit(true, true, false, true);
        emit EscrowExpired(id, client, AMOUNT);
        escrow.expire(id);

        (, , , , MonmouthEscrow.State state, , ) = escrow.getEscrow(id);
        assertEq(uint8(state), uint8(MonmouthEscrow.State.RESOLVED));
        assertEq(client.balance, clientBalanceBefore + AMOUNT);
        assertEq(escrow.totalLocked(), 0);
    }

    function test_expire_revert_notExpired() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(client);
        vm.expectRevert(MonmouthEscrow.EscrowNotExpired.selector);
        escrow.expire(id);
    }

    function test_expire_revert_notClient() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.warp(block.timestamp + TIMEOUT);

        vm.prank(attacker);
        vm.expectRevert(MonmouthEscrow.NotClient.selector);
        escrow.expire(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DISPUTE TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_dispute_emitsEvent() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        vm.prank(provider);
        escrow.deliver(id, RESULT_HASH);

        vm.prank(client);
        vm.expectEmit(true, false, false, false);
        emit EscrowDisputed(id);
        escrow.dispute(id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FULL FLOW TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_fullFlow_happyPath() public {
        // Client creates escrow
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        // Provider claims
        vm.prank(provider);
        escrow.claim(id);

        // Provider delivers
        vm.prank(provider);
        escrow.deliver(id, RESULT_HASH);

        // Client releases
        uint256 providerBalanceBefore = provider.balance;
        vm.prank(client);
        escrow.release(id);

        // Verify final state
        assertEq(provider.balance, providerBalanceBefore + AMOUNT);
        assertEq(escrow.totalLocked(), 0);
    }

    function test_fullFlow_expiredRefund() public {
        // Client creates escrow
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        // Time passes, provider doesn't claim
        vm.warp(block.timestamp + TIMEOUT);

        // Client refunds
        uint256 clientBalanceBefore = client.balance;
        vm.prank(client);
        escrow.expire(id);

        // Verify refund
        assertEq(client.balance, clientBalanceBefore + AMOUNT);
        assertEq(escrow.totalLocked(), 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function testFuzz_create_anyAmount(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(client, uint256(amount));

        vm.prank(client);
        uint256 id = escrow.create{value: amount}(provider, JOB_HASH, TIMEOUT);

        (, , uint96 storedAmount, , , , ) = escrow.getEscrow(id);
        assertEq(storedAmount, amount);
    }

    function testFuzz_create_anyTimeout(uint32 timeout) public {
        // Bound timeout to avoid overflow (max ~136 years from now)
        timeout = uint32(bound(timeout, 0, type(uint32).max - uint32(block.timestamp)));

        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, timeout);

        (, , , uint32 deadline, , , ) = escrow.getEscrow(id);
        assertEq(deadline, uint32(block.timestamp) + timeout);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════════════

    function test_isExpired_false() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        assertFalse(escrow.isExpired(id));
    }

    function test_isExpired_true() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.warp(block.timestamp + TIMEOUT);

        assertTrue(escrow.isExpired(id));
    }

    function test_isExpired_falseAfterClaimed() public {
        vm.prank(client);
        uint256 id = escrow.create{value: AMOUNT}(provider, JOB_HASH, TIMEOUT);

        vm.prank(provider);
        escrow.claim(id);

        vm.warp(block.timestamp + TIMEOUT);

        // Not expired because not in OPEN state
        assertFalse(escrow.isExpired(id));
    }
}
