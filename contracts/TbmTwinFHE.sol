// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract TbmTwinFHE is SepoliaConfig {
    struct EncryptedTBMData {
        uint256 id;
        euint32 encryptedPosition;
        euint32 encryptedTorque;
        euint32 encryptedSpeed;
        euint32 encryptedSoilType;
        uint256 timestamp;
    }

    struct DecryptedTBMData {
        string position;
        string torque;
        string speed;
        string soilType;
        bool isRevealed;
    }

    uint256 public tbmDataCount;
    mapping(uint256 => EncryptedTBMData) public encryptedTBMRecords;
    mapping(uint256 => DecryptedTBMData) public decryptedTBMRecords;

    mapping(string => euint32) private encryptedSoilTypeCount;
    string[] private soilTypeList;

    mapping(uint256 => uint256) private requestToDataId;

    event TBMDataSubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event TBMDataDecrypted(uint256 indexed id);

    modifier onlyOperator(uint256 dataId) {
        _;
    }

    function submitEncryptedTBMData(
        euint32 encryptedPosition,
        euint32 encryptedTorque,
        euint32 encryptedSpeed,
        euint32 encryptedSoilType
    ) public {
        tbmDataCount += 1;
        uint256 newId = tbmDataCount;

        encryptedTBMRecords[newId] = EncryptedTBMData({
            id: newId,
            encryptedPosition: encryptedPosition,
            encryptedTorque: encryptedTorque,
            encryptedSpeed: encryptedSpeed,
            encryptedSoilType: encryptedSoilType,
            timestamp: block.timestamp
        });

        decryptedTBMRecords[newId] = DecryptedTBMData({
            position: "",
            torque: "",
            speed: "",
            soilType: "",
            isRevealed: false
        });

        emit TBMDataSubmitted(newId, block.timestamp);
    }

    function requestTBMDataDecryption(uint256 dataId) public onlyOperator(dataId) {
        EncryptedTBMData storage record = encryptedTBMRecords[dataId];
        require(!decryptedTBMRecords[dataId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(record.encryptedPosition);
        ciphertexts[1] = FHE.toBytes32(record.encryptedTorque);
        ciphertexts[2] = FHE.toBytes32(record.encryptedSpeed);
        ciphertexts[3] = FHE.toBytes32(record.encryptedSoilType);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptTBMData.selector);
        requestToDataId[reqId] = dataId;

        emit DecryptionRequested(dataId);
    }

    function decryptTBMData(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dataId = requestToDataId[requestId];
        require(dataId != 0, "Invalid request");

        EncryptedTBMData storage eData = encryptedTBMRecords[dataId];
        DecryptedTBMData storage dData = decryptedTBMRecords[dataId];
        require(!dData.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        dData.position = results[0];
        dData.torque = results[1];
        dData.speed = results[2];
        dData.soilType = results[3];
        dData.isRevealed = true;

        if (!FHE.isInitialized(encryptedSoilTypeCount[dData.soilType])) {
            encryptedSoilTypeCount[dData.soilType] = FHE.asEuint32(0);
            soilTypeList.push(dData.soilType);
        }
        encryptedSoilTypeCount[dData.soilType] = FHE.add(
            encryptedSoilTypeCount[dData.soilType],
            FHE.asEuint32(1)
        );

        emit TBMDataDecrypted(dataId);
    }

    function getDecryptedTBMData(uint256 dataId) public view returns (
        string memory position,
        string memory torque,
        string memory speed,
        string memory soilType,
        bool isRevealed
    ) {
        DecryptedTBMData storage r = decryptedTBMRecords[dataId];
        return (r.position, r.torque, r.speed, r.soilType, r.isRevealed);
    }

    function getEncryptedSoilTypeCount(string memory soilType) public view returns (euint32) {
        return encryptedSoilTypeCount[soilType];
    }

    function requestSoilTypeCountDecryption(string memory soilType) public {
        euint32 count = encryptedSoilTypeCount[soilType];
        require(FHE.isInitialized(count), "Soil type not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptSoilTypeCount.selector);
        requestToDataId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(soilType)));
    }

    function decryptSoilTypeCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 soilHash = requestToDataId[requestId];
        string memory soilType = getSoilTypeFromHash(soilHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getSoilTypeFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < soilTypeList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(soilTypeList[i]))) == hash) {
                return soilTypeList[i];
            }
        }
        revert("Soil type not found");
    }
}