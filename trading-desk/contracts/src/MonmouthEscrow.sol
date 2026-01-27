// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MonmouthEscrow
 * @author Monmouth Team
 * @notice Trustless escrow for agent-to-agent payments on Monmouth L2
 * @dev Implements Trail of Bits security guidelines:
 *      - ReentrancyGuard on all external state-changing functions
 *      - Checks-Effects-Interactions pattern
 *      - Explicit state machine with forward-only transitions
 *      - Comprehensive event logging
 *
 * State Machine:
 *   OPEN -> CLAIMED -> DELIVERED -> RESOLVED
 *                                      ^
 *   OPEN ---(expire after timeout)-----┘
 */
contract MonmouthEscrow is ReentrancyGuard {
    // ═══════════════════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Escrow lifecycle states
    enum State {
        OPEN,      // Created, waiting for provider to claim
        CLAIMED,   // Provider accepted, working on job
        DELIVERED, // Provider submitted work, awaiting approval
        RESOLVED   // Terminal: funds released or refunded
    }

    /// @notice Escrow data structure
    /// @dev Packed for gas efficiency: 2 slots for addresses, 1 for amounts/state
    struct Escrow {
        address client;       // Slot 1: Who locked the funds
        address provider;     // Slot 2: Who receives on success
        uint96 amount;        // Slot 3: Locked amount (max ~79B ETH, sufficient)
        uint32 deadline;      // Slot 3: Unix timestamp for timeout
        State state;          // Slot 3: Current state (1 byte)
        bytes32 jobHash;      // Slot 4: Hash of job description
        bytes32 resultHash;   // Slot 5: Hash of delivered result
    }

    // ═══════════════════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Counter for escrow IDs
    uint256 private _nextEscrowId;

    /// @notice Mapping from escrow ID to escrow data
    mapping(uint256 => Escrow) public escrows;

    /// @notice Total funds locked across all active escrows
    /// @dev Invariant: must equal sum of amounts in OPEN + CLAIMED + DELIVERED escrows
    uint256 public totalLocked;

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Emitted when a new escrow is created
    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed provider,
        uint96 amount,
        bytes32 jobHash,
        uint32 deadline
    );

    /// @notice Emitted when provider claims an escrow
    event EscrowClaimed(uint256 indexed escrowId, address indexed provider);

    /// @notice Emitted when provider delivers work
    event EscrowDelivered(uint256 indexed escrowId, bytes32 resultHash);

    /// @notice Emitted when client releases funds to provider
    event EscrowReleased(
        uint256 indexed escrowId,
        address indexed provider,
        uint96 amount
    );

    /// @notice Emitted when client refunds after timeout
    event EscrowExpired(
        uint256 indexed escrowId,
        address indexed client,
        uint96 amount
    );

    /// @notice Emitted when client disputes delivery
    event EscrowDisputed(uint256 indexed escrowId);

    // ═══════════════════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Thrown when caller is not the escrow client
    error NotClient();

    /// @notice Thrown when caller is not the escrow provider
    error NotProvider();

    /// @notice Thrown when escrow is not in expected state
    error InvalidState(State current, State expected);

    /// @notice Thrown when escrow has expired
    error EscrowExpiredError();

    /// @notice Thrown when escrow has not yet expired
    error EscrowNotExpired();

    /// @notice Thrown when amount is zero
    error ZeroAmount();

    /// @notice Thrown when provider address is invalid
    error InvalidProvider();

    /// @notice Thrown when result hash is empty
    error EmptyResultHash();

    /// @notice Thrown when ETH transfer fails
    error TransferFailed();

    // ═══════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════

    /// @notice Restricts function to escrow client
    modifier onlyClient(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].client) revert NotClient();
        _;
    }

    /// @notice Restricts function to escrow provider
    modifier onlyProvider(uint256 escrowId) {
        if (msg.sender != escrows[escrowId].provider) revert NotProvider();
        _;
    }

    /// @notice Requires escrow to be in specific state
    modifier inState(uint256 escrowId, State expected) {
        State current = escrows[escrowId].state;
        if (current != expected) revert InvalidState(current, expected);
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EXTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Create a new escrow
     * @param provider Address that will receive funds on successful completion
     * @param jobHash Hash of the job description (for verification)
     * @param timeout Seconds until escrow can be refunded
     * @return escrowId The ID of the created escrow
     * @dev
     *   - Caller becomes the client
     *   - msg.value is locked as the escrow amount
     *   - Provider cannot be zero address or same as client
     */
    function create(
        address provider,
        bytes32 jobHash,
        uint32 timeout
    ) external payable nonReentrant returns (uint256 escrowId) {
        // Checks
        if (msg.value == 0) revert ZeroAmount();
        if (msg.value > type(uint96).max) revert ZeroAmount(); // Overflow protection
        if (provider == address(0)) revert InvalidProvider();
        if (provider == msg.sender) revert InvalidProvider();

        // Effects
        escrowId = _nextEscrowId++;
        uint96 amount = uint96(msg.value);
        uint32 deadline = uint32(block.timestamp) + timeout;

        escrows[escrowId] = Escrow({
            client: msg.sender,
            provider: provider,
            amount: amount,
            deadline: deadline,
            state: State.OPEN,
            jobHash: jobHash,
            resultHash: bytes32(0)
        });

        totalLocked += amount;

        emit EscrowCreated(escrowId, msg.sender, provider, amount, jobHash, deadline);
    }

    /**
     * @notice Provider claims an open escrow to begin work
     * @param escrowId The escrow to claim
     * @dev Must be called before deadline
     */
    function claim(uint256 escrowId)
        external
        nonReentrant
        onlyProvider(escrowId)
        inState(escrowId, State.OPEN)
    {
        Escrow storage escrow = escrows[escrowId];

        // Checks
        if (block.timestamp >= escrow.deadline) revert EscrowExpiredError();

        // Effects
        escrow.state = State.CLAIMED;

        emit EscrowClaimed(escrowId, msg.sender);
    }

    /**
     * @notice Provider delivers work result
     * @param escrowId The escrow to deliver for
     * @param resultHash Hash of the delivered result (for verification)
     */
    function deliver(uint256 escrowId, bytes32 resultHash)
        external
        nonReentrant
        onlyProvider(escrowId)
        inState(escrowId, State.CLAIMED)
    {
        // Checks
        if (resultHash == bytes32(0)) revert EmptyResultHash();

        // Effects
        Escrow storage escrow = escrows[escrowId];
        escrow.resultHash = resultHash;
        escrow.state = State.DELIVERED;

        emit EscrowDelivered(escrowId, resultHash);
    }

    /**
     * @notice Client releases funds to provider after satisfactory delivery
     * @param escrowId The escrow to release
     */
    function release(uint256 escrowId)
        external
        nonReentrant
        onlyClient(escrowId)
        inState(escrowId, State.DELIVERED)
    {
        Escrow storage escrow = escrows[escrowId];
        uint96 amount = escrow.amount;
        address provider = escrow.provider;

        // Effects
        escrow.state = State.RESOLVED;
        totalLocked -= amount;

        // Interactions (CEI pattern - transfer last)
        (bool success, ) = provider.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit EscrowReleased(escrowId, provider, amount);
    }

    /**
     * @notice Client refunds escrow after timeout (provider didn't claim)
     * @param escrowId The escrow to expire
     */
    function expire(uint256 escrowId)
        external
        nonReentrant
        onlyClient(escrowId)
        inState(escrowId, State.OPEN)
    {
        Escrow storage escrow = escrows[escrowId];

        // Checks
        if (block.timestamp < escrow.deadline) revert EscrowNotExpired();

        uint96 amount = escrow.amount;
        address client = escrow.client;

        // Effects
        escrow.state = State.RESOLVED;
        totalLocked -= amount;

        // Interactions (CEI pattern - transfer last)
        (bool success, ) = client.call{value: amount}("");
        if (!success) revert TransferFailed();

        emit EscrowExpired(escrowId, client, amount);
    }

    /**
     * @notice Client disputes a delivery (future: arbitration logic)
     * @param escrowId The escrow to dispute
     * @dev Current implementation: emits event for off-chain handling
     *      Future: integrate with arbitration contract
     */
    function dispute(uint256 escrowId)
        external
        nonReentrant
        onlyClient(escrowId)
        inState(escrowId, State.DELIVERED)
    {
        // For MVP: just emit event, handle off-chain
        // Future: lock funds, notify arbitrator, implement resolution
        emit EscrowDisputed(escrowId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @notice Get the current escrow count
     * @return Total number of escrows ever created
     */
    function escrowCount() external view returns (uint256) {
        return _nextEscrowId;
    }

    /**
     * @notice Check if an escrow has expired
     * @param escrowId The escrow to check
     * @return True if past deadline and in OPEN state
     */
    function isExpired(uint256 escrowId) external view returns (bool) {
        Escrow storage escrow = escrows[escrowId];
        return escrow.state == State.OPEN && block.timestamp >= escrow.deadline;
    }

    /**
     * @notice Get full escrow details
     * @param escrowId The escrow to query
     * @return client The escrow client
     * @return provider The escrow provider
     * @return amount The locked amount
     * @return deadline The expiry timestamp
     * @return state The current state
     * @return jobHash The job description hash
     * @return resultHash The result hash (if delivered)
     */
    function getEscrow(uint256 escrowId)
        external
        view
        returns (
            address client,
            address provider,
            uint96 amount,
            uint32 deadline,
            State state,
            bytes32 jobHash,
            bytes32 resultHash
        )
    {
        Escrow storage escrow = escrows[escrowId];
        return (
            escrow.client,
            escrow.provider,
            escrow.amount,
            escrow.deadline,
            escrow.state,
            escrow.jobHash,
            escrow.resultHash
        );
    }
}
