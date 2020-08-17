const { v4: uuidv4 } = require("uuid");
const pLimit = require("p-limit");

const CONSTANTS = require("../util/constants.js");
const { addDynamoDBRecord, scanDynamoDB, queryDynamoDB, deleteRecordsByPK, getConfig } = require("../util/db");
const { logger } = require("../util/logger");
const { tagValueFinder, hasPopulationInstruction } = require("../util/tag-value-finder");
const { config } = require("aws-sdk");
const TAG_FINDER_VALUES = {
    VALID: "tagValueValid",
    INVALID: "tagValueInvalid",
    NOT_FOUND: "tagKeyNotFound",
    EXTRA: "extraTag",
};

const getDynamoAWSObjects = () => {
    let filterExpression =
        "begins_with(#pk, :ec2_type) or begins_with(#pk, :rds_type) or begins_with(#pk, :ebs_type) or begins_with(#pk, :s3_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = {
        ":ec2_type": CONSTANTS.EC2_OBJECT_TYPE,
        ":rds_type": CONSTANTS.RDS_OBJECT_TYPE,
        ":ebs_type": CONSTANTS.EBS_OBJECT_TYPE,
        ":s3_type": CONSTANTS.S3_OBJECT_TYPE,
    };

    // Query for EC2 object types
    logger.info(`querying dynamodb for all aws objects to analyze...`);
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

async function analyzeTagInfo(taggedObjects) {
    const getEnforcedTagValue = (resource, tagKey, tagValue, config) => {
        let resolvedTagKey = tagKey;

        if (!config[tagKey]) {
            let isResolved = false;
            // Find the correct config key name
            Object.keys(config)
                .filter((k) => k !== CONSTANTS.PRIMARY_KEY_NAME)
                .some((configKey) => {
                    return config[configKey][CONSTANTS.VALID_KEY_NAMES].some((vkv) => {
                        if (vkv === tagKey) {
                            resolvedTagKey = configKey;
                            isResolved = true;
                            return true;
                        }
                    });
                });

            if (!isResolved) return TAG_FINDER_VALUES.EXTRA;
        }

        if (hasPopulationInstruction(resolvedTagKey, config)) {
            let objectType = resource[CONSTANTS.PRIMARY_KEY_NAME].split("-")[0];
            let objectIdentifier =
                resource.InstanceId || resource.DBInstanceIdentifier || resource.Name || resource.VolumeId;

            // Normalize the resource tags to the expected map of key:value
            let resourceTagObj = {};
            resource.Tags.forEach((kvp) => {
                resourceTagObj[kvp.Key] = kvp.Value;
            });

            let value = tagValueFinder(tagKey, resourceTagObj, objectType, objectIdentifier, config);
            return value ? TAG_FINDER_VALUES.VALID : TAG_FINDER_VALUES.INVALID;
        }

        // Just a normal lookup
        // Try to match the value of the tag
        let tagValues = Array.isArray(config[resolvedTagKey].values)
            ? config[resolvedTagKey].values
            : Object.keys(config[resolvedTagKey].values);

        // If there are no enforced values, any value is valid
        if (tagValues.length == 0) {
            return TAG_FINDER_VALUES.VALID;
        }

        let foundTagValue = TAG_FINDER_VALUES.INVALID;
        tagValues.some((enforcedTagVal) => {
            let lowerInstanceTagValue = tagValue.toLowerCase();
            if (lowerInstanceTagValue === enforcedTagVal) {
                // Tag matches
                foundTagValue = TAG_FINDER_VALUES.VALID;
                return true;
            }
        });

        return foundTagValue;
    };

    return new Promise(async (resolve, reject) => {
        let tagConfig = await getConfig();

        if (tagConfig) {
            let results = [];

            // Build a list of the enforced tags
            logger.info(`Iterating over ${taggedObjects.length} objects...`);
            let objCount = 0;
            taggedObjects.slice(0, 100).forEach((currTaggedObj) => {
                objCount++;
                const objTagAnalysis = {
                    matchedTags: {}, // enforced and value is valid
                    unmatchedTags: [], // enforced but not found on instance
                    invalidTags: {}, // enforced and found but value is not matched
                    extraTags: {}, // Not enforced but found
                    taggedObj: { ...currTaggedObj }, // Add the original object for reference
                };

                // Add the base tags object
                if (!currTaggedObj.Tags) {
                    currTaggedObj.Tags = [];
                }

                currTaggedObj.Tags.forEach((resourceTag) => {
                    let lowerResourceTagKey = resourceTag.Key.toLowerCase();
                    let lowerResourceTagValue = resourceTag.Value.toLowerCase();

                    // Check if this value for the tag is valid, invalid or not found as an enforced tag
                    let tagValue = getEnforcedTagValue(
                        currTaggedObj,
                        lowerResourceTagKey,
                        lowerResourceTagValue,
                        tagConfig
                    );

                    switch (tagValue) {
                        case TAG_FINDER_VALUES.VALID:
                            // Matched the tag and the value - yea!
                            objTagAnalysis.matchedTags[resourceTag.Key] = resourceTag.Value;
                            break;
                        case TAG_FINDER_VALUES.INVALID:
                            //Matched the tag but not the value.
                            objTagAnalysis.invalidTags[resourceTag.Key] = resourceTag.Value;
                            break;
                        case TAG_FINDER_VALUES.EXTRA:
                            objTagAnalysis.extraTags[resourceTag.Key] = resourceTag.Value;
                    }
                });

                //Loop over the tags in the config info and try to match it to one of the tags in the db object
                let requiredTags = Object.keys(tagConfig).filter((k) => k !== CONSTANTS.PRIMARY_KEY_NAME);

                requiredTags.forEach((reqTag) => {
                    let validKeys = tagConfig[reqTag][CONSTANTS.VALID_KEY_NAMES];
                    let keyFound = validKeys.some((vk) => {
                        return currTaggedObj.Tags.some((currTag) => currTag.Key.toLowerCase() === vk.toLowerCase());
                    });
                    if (!keyFound) {
                        objTagAnalysis.unmatchedTags.push(reqTag);
                    }
                });

                // Log what we just processed
                let resourceIdentifier = "";
                let resourceType = "";
                const resourceTypeArr = currTaggedObj[CONSTANTS.PRIMARY_KEY_NAME].split("-");
                switch (resourceTypeArr[0]) {
                    case CONSTANTS.EC2_OBJECT_TYPE:
                        resourceIdentifier = currTaggedObj.InstanceId;
                        resourceType = CONSTANTS.EC2_OBJECT_TYPE;
                        break;
                    case CONSTANTS.RDS_OBJECT_TYPE:
                        resourceIdentifier = currTaggedObj.DBInstanceIdentifier;
                        resourceType = CONSTANTS.RDS_OBJECT_TYPE;
                        break;
                    case CONSTANTS.EBS_OBJECT_TYPE:
                        resourceIdentifier = currTaggedObj.VolumeId;
                        resourceType = CONSTANTS.EBS_OBJECT_TYPE;
                        break;
                    case CONSTANTS.S3_OBJECT_TYPE:
                        resourceIdentifier = currTaggedObj.Name;
                        resourceType = CONSTANTS.S3_OBJECT_TYPE;
                        break;
                }

                logger.info(
                    `processed ${resourceType} resource ${resourceIdentifier} [${objCount} of ${taggedObjects.length}]`
                );
                results.push(objTagAnalysis);
            });
            resolve(results);
        } else {
            logger.error("couldn't find the config object from dynamodb");
        }
    });
}

const getDynamoAnalysisRecords = () => {
    let filterExpression = "begins_with(#pk, :analysis_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = { ":analysis_type": CONSTANTS.ANALYSIS_OBJECT_TYPE };

    // Query for EC2 object types
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

logger.info("clearing the analysis records from the table...");
getDynamoAnalysisRecords()
    .then((analysisRecords) =>
        deleteRecordsByPK(
            CONSTANTS.TABLE_NAME,
            analysisRecords.map((ar) => ar[CONSTANTS.PRIMARY_KEY_NAME])
        )
    )
    .then(() => {
        logger.info("table cleared. Querying for all tagged objects...");
        return getDynamoAWSObjects();
    })
    .then((taggedObjects) => {
        logger.info(`found ${taggedObjects.length} objects from dynamodb`);
        return analyzeTagInfo(taggedObjects);
    })
    .then((tagAnalysisResults) => {
        logger.info(`tag analysis complete. Writing to dynamodb...`);
        // Write the tag analysis to dynamodb
        let analysisRecords = tagAnalysisResults.map((rec) => {
            let newRecord = {
                createdAt: new Date().toISOString(),
                ...rec,
            };
            // Add the analysis record PK
            newRecord[CONSTANTS.PRIMARY_KEY_NAME] = `${CONSTANTS.ANALYSIS_OBJECT_TYPE}-${uuidv4()}`;

            return newRecord;
        });

        const limit = pLimit(100);
        let dbAddPromises = analysisRecords.map((ar) => limit(() => addDynamoDBRecord(CONSTANTS.TABLE_NAME, ar)));

        return Promise.all(dbAddPromises);
    })
    .then((analysisRecordsWritten) => {
        logger.info(
            `${analysisRecordsWritten.length} analysis records written successfully. Tags successfully processed`
        );
        process.nextTick(() => process.exit(0));
    })
    .catch((err) => {
        logger.info(`error analyzing tags. Error: ${err.message}`);
    });
