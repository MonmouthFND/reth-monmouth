// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title MonmouthEscrow
 * @notice Escrow contract for agent-to-agent commerce on Monmouth L2
 * @dev Supports ETH and ERC20 tokens with EIP-712 signature authorization
 */
contract MonmouthEscrow is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ============= Types =============

    enum EscrowState {
        Created,    // Escrow created, funds deposited
        Released,   // Funds released to recipient
        Refunded,   // Funds refunded to depositor
        Disputed    // Escrow in dispute
    }

    struct Escrow {
        address depositor;      // Agent creating the escrow
        address recipient;      // Agent receiving payment
        address token;          // Token address (address(0) for ETH)
        uint256 amount;         // Amount in escrow
        uint256 createdAt;      // Creation timestamp
        uint256 expiresAt;      // Auto-refund timestamp
        bytes32 serviceId;      // Service identifier
        EscrowState state;      // Current state
        address arbiter;        // Optional dispute resolver
    }

    // EIP-712 type hashes
    bytes32 public constant ESCROW_CREATE_TYPEHASH = keccak256(
        "EscrowCreate(address recipient,uint256 amount,address token,uint256 duration,string serviceId,uint256 nonce)"
    );

    bytes32 public constant ESCROW_ACTION_TYPEHASH = keccak256(
        "EscrowAction(bytes32 escrowId,string action,uint256 nonce)"
    );

    // ============= State =============

    mapping(bytes32 => Escrow) public escrows;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => bool) public disputed;

    // Protocol fee (basis points, 100 = 1%)
    uint256 public protocolFeeBps = 50; // 0.5%
    address public feeRecipient;
    address public admin;

    // ============= Events =============

    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed depositor,
        address indexed recipient,
        address token,
        uint256 amount,
        uint256 expiresAt,
        bytes32 serviceId
    );

    event EscrowReleased(
        bytes32 indexed escrowId,
        address indexed recipient,
        uint256 amount,
        uint256 fee
    );

    event EscrowRefunded(
        bytes32 indexed escrowId,
        address indexed depositor,
        uint256 amount
    );

    event EscrowDisputed(
        bytes32 indexed escrowId,
        address indexed disputer,
        string reason
    );

    event DisputeResolved(
        bytes32 indexed escrowId,
        address indexed winner,
        uint256 depositorAmount,
        uint256 recipientAmount
    );

    // ============= Errors =============

    error EscrowNotFound();
    error InvalidState(EscrowState expected, EscrowState actual);
    error NotAuthorized();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidSignature();
    error EscrowExpired();
    error EscrowNotExpired();
    error TransferFailed();

    // ============= Constructor =============

    constructor(address _feeRecipient) EIP712("MonmouthEscrow", "1") {
        admin = msg.sender;
        feeRecipient = _feeRecipient;
    }

    // ============= Escrow Creation =============

    /**
     * @notice Create a new escrow with ETH
     * @param recipient Address to receive funds on release
     * @param duration Duration until auto-refund (seconds)
     * @param serviceId Identifier for the service being purchased
     * @param arbiter Optional arbiter for disputes (address(0) for none)
     */
    function createEscrowETH(
        address recipient,
        uint256 duration,
        bytes32 serviceId,
        address arbiter
    ) external payable nonReentrant returns (bytes32 escrowId) {
        if (msg.value == 0) revert InvalidAmount();
        if (duration == 0 || duration > 365 days) revert InvalidDuration();

        escrowId = _createEscrow(
            msg.sender,
            recipient,
            address(0),
            msg.value,
            duration,
            serviceId,
            arbiter
        );
    }

    /**
     * @notice Create a new escrow with ERC20 token
     * @param recipient Address to receive funds on release
     * @param token ERC20 token address
     * @param amount Amount of tokens to escrow
     * @param duration Duration until auto-refund (seconds)
     * @param serviceId Identifier for the service being purchased
     * @param arbiter Optional arbiter for disputes (address(0) for none)
     */
    function createEscrowERC20(
        address recipient,
        address token,
        uint256 amount,
        uint256 duration,
        bytes32 serviceId,
        address arbiter
    ) external nonReentrant returns (bytes32 escrowId) {
        if (amount == 0) revert InvalidAmount();
        if (duration == 0 || duration > 365 days) revert InvalidDuration();

        // Transfer tokens to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        escrowId = _createEscrow(
            msg.sender,
            recipient,
            token,
            amount,
            duration,
            serviceId,
            arbiter
        );
    }

    /**
     * @notice Create escrow with EIP-712 signature
     * @param recipient Address to receive funds
     * @param amount Amount to escrow
     * @param token Token address (address(0) for ETH)
     * @param duration Escrow duration
     * @param serviceId Service identifier
     * @param signature EIP-712 signature from depositor
     */
    function createEscrowWithSignature(
        address depositor,
        address recipient,
        uint256 amount,
        address token,
        uint256 duration,
        string calldata serviceId,
        bytes calldata signature
    ) external payable nonReentrant returns (bytes32 escrowId) {
        // Verify signature
        bytes32 structHash = keccak256(abi.encode(
            ESCROW_CREATE_TYPEHASH,
            recipient,
            amount,
            token,
            duration,
            keccak256(bytes(serviceId)),
            nonces[depositor]++
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        if (signer != depositor) revert InvalidSignature();

        // Handle funds
        if (token == address(0)) {
            if (msg.value != amount) revert InvalidAmount();
        } else {
            IERC20(token).safeTransferFrom(depositor, address(this), amount);
        }

        escrowId = _createEscrow(
            depositor,
            recipient,
            token,
            amount,
            duration,
            keccak256(bytes(serviceId)),
            address(0)
        );
    }

    // ============= Escrow Actions =============

    /**
     * @notice Release escrow funds to recipient (depositor only)
     * @param escrowId ID of the escrow to release
     */
    function release(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.depositor == address(0)) revert EscrowNotFound();
        if (escrow.state != EscrowState.Created) {
            revert InvalidState(EscrowState.Created, escrow.state);
        }
        if (msg.sender != escrow.depositor) revert NotAuthorized();

        _release(escrowId, escrow);
    }

    /**
     * @notice Release escrow with EIP-712 signature
     * @param escrowId ID of the escrow
     * @param signature EIP-712 signature from depositor
     */
    function releaseWithSignature(
        bytes32 escrowId,
        bytes calldata signature
    ) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.depositor == address(0)) revert EscrowNotFound();
        if (escrow.state != EscrowState.Created) {
            revert InvalidState(EscrowState.Created, escrow.state);
        }

        // Verify signature
        bytes32 structHash = keccak256(abi.encode(
            ESCROW_ACTION_TYPEHASH,
            escrowId,
            keccak256("release"),
            nonces[escrow.depositor]++
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        if (signer != escrow.depositor) revert InvalidSignature();

        _release(escrowId, escrow);
    }

    /**
     * @notice Refund escrow to depositor (after expiry or by recipient)
     * @param escrowId ID of the escrow to refund
     */
    function refund(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.depositor == address(0)) revert EscrowNotFound();
        if (escrow.state != EscrowState.Created) {
            revert InvalidState(EscrowState.Created, escrow.state);
        }

        // Allow refund if expired OR if recipient voluntarily refunds
        bool isExpired = block.timestamp >= escrow.expiresAt;
        bool isRecipient = msg.sender == escrow.recipient;
        bool isDepositor = msg.sender == escrow.depositor;

        if (!isExpired && !isRecipient) {
            if (isDepositor) revert EscrowNotExpired();
            revert NotAuthorized();
        }

        _refund(escrowId, escrow);
    }

    /**
     * @notice Initiate a dispute
     * @param escrowId ID of the escrow to dispute
     * @param reason Reason for the dispute
     */
    function dispute(bytes32 escrowId, string calldata reason) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.depositor == address(0)) revert EscrowNotFound();
        if (escrow.state != EscrowState.Created) {
            revert InvalidState(EscrowState.Created, escrow.state);
        }

        // Only parties can dispute
        if (msg.sender != escrow.depositor && msg.sender != escrow.recipient) {
            revert NotAuthorized();
        }

        escrow.state = EscrowState.Disputed;
        disputed[escrowId] = true;

        emit EscrowDisputed(escrowId, msg.sender, reason);
    }

    /**
     * @notice Resolve a dispute (arbiter only)
     * @param escrowId ID of the disputed escrow
     * @param depositorBps Basis points to depositor (0-10000)
     */
    function resolveDispute(
        bytes32 escrowId,
        uint256 depositorBps
    ) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.depositor == address(0)) revert EscrowNotFound();
        if (escrow.state != EscrowState.Disputed) {
            revert InvalidState(EscrowState.Disputed, escrow.state);
        }
        if (escrow.arbiter == address(0) || msg.sender != escrow.arbiter) {
            if (msg.sender != admin) revert NotAuthorized();
        }

        uint256 depositorAmount = (escrow.amount * depositorBps) / 10000;
        uint256 recipientAmount = escrow.amount - depositorAmount;

        escrow.state = EscrowState.Released;

        // Transfer funds
        if (depositorAmount > 0) {
            _transfer(escrow.token, escrow.depositor, depositorAmount);
        }
        if (recipientAmount > 0) {
            _transfer(escrow.token, escrow.recipient, recipientAmount);
        }

        address winner = depositorBps > 5000 ? escrow.depositor : escrow.recipient;
        emit DisputeResolved(escrowId, winner, depositorAmount, recipientAmount);
    }

    // ============= View Functions =============

    /**
     * @notice Get escrow details
     */
    function getEscrow(bytes32 escrowId) external view returns (
        address depositor,
        address recipient,
        address token,
        uint256 amount,
        uint256 createdAt,
        uint256 expiresAt,
        bytes32 serviceId,
        EscrowState state,
        address arbiter
    ) {
        Escrow storage e = escrows[escrowId];
        return (
            e.depositor,
            e.recipient,
            e.token,
            e.amount,
            e.createdAt,
            e.expiresAt,
            e.serviceId,
            e.state,
            e.arbiter
        );
    }

    /**
     * @notice Check if escrow is active
     */
    function isActive(bytes32 escrowId) external view returns (bool) {
        return escrows[escrowId].state == EscrowState.Created;
    }

    /**
     * @notice Check if escrow is expired
     */
    function isExpired(bytes32 escrowId) external view returns (bool) {
        Escrow storage e = escrows[escrowId];
        return e.state == EscrowState.Created && block.timestamp >= e.expiresAt;
    }

    /**
     * @notice Get current nonce for an address
     */
    function getNonce(address account) external view returns (uint256) {
        return nonces[account];
    }

    /**
     * @notice Get domain separator for EIP-712
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ============= Admin Functions =============

    /**
     * @notice Update protocol fee
     * @param newFeeBps New fee in basis points (max 500 = 5%)
     */
    function setProtocolFee(uint256 newFeeBps) external {
        if (msg.sender != admin) revert NotAuthorized();
        require(newFeeBps <= 500, "Fee too high");
        protocolFeeBps = newFeeBps;
    }

    /**
     * @notice Update fee recipient
     */
    function setFeeRecipient(address newRecipient) external {
        if (msg.sender != admin) revert NotAuthorized();
        feeRecipient = newRecipient;
    }

    /**
     * @notice Transfer admin role
     */
    function transferAdmin(address newAdmin) external {
        if (msg.sender != admin) revert NotAuthorized();
        admin = newAdmin;
    }

    // ============= Internal Functions =============

    function _createEscrow(
        address depositor,
        address recipient,
        address token,
        uint256 amount,
        uint256 duration,
        bytes32 serviceId,
        address arbiter
    ) internal returns (bytes32 escrowId) {
        uint256 expiresAt = block.timestamp + duration;

        escrowId = keccak256(abi.encodePacked(
            depositor,
            recipient,
            token,
            amount,
            block.timestamp,
            serviceId,
            block.number
        ));

        escrows[escrowId] = Escrow({
            depositor: depositor,
            recipient: recipient,
            token: token,
            amount: amount,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            serviceId: serviceId,
            state: EscrowState.Created,
            arbiter: arbiter
        });

        emit EscrowCreated(
            escrowId,
            depositor,
            recipient,
            token,
            amount,
            expiresAt,
            serviceId
        );
    }

    function _release(bytes32 escrowId, Escrow storage escrow) internal {
        uint256 fee = (escrow.amount * protocolFeeBps) / 10000;
        uint256 recipientAmount = escrow.amount - fee;

        escrow.state = EscrowState.Released;

        // Transfer to recipient
        _transfer(escrow.token, escrow.recipient, recipientAmount);

        // Transfer fee
        if (fee > 0 && feeRecipient != address(0)) {
            _transfer(escrow.token, feeRecipient, fee);
        }

        emit EscrowReleased(escrowId, escrow.recipient, recipientAmount, fee);
    }

    function _refund(bytes32 escrowId, Escrow storage escrow) internal {
        uint256 amount = escrow.amount;
        escrow.state = EscrowState.Refunded;

        _transfer(escrow.token, escrow.depositor, amount);

        emit EscrowRefunded(escrowId, escrow.depositor, amount);
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // Allow receiving ETH
    receive() external payable {}
}
