// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPublicLock {
    function getHasValidKey(address _owner) external view returns (bool);
}

contract ReceiptAnchorV2 {
    // ---- Roles / Owner
    address public owner;
    modifier onlyOwner() { require(msg.sender == owner, "NOT_OWNER"); _; }

    // ---- Relayers (opcional, ya casi no lo necesitarás)
    mapping(address => bool) public relayers;

    // ---- Pausa
    bool public paused;
    modifier whenNotPaused() { require(!paused, "PAUSED"); _; }

    // ---- Unlock (OBLIGATORIO)
    address public immutable unlockLock;
    error NoValidUnlockKey();
    error NotAuthorized();

    // ---- Datos
    struct Receipt {
        string  cid;
        string  intentId;
        string  spaceDid;
        address relayer;
        uint48  timestamp;
        uint32  blockNo;
    }
    mapping(bytes32 => Receipt) public receipts;

    event ReceiptAnchored(
        bytes32 indexed cidHash,
        string  cid,
        string  intentId,
        string  spaceDid,
        address indexed relayer
    );

    constructor(address _lock) {
        require(_lock != address(0), "LOCK_REQUIRED");
        owner      = msg.sender;
        relayers[msg.sender] = true; // el deployer queda autorizado
        unlockLock = _lock;
    }

    // ---- Admin
    function setRelayer(address a, bool ok) external onlyOwner { relayers[a] = ok; }
    function setPaused(bool p) external onlyOwner { paused = p; }
    function transferOwnership(address n) external onlyOwner { require(n!=address(0),"BAD_OWNER"); owner=n; }

    // ---- Helpers
    function _requireMembership(address beneficiary) internal view {
        if (!IPublicLock(unlockLock).getHasValidKey(beneficiary)) revert NoValidUnlockKey();
    }

    function _requireAuthorized(address beneficiary) internal view {
        // Autorizado si:
        // - Es el beneficiario (caller == beneficiary), o
        // - Es un relayer activo, o
        // - Es el owner.
        if (msg.sender != beneficiary && !relayers[msg.sender] && msg.sender != owner) {
            revert NotAuthorized();
        }
    }

    // ---- Anchor único (Unlock requerido)
    function anchorReceipt(
        string calldata cid,
        string calldata intentId,
        string calldata spaceDid,
        address      beneficiary
    ) external whenNotPaused returns (bytes32 cidHash) {
        _requireMembership(beneficiary);
        _requireAuthorized(beneficiary);

        cidHash = keccak256(bytes(cid));
        require(receipts[cidHash].timestamp == 0, "ALREADY_ANCHORED");

        receipts[cidHash] = Receipt({
            cid: cid,
            intentId: intentId,
            spaceDid: spaceDid,
            relayer: msg.sender,
            timestamp: uint48(block.timestamp),
            blockNo: uint32(block.number)
        });

        emit ReceiptAnchored(cidHash, cid, intentId, spaceDid, msg.sender);
    }

    // ---- Versión simplificada: el beneficiario es el caller
    function anchorReceiptSelf(
        string calldata cid,
        string calldata intentId,
        string calldata spaceDid
    ) external whenNotPaused returns (bytes32 cidHash) {
        _requireMembership(msg.sender); // caller debe tener key
        cidHash = keccak256(bytes(cid));
        require(receipts[cidHash].timestamp == 0, "ALREADY_ANCHORED");

        receipts[cidHash] = Receipt({
            cid: cid,
            intentId: intentId,
            spaceDid: spaceDid,
            relayer: msg.sender,
            timestamp: uint48(block.timestamp),
            blockNo: uint32(block.number)
        });

        emit ReceiptAnchored(cidHash, cid, intentId, spaceDid, msg.sender);
    }

    // ---- Batch
    function anchorBatch(
        string[] calldata cids,
        string[] calldata intentIds,
        string[] calldata spaceDids,
        address[] calldata beneficiaries
    ) external whenNotPaused {
        uint256 n = cids.length;
        require(intentIds.length==n && spaceDids.length==n && beneficiaries.length==n, "LENGTH_MISMATCH");

        for (uint256 i; i<n; i++) {
            _requireMembership(beneficiaries[i]);
            // Autorizado si relayer/owner o si caller es el beneficiario puntual de ese item
            if (msg.sender != beneficiaries[i] && !relayers[msg.sender] && msg.sender != owner) {
                revert NotAuthorized();
            }

            bytes32 cidHash = keccak256(bytes(cids[i]));
            require(receipts[cidHash].timestamp == 0, "DUP_IN_BATCH");

            receipts[cidHash] = Receipt({
                cid: cids[i],
                intentId: intentIds[i],
                spaceDid: spaceDids[i],
                relayer: msg.sender,
                timestamp: uint48(block.timestamp),
                blockNo: uint32(block.number)
            });

            emit ReceiptAnchored(cidHash, cids[i], intentIds[i], spaceDids[i], msg.sender);
        }
    }

    // ---- Lecturas
    function isAnchored(bytes32 cidHash) external view returns (bool) {
        return receipts[cidHash].timestamp != 0;
    }
    function cidHashOf(string calldata cid) external pure returns (bytes32) {
        return keccak256(bytes(cid));
    }
    function getReceipt(bytes32 cidHash) external view returns (Receipt memory) {
        return receipts[cidHash];
    }
}