// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IMonmouthEscrow
 * @notice Interface for Monmouth Escrow contract
 */
interface IMonmouthEscrow {
    enum EscrowState {
        Created,
        Released,
        Refunded,
        Disputed
    }

    // Events
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

    // Creation
    function createEscrowETH(
        address recipient,
        uint256 duration,
        bytes32 serviceId,
        address arbiter
    ) external payable returns (bytes32 escrowId);

    function createEscrowERC20(
        address recipient,
        address token,
        uint256 amount,
        uint256 duration,
        bytes32 serviceId,
        address arbiter
    ) external returns (bytes32 escrowId);

    function createEscrowWithSignature(
        address depositor,
        address recipient,
        uint256 amount,
        address token,
        uint256 duration,
        string calldata serviceId,
        bytes calldata signature
    ) external payable returns (bytes32 escrowId);

    // Actions
    function release(bytes32 escrowId) external;
    function releaseWithSignature(bytes32 escrowId, bytes calldata signature) external;
    function refund(bytes32 escrowId) external;
    function dispute(bytes32 escrowId, string calldata reason) external;
    function resolveDispute(bytes32 escrowId, uint256 depositorBps) external;

    // View
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
    );

    function isActive(bytes32 escrowId) external view returns (bool);
    function isExpired(bytes32 escrowId) external view returns (bool);
    function getNonce(address account) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}
