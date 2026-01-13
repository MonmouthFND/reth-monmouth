// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title MonmouthVerifier
 * @notice On-chain verification of EIP-712 signatures for identity and payments
 * @dev Used by the Monmouth Wallet SDK for on-chain signature verification
 */
contract MonmouthVerifier is EIP712 {
    using ECDSA for bytes32;

    // ============= Identity Types =============

    bytes32 public constant IDENTITY_TYPEHASH = keccak256(
        "Identity(string id,address controller,string agentType,string capabilities,uint256 nonce,uint256 expiry)"
    );

    // ============= Payment Types =============

    bytes32 public constant PAYMENT_TYPEHASH = keccak256(
        "Payment(address recipient,uint256 amount,address token,string nonce,uint256 expiry,string description)"
    );

    // ============= State =============

    // Track used identity nonces per controller
    mapping(address => mapping(uint256 => bool)) public usedIdentityNonces;

    // Track used payment nonces per signer
    mapping(address => mapping(string => bool)) public usedPaymentNonces;

    // ============= Events =============

    event IdentityVerified(
        string indexed id,
        address indexed controller,
        string agentType,
        uint256 nonce
    );

    event PaymentVerified(
        address indexed recipient,
        address indexed signer,
        uint256 amount,
        string nonce
    );

    // ============= Errors =============

    error SignatureExpired();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error InvalidController();

    // ============= Constructor =============

    constructor() EIP712("MonmouthAgentIdentity", "1") {}

    // ============= Verification Functions =============

    /**
     * @notice Verify an identity signature
     * @param id DID identifier
     * @param controller Controller address
     * @param agentType Type of agent
     * @param capabilities Comma-separated capabilities
     * @param nonce Signature nonce
     * @param expiry Expiration timestamp
     * @param signature EIP-712 signature
     * @return True if signature is valid
     */
    function verifyIdentity(
        string calldata id,
        address controller,
        string calldata agentType,
        string calldata capabilities,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool) {
        // Check expiry
        if (block.timestamp > expiry) {
            return false;
        }

        // Check nonce hasn't been used
        if (usedIdentityNonces[controller][nonce]) {
            return false;
        }

        // Compute struct hash
        bytes32 structHash = keccak256(abi.encode(
            IDENTITY_TYPEHASH,
            keccak256(bytes(id)),
            controller,
            keccak256(bytes(agentType)),
            keccak256(bytes(capabilities)),
            nonce,
            expiry
        ));

        // Verify signature
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        return signer == controller;
    }

    /**
     * @notice Verify an identity signature and mark nonce as used
     * @dev Use this when you want to consume the nonce
     */
    function verifyAndConsumeIdentity(
        string calldata id,
        address controller,
        string calldata agentType,
        string calldata capabilities,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external returns (bool) {
        // Check expiry
        if (block.timestamp > expiry) revert SignatureExpired();

        // Check nonce hasn't been used
        if (usedIdentityNonces[controller][nonce]) revert NonceAlreadyUsed();

        // Compute struct hash
        bytes32 structHash = keccak256(abi.encode(
            IDENTITY_TYPEHASH,
            keccak256(bytes(id)),
            controller,
            keccak256(bytes(agentType)),
            keccak256(bytes(capabilities)),
            nonce,
            expiry
        ));

        // Verify signature
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(signature);

        if (signer != controller) revert InvalidSignature();

        // Mark nonce as used
        usedIdentityNonces[controller][nonce] = true;

        emit IdentityVerified(id, controller, agentType, nonce);
        return true;
    }

    /**
     * @notice Verify a payment signature
     * @param recipient Payment recipient
     * @param amount Payment amount
     * @param token Token address (address(0) for ETH)
     * @param nonce Payment nonce (string)
     * @param expiry Expiration timestamp
     * @param description Payment description
     * @param signature EIP-712 signature
     * @return True if signature is valid
     */
    function verifyPayment(
        address recipient,
        uint256 amount,
        address token,
        string calldata nonce,
        uint256 expiry,
        string calldata description,
        bytes calldata signature
    ) external view returns (bool) {
        // Check expiry
        if (block.timestamp > expiry) {
            return false;
        }

        // Compute struct hash using X402Payment domain
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            recipient,
            amount,
            token,
            keccak256(bytes(nonce)),
            expiry,
            keccak256(bytes(description))
        ));

        // Use different domain for payments
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId)"),
            keccak256("X402Payment"),
            keccak256("1"),
            block.chainid
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signer = digest.recover(signature);

        // Return true if signature is valid (signer is not zero)
        return signer != address(0);
    }

    /**
     * @notice Verify a payment and return the signer
     * @return signer The address that signed the payment
     */
    function verifyPaymentAndGetSigner(
        address recipient,
        uint256 amount,
        address token,
        string calldata nonce,
        uint256 expiry,
        string calldata description,
        bytes calldata signature
    ) external view returns (address signer) {
        // Check expiry
        if (block.timestamp > expiry) revert SignatureExpired();

        // Compute struct hash
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_TYPEHASH,
            recipient,
            amount,
            token,
            keccak256(bytes(nonce)),
            expiry,
            keccak256(bytes(description))
        ));

        // Use X402Payment domain
        bytes32 domainSeparator = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId)"),
            keccak256("X402Payment"),
            keccak256("1"),
            block.chainid
        ));

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        signer = digest.recover(signature);

        if (signer == address(0)) revert InvalidSignature();
    }

    // ============= View Functions =============

    /**
     * @notice Get identity domain separator
     */
    function getIdentityDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Get payment domain separator
     */
    function getPaymentDomainSeparator() external view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId)"),
            keccak256("X402Payment"),
            keccak256("1"),
            block.chainid
        ));
    }

    /**
     * @notice Check if identity nonce is used
     */
    function isIdentityNonceUsed(address controller, uint256 nonce) external view returns (bool) {
        return usedIdentityNonces[controller][nonce];
    }

    /**
     * @notice Check if payment nonce is used
     */
    function isPaymentNonceUsed(address signer, string calldata nonce) external view returns (bool) {
        return usedPaymentNonces[signer][nonce];
    }
}
