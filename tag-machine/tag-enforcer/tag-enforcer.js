const { scanDynamoDB, getConfig, writeRecordsToDynamoDB, deleteDynamoDBRecord } = require("../util/db");
const CONSTANTS = require("../util/constants");
const AWS = require("aws-sdk");
const plimit = require("p-limit");

const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
const s3 = new AWS.S3();
const rds = new AWS.RDS();
const logger = require("../util/logger").init();
const { tagValueFinder, hasPopulationInstruction } = require("../util/tag-value-finder");

// Get the analysis records
let filterExpression = "begins_with(#pk, :analysis_type)";
let expressionAttributeNames = { "#pk": "_pk" };
let expressionAttributeValues = { ":analysis_type": CONSTANTS.ANALYSIS_OBJECT_TYPE };

const delayedResponse = (delay, fnToRun) => {
    setTimeout(() => {
        fnToRun();
    }, delay);
};

const writeTagsToResource = (resourceId, resourceType, tagSet, delayToReport = 200) =>
    new Promise((resolve) => {
        // Convert tag set to valid api format
        let tagArr = Object.keys(tagSet).map((key) => ({ Key: key, Value: tagSet[key] ? tagSet[key] : "" }));
        let params = {
            Resources: [resourceId],
            Tags: tagArr,
        };

        logger.debug(`starting tag creation promise for ${resourceType} ${resourceId}`);
        switch (resourceType) {
            case CONSTANTS.EC2_OBJECT_TYPE:
            case CONSTANTS.EBS_OBJECT_TYPE:
                // EC2 and ebs volumes
                ec2.createTags(params, (err, data) => {
                    err &&
                        delayedResponse(delayToReport, () => {
                            logger.error(`error processing ${resourceType} resource ${resourceId}: ${err.message}`);
                            resolve();
                        });

                    delayedResponse(delayToReport, () => {
                        logger.debug(`completed tag creation promise for ${resourceType} ${resourceId}`);
                        logger.info(
                            `successfully tagged ${resourceType} resource ${resourceId} with ${JSON.stringify(
                                tagArr,
                                null,
                                1
                            )}`
                        );
                        resolve(data);
                    });
                });
                break;
            case CONSTANTS.S3_OBJECT_TYPE:
                let s3Params = {
                    Bucket: resourceId,
                    Tagging: {
                        TagSet: tagArr,
                    },
                };
                s3.putBucketTagging(s3Params, (err, data) => {
                    err &&
                        delayedResponse(delayToReport, () => {
                            logger.error(`error processing ${resourceType} resource ${resourceId}: ${err.message}`);
                            resolve();
                        });

                    delayedResponse(delayToReport, () => {
                        logger.debug(`completed tag creation promise for ${resourceType} ${resourceId}`);
                        logger.info(
                            `successfully tagged ${resourceType} resource ${resourceId} with ${JSON.stringify(
                                tagArr,
                                null,
                                1
                            )}`
                        );
                        resolve(data);
                    });
                });
                break;
            case CONSTANTS.RDS_OBJECT_TYPE:
                let rdsParams = {
                    ResourceName: resourceId,
                    Tags: tagArr,
                };
                rds.addTagsToResource(rdsParams, (err, data) => {
                    err &&
                        delayedResponse(delayToReport, () => {
                            logger.error(`error processing ${resourceType} resource ${resourceId}: ${err.message}`);
                            resolve();
                        });

                    delayedResponse(delayToReport, () => {
                        logger.debug(`completed tag creation promise for ${resourceType} ${resourceId}`);
                        logger.info(
                            `successfully tagged ${resourceType} resource ${resourceId} with ${JSON.stringify(
                                tagArr,
                                null,
                                1
                            )}`
                        );
                        resolve(data);
                    });
                });
                break;
            default:
                logger.error(`${resourceType} not yet supported`);
                resolve();
        }
    });

const getResourcesWithoutProductTags = (analysisRecords) => {
    // Get a list of resources with no valid product tag - we can't identify them
    let objectsWithoutProductTags = analysisRecords.filter((rec) =>
        rec.unmatchedTags.some((t) => t.toLowerCase() === "product")
    );

    let objectsWithouValidProductTags = analysisRecords.filter((rec) =>
        Object.keys(rec.invalidTags).some((k) => k.toLowerCase() === "product")
    );

    let combinedObjects = [...objectsWithouValidProductTags, ...objectsWithoutProductTags];
    return (mappedInvalidProductsObjects = combinedObjects.map((rec) => {
        let objectType = rec.taggedObj._pk.split("-")[0];
        return {
            objectType,
            objectId:
                rec.taggedObj.Name ||
                rec.taggedObj.InstanceId ||
                rec.taggedObj.VolumeId ||
                rec.taggedObj.DBInstanceIdentifier,
            tags: rec.taggedObj.Tags,
        };
    }));
};

const createNewTagObj = (analysisRecord, config) => {
    let tagsToWrite = {};

    // Enforce the missing and invalid tags
    let unmatchedAndInvalidTags = [...Object.keys(analysisRecord.invalidTags), ...analysisRecord.unmatchedTags];

    unmatchedAndInvalidTags.forEach((tagKey) => {
        if (hasPopulationInstruction(tagKey, config)) {
            //logger.info(`DEBUG: ${analysisRecord.resourceIdentifier} - key: ${tagKey} `);
            let tagValue = tagValueFinder(
                tagKey,
                analysisRecord.matchedTags,
                analysisRecord.objectType,
                analysisRecord.resourceIdentifier,
                config
            );

            tagValue && (tagsToWrite[tagKey] = tagValue);
        }
    });

    // Add the force tags records
    if (analysisRecord.forceAddTags) {
        analysisRecord.forceAddTags.forEach((t) => {
            tagsToWrite = { ...tagsToWrite, ...t };
        });
    }

    return tagsToWrite;
};

const enforceTagsFromAnalysis = () =>
    new Promise((resolve) => {
        // Query for EC2 object types
        scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues).then(
            (analysisRecords) => {
                // iterate through them and generate an object with all results
                const allAnalysis = [];
                //allAnalysis[CONSTANTS.EC2_OBJECT_TYPE] = [];
                //allAnalysis[CONSTANTS.EBS_OBJECT_TYPE] = [];
                //allAnalysis[CONSTANTS.S3_OBJECT_TYPE] = [];
                //allAnalysis[CONSTANTS.RDS_OBJECT_TYPE] = [];

                analysisRecords.forEach((rec) => {
                    let pkSplit = rec.taggedObj._pk.split("-");
                    // Set all the tag records
                    const analysisObj = {
                        _pk: rec._pk,
                        extraTags: rec.extraTags,
                        invalidTags: rec.invalidTags,
                        matchedTags: rec.matchedTags,
                        unmatchedTags: rec.unmatchedTags,
                        originalTags: rec.taggedObj.Tags,
                        forceAddTags: rec.forceAddTags,
                    };

                    // switch on the object type
                    switch (pkSplit[0]) {
                        case CONSTANTS.EC2_OBJECT_TYPE:
                            analysisObj.instanceId = rec.taggedObj.InstanceId;
                            analysisObj.resourceIdentifier = rec.taggedObj.InstanceId;
                            analysisObj.objectType = CONSTANTS.EC2_OBJECT_TYPE;
                            //allAnalysis[CONSTANTS.EC2_OBJECT_TYPE].push({ ...analysisObj });
                            allAnalysis.push(analysisObj);
                            break;
                        case CONSTANTS.EBS_OBJECT_TYPE:
                            analysisObj.volumeId = rec.taggedObj.VolumeId;
                            analysisObj.resourceIdentifier = rec.taggedObj.VolumeId;
                            analysisObj.objectType = CONSTANTS.EBS_OBJECT_TYPE;
                            //allAnalysis[CONSTANTS.EBS_OBJECT_TYPE].push({ ...analysisObj });
                            allAnalysis.push(analysisObj);
                            break;
                        case CONSTANTS.RDS_OBJECT_TYPE:
                            analysisObj.resourceIdentifier = rec.taggedObj.DBInstanceArn;
                            analysisObj.objectType = CONSTANTS.RDS_OBJECT_TYPE;
                            //allAnalysis[CONSTANTS.RDS_OBJECT_TYPE].push({ ...analysisObj });
                            allAnalysis.push(analysisObj);
                            break;
                        case CONSTANTS.S3_OBJECT_TYPE:
                            analysisObj.bucketName = rec.taggedObj.Name;
                            analysisObj.resourceIdentifier = rec.taggedObj.Name;
                            analysisObj.objectType = CONSTANTS.S3_OBJECT_TYPE;
                            //allAnalysis[CONSTANTS.S3_OBJECT_TYPE].push({ ...analysisObj });
                            allAnalysis.push(analysisObj);
                            break;
                    }
                });

                //let objectsWithoutProductTags = getResourcesWithoutProductTags(analysisRecords)
                // require("fs").writeFileSync(
                //     "output/objectsWithoutValidProductTags.json",
                //     JSON.stringify(mappedInvalidProductsObjects, null, 2)
                // );

                //logger.info(`${mappedInvalidProductsObjects.length} objects without a product tag`);

                // Get the config
                getConfig().then((config) => {
                    // Interate over the consolidated analysis record and update AWS per the defined associations in the config
                    // EC2 records
                    const newTagsToWrite = [];

                    allAnalysis.forEach((analysisRec) => {
                        const newResourceTags = createNewTagObj(analysisRec, config);
                        //logger.info(`EC2 instance ${ec2Rec.instanceId}\n ${JSON.stringify(newInstanceTags, null, 2)}`);
                        Object.keys(newResourceTags).length > 0 &&
                            newTagsToWrite.push({
                                resourceId: analysisRec.resourceIdentifier,
                                resourceType: analysisRec.objectType,
                                tagsToWrite: newResourceTags,
                            });
                    });

                    // write to a file temporarily
                    //require("fs").writeFileSync("output/tagsToWrite.json", JSON.stringify(newTagsToWrite, null, 2));
                    //logger.info(`wrote ${newTagsToWrite.length} records to file`);
                    logger.info(`Tagging aws resources...`);

                    let tagPromises = [];
                    const limit = plimit(1);
                    newTagsToWrite.forEach((resource) => {
                        //let keys = Object.keys(resource);

                        const tagPromise = limit(() =>
                            writeTagsToResource(resource.resourceId, resource.resourceType, resource.tagsToWrite)
                        );

                        tagPromises.push(tagPromise);
                    });

                    // Run all the tag promises
                    logger.info(`Processing ${tagPromises.length} tag commands...`);
                    Promise.all(tagPromises)
                        .then(() => {
                            resolve();
                        })
                        .catch(() => {
                            resolve();
                        });
                });
            }
        );
    });

module.exports.enforceTagsFromAnalysis = enforceTagsFromAnalysis;
