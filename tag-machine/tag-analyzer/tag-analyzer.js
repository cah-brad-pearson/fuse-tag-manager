const { v4: uuidv4 } = require("uuid");
const pLimit = require("p-limit");

const CONSTANTS = require("../util/constants.js");
const { addDynamoDBRecord, scanDynamoDB, deleteRecordsByPK, getConfig } = require("../util/db");
const logger = require("../util/logger").init();
const { tagValueFinder, hasPopulationInstruction } = require("../util/tag-value-finder");
const ec2Ebs = require("./ec2-ebs.js");
const pcfAnalysis = require("./pcf.js");

const TAG_FINDER_STATUS = {
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

const createNewAnalysisRecord = (analysisObj, forceAddTags) => {
    let newAnalysisRec = {
        matchedTags: analysisObj.matchedTags,
        unmatchedTags: analysisObj.unmatchedTags.filter((t) => t != CONSTANTS.PRODUCT_TAG_CATEGORY),
        invalidTags: Object.keys(analysisObj.invalidTags).filter((k) => k != CONSTANTS.PRODUCT_TAG_CATEGORY),
        extraTags: analysisObj.extraTags,
        forceAddTags,
        taggedObj: analysisObj.taggedObj,
    };

    return newAnalysisRec;
};

const ec2EbsMatching = (taggedObjCategories) => {
    // Call EBS to EC2 association function
    let matchedPairs = ec2Ebs.matchEBSandEC2Instances(
        taggedObjCategories[CONSTANTS.EBS_OBJECT_TYPE],
        taggedObjCategories[CONSTANTS.EC2_OBJECT_TYPE]
    );

    // Remove product tag from unmatched or invalid arrays and add the product from the EC2 instance to the forceAdd array
    let newAnalysisRecords = [];
    try {
        matchedPairs.forEach((pair) => {
            const ebsObj = pair[CONSTANTS.EBS_OBJECT_TYPE];
            const ec2Obj = pair[CONSTANTS.EC2_OBJECT_TYPE];
            const ec2ProductTag = Object.keys(ec2Obj.matchedTags).filter((t) => t === CONSTANTS.PRODUCT_TAG_CATEGORY);
            if (ec2ProductTag.length > 0) {
                let forceAddTags = [
                    { [CONSTANTS.PRODUCT_TAG_CATEGORY]: ec2Obj.matchedTags[CONSTANTS.PRODUCT_TAG_CATEGORY] },
                ];
                let newAnalysisRec = createNewAnalysisRecord(ebsObj, forceAddTags);
                newAnalysisRecords.push(newAnalysisRec);
            } else {
                logger.warn(
                    `EBS volume ${ebsObj.taggedObj.VolumeId} is attached to EC2 instance 
                    ${ec2Obj.taggedObj.InstanceId} which doesn't have a valid product tag.
                    EBS volume will not be tagged`
                );
            }
        });
    } catch (e) {
        throw new Error(`error processing EC2->EB2 matchedPairs: ${e.message}`);
    } finally {
        return newAnalysisRecords;
    }
};

const pcfRdsMatching = (taggedObjCategories) => {
    return new Promise((resolve, reject) => {
        getConfig(CONSTANTS.PCF_ORG_PK)
            .then((pcfConfig) => {
                const pcfRdsAnalysisRecords = pcfAnalysis.matchRDSinstancesToPCFOrgs(
                    taggedObjCategories[CONSTANTS.RDS_OBJECT_TYPE],
                    pcfConfig
                );

                return pcfRdsAnalysisRecords;
            })
            .then((analysisRecs) => {
                return new Promise((res, rej) => {
                    getConfig(CONSTANTS.PCF_ORG_LOOKUP_PK).then((config) => {
                        res([analysisRecs, config]);
                    });
                });
            })
            .then((results) => {
                // associate PCF org names with products
                let pcfRdsAnalysisRecs = results[0];
                let config = results[1];

                let newPcfRdsAnalysisRecs = [];
                let analysisRecsAlreadyTagged = [];

                pcfRdsAnalysisRecs.forEach((ar) => {
                    let pcfOrg = ar[CONSTANTS.PCF_ORG];
                    let orgsToProducts = config[CONSTANTS.PCF_CONFIG_ORG_LABEL];
                    let matchedProduct = orgsToProducts[pcfOrg.toLowerCase()];

                    let rdsTaggedProduct = ar[CONSTANTS.RDS_OBJECT_TYPE].matchedTags.product;
                    // Check to see if there is already a product tag
                    if (rdsTaggedProduct) {
                        logger.warn(
                            `RDS instance '${
                                ar[CONSTANTS.RDS_OBJECT_TYPE].resourceIdentifier
                            }' is already tagged to product '${rdsTaggedProduct}'`
                        );

                        // If the instance is already tagged with a product team but the PCF org lookup doesn't match
                        if (
                            matchedProduct &&
                            ar[CONSTANTS.RDS_OBJECT_TYPE].matchedTags.product.toLowerCase() !==
                                matchedProduct.toLowerCase()
                        ) {
                            logger.warn(
                                `RDS instance '${
                                    ar[CONSTANTS.RDS_OBJECT_TYPE].resourceIdentifier
                                }' is tagged to product '${rdsTaggedProduct}'
                            but was created by an application in the PCF org '${pcfOrg}' which is
                            mapped to the team '${matchedProduct}'.Overwriting product tag with '${matchedProduct}'`
                            );
                            newPcfRdsAnalysisRecs.push(
                                createNewAnalysisRecord(ar[CONSTANTS.RDS_OBJECT_TYPE], [
                                    {
                                        [CONSTANTS.PRODUCT_TAG_CATEGORY]: matchedProduct,
                                    },
                                ])
                            );
                        }
                        analysisRecsAlreadyTagged.push([ar, { [CONSTANTS.PRODUCT_TAG_CATEGORY]: matchedProduct }]);
                    } else if (matchedProduct) {
                        // Create a new analysis record
                        let forceAddTags = [{ [CONSTANTS.PRODUCT_TAG_CATEGORY]: matchedProduct }];
                        let newAnalysisRec = createNewAnalysisRecord(ar[CONSTANTS.RDS_OBJECT_TYPE], forceAddTags);
                        newPcfRdsAnalysisRecs.push(newAnalysisRec);
                    } else {
                        logger.warn(`could not find a product match for PCF org '${pcfOrg}'`);
                    }
                });

                resolve(newPcfRdsAnalysisRecs);
            })
            .catch((e) => {
                logger.error(e.message);
                reject();
            });
    });
};

const analyzeTagAssociations = async (taggedObjects) => {
    // There should be a call to each tag association function
    // here and we should return all records from all functions

    const taggedObjCategories = categorizeTaggedObjects(taggedObjects);

    const ec2EbsAnalysisRecs = ec2EbsMatching(taggedObjCategories);

    const pcfRdsAnalysisRecs = await pcfRdsMatching(taggedObjCategories);

    return [...ec2EbsAnalysisRecs, ...pcfRdsAnalysisRecs];
};

const categorizeTaggedObjects = (tagAnalysisObjects) => {
    let objectCategories = {};
    objectCategories[CONSTANTS.EC2_OBJECT_TYPE] = [];
    objectCategories[CONSTANTS.RDS_OBJECT_TYPE] = [];
    objectCategories[CONSTANTS.EBS_OBJECT_TYPE] = [];
    objectCategories[CONSTANTS.S3_OBJECT_TYPE] = [];

    tagAnalysisObjects.forEach((tao) => {
        const resolvedObj = resolveTaggedObject(tao.taggedObj);
        if (Object.keys(resolvedObj).length > 0) {
            const objToPush = {
                ...resolvedObj,
                ...tao,
            };
            objectCategories[resolvedObj.resourceType].push(objToPush);
        }
    });

    return objectCategories;
};

const resolveTaggedObject = (taggedObj) => {
    let resourceIdentifier = "";
    let resourceType = "";

    if (!taggedObj[CONSTANTS.PRIMARY_KEY_NAME]) {
        logger.error(`object ${JSON.stringify(taggedObj, null, 2)} doesn't contain a primary key`);
        return {};
    }

    const resourceTypeArr = taggedObj[CONSTANTS.PRIMARY_KEY_NAME] && taggedObj[CONSTANTS.PRIMARY_KEY_NAME].split("-");
    switch (resourceTypeArr[0]) {
        case CONSTANTS.EC2_OBJECT_TYPE:
            resourceIdentifier = taggedObj.InstanceId;
            resourceType = CONSTANTS.EC2_OBJECT_TYPE;
            break;
        case CONSTANTS.RDS_OBJECT_TYPE:
            resourceIdentifier = taggedObj.DBInstanceIdentifier;
            resourceType = CONSTANTS.RDS_OBJECT_TYPE;
            break;
        case CONSTANTS.EBS_OBJECT_TYPE:
            resourceIdentifier = taggedObj.VolumeId;
            resourceType = CONSTANTS.EBS_OBJECT_TYPE;
            break;
        case CONSTANTS.S3_OBJECT_TYPE:
            resourceIdentifier = taggedObj.Name;
            resourceType = CONSTANTS.S3_OBJECT_TYPE;
            break;
    }

    return {
        resourceIdentifier,
        resourceType,
    };
};

async function analyzeTagDefinitions(taggedObjects) {
    const resolveNormalizedTagKey = (tagKey, config) => {
        if (config[tagKey]) return { resolvedTagKey: tagKey };

        let resolvedTagKey;
        let alternateKeyName;
        // Find the correct config key name
        Object.keys(config)
            .filter((k) => k !== CONSTANTS.PRIMARY_KEY_NAME)
            .some((configKey) => {
                if (!config[configKey][CONSTANTS.VALID_KEY_NAMES]) return false;
                return config[configKey][CONSTANTS.VALID_KEY_NAMES].some((vkv) => {
                    if (vkv === tagKey) {
                        resolvedTagKey = configKey;
                        alternateKeyName = vkv;
                        isResolved = true;
                        return true;
                    }
                });
            });

        return resolvedTagKey ? { resolvedTagKey, alternateKeyName } : { resolvedTagKey: tagKey };
    };

    // The tagKey must be a normalized lookup value. Otherwise, it potentially might not resolve properly
    const getTagStatus = (resource, tagKey, tagValue, config) => {
        let resolvedTagKey = tagKey;

        // we're not managing the key so just return it as extra
        if (!config[tagKey]) return TAG_FINDER_STATUS.EXTRA;

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
            // have to check for an empty string as a valid return value
            return value ? TAG_FINDER_STATUS.VALID : TAG_FINDER_STATUS.INVALID;
        }

        // Just a normal lookup
        // Try to match the value of the tag
        let tagValues = Array.isArray(config[resolvedTagKey].values)
            ? config[resolvedTagKey].values
            : Object.keys(config[resolvedTagKey].values);

        // If there are no enforced values, any value is valid
        if (tagValues.length == 0) {
            return TAG_FINDER_STATUS.VALID;
        }

        let foundTagValue = TAG_FINDER_STATUS.INVALID;
        tagValues.some((enforcedTagVal) => {
            let lowerInstanceTagValue = tagValue.toLowerCase();
            if (lowerInstanceTagValue === enforcedTagVal) {
                // Tag matches
                foundTagValue = TAG_FINDER_STATUS.VALID;
                return true;
            }
        });

        return foundTagValue;
    };

    return new Promise(async (resolve, reject) => {
        let tagConfig = await getConfig();

        if (!Object.keys(tagConfig).length > 0) {
            reject("config object not found");
        } else {
            let results = [];

            // Build a list of the enforced tags
            logger.info(`Iterating over ${taggedObjects.length} objects...`);
            let objCount = 0;
            taggedObjects.forEach((currTaggedObj) => {
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
                    // Check if this value for the tag is valid, invalid or not found as an enforced tag
                    let normalizedTagKey = resolveNormalizedTagKey(resourceTag.Key, tagConfig);
                    let tagStatus = getTagStatus(
                        currTaggedObj,
                        normalizedTagKey.resolvedTagKey,
                        resourceTag.Value.toLowerCase(),
                        tagConfig
                    );

                    // In order to not have duplicate key definitions in the config, some keys that are equivalent are found in the
                    // alternate key names config. We want to switch back to that original key name when we write the final tag key and value
                    let finalKeyName = normalizedTagKey.alternateKeyName
                        ? normalizedTagKey.alternateKeyName
                        : normalizedTagKey.resolvedTagKey;

                    switch (tagStatus) {
                        case TAG_FINDER_STATUS.VALID:
                            // Matched the tag and the value - yea!
                            objTagAnalysis.matchedTags[finalKeyName] = resourceTag.Value;
                            break;
                        case TAG_FINDER_STATUS.INVALID:
                            //Matched the tag but not the value.
                            objTagAnalysis.invalidTags[finalKeyName] = resourceTag.Value;
                            break;
                        case TAG_FINDER_STATUS.EXTRA:
                            objTagAnalysis.extraTags[finalKeyName] = resourceTag.Value;
                    }
                });

                //Stripping out the primary key object from the database objects to get just the map of required tags
                let requiredTags = Object.keys(tagConfig).filter((k) => k !== CONSTANTS.PRIMARY_KEY_NAME);

                // Looping over the required tags to find ones that are not in the object
                // so we know which objects need to have required tags populated
                requiredTags.forEach((reqTag) => {
                    let normalizedTagKey = resolveNormalizedTagKey(reqTag, tagConfig);
                    let validKeys = tagConfig[reqTag][CONSTANTS.VALID_KEY_NAMES];
                    let keyFound = validKeys.some((vk) => {
                        return currTaggedObj.Tags.some((currTag) => currTag.Key.toLowerCase() === vk.toLowerCase());
                    });
                    if (!keyFound) {
                        objTagAnalysis.unmatchedTags.push(normalizedTagKey.resolvedTagKey);
                    }
                });

                // Log what we just processed
                let objectCategories = resolveTaggedObject(currTaggedObj);
                logger.info(
                    `processed ${objectCategories.resourceType} resource ${objectCategories.resourceIdentifier} [${objCount} of ${taggedObjects.length}]`
                );
                results.push(objTagAnalysis);
            });
            resolve(results);
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

const processTagAnalysis = () =>
    new Promise((resolve, reject) => {
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
            // Analyze the tag definitions (associations defined in config file)
            .then((taggedObjects) => {
                logger.info(`found ${taggedObjects.length} objects from dynamodb`);
                return analyzeTagDefinitions(taggedObjects);
            })
            // Analyze the tag associations not defined in the config (eg. EBS - EC2 association)
            .then((tagDefinitionAnalysis) => {
                return new Promise((resolve, reject) => {
                    analyzeTagAssociations(tagDefinitionAnalysis)
                        .then((tagAssociationAnalysis) => {
                            resolve([tagAssociationAnalysis, tagDefinitionAnalysis]);
                        })
                        .catch((err) => {
                            reject(err);
                        });
                });
            })
            .then((results) => {
                let tagAssociationAnalysis = results[0];
                let tagDefinitionAnalysis = results[1];

                const arrayIncludes = (arrayToMatch, tagAnalysisObj) => {
                    return arrayToMatch.some((el) => {
                        let normalizedElement = resolveTaggedObject(el.taggedObj);
                        let normalizedAnalysisObj = resolveTaggedObject(tagAnalysisObj.taggedObj);
                        return (
                            normalizedElement.resourceIdentifier === normalizedAnalysisObj.resourceIdentifier &&
                            normalizedElement.resourceType === normalizedAnalysisObj.resourceType
                        );
                    });
                };

                // Remove the newly defined tag association analysis object from the tag definition objects since they should override them
                let tagAnalysisNoDupes = tagDefinitionAnalysis.filter(
                    (tda) => !arrayIncludes(tagAssociationAnalysis, tda)
                );

                let tagAnalysisResults = [...tagAnalysisNoDupes, ...tagAssociationAnalysis];

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
                let dbAddPromises = analysisRecords.map((ar) =>
                    limit(() => addDynamoDBRecord(CONSTANTS.TABLE_NAME, ar))
                );

                return Promise.all(dbAddPromises);
            })
            .then((analysisRecordsWritten) => {
                process.nextTick(() => {
                    logger.info(
                        `${analysisRecordsWritten.length} analysis records written successfully. Tags successfully processed`
                    );
                    resolve();
                });
            })
            .catch((err) => {
                process.nextTick(() => {
                    logger.info(`error analyzing tags. Error: ${err.message}`);
                    reject();
                });
            });
    });

module.exports.analyzeTagInfo = processTagAnalysis;
