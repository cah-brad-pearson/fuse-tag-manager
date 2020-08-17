const { v4: uuidv4 } = require("uuid");

const { scanDynamoDB, getConfig, writeRecordsToDynamoDB } = require("../util/db");
const CONSTANTS = require("../util/constants");
const AWS = require("aws-sdk");

const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
const { logger } = require("../util/logger");
const { tagValueFinder, hasPopulationInstruction } = require("../util/tag-value-finder");

// Get the analysis records
let filterExpression = "begins_with(#pk, :analysis_type)";
let expressionAttributeNames = { "#pk": "_pk" };
let expressionAttributeValues = { ":analysis_type": CONSTANTS.ANALYSIS_OBJECT_TYPE };

// Query for EC2 object types
scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues).then(
    (analysisRecords) => {
        // iterate through them and generate an object with all results
        const allAnalysis = {};
        allAnalysis[CONSTANTS.EC2_OBJECT_TYPE] = [];
        allAnalysis[CONSTANTS.EBS_OBJECT_TYPE] = [];
        allAnalysis[CONSTANTS.S3_OBJECT_TYPE] = [];
        allAnalysis[CONSTANTS.RDS_OBJECT_TYPE] = [];

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
            };

            // switch on the object type
            switch (pkSplit[0]) {
                case CONSTANTS.EC2_OBJECT_TYPE:
                    analysisObj.instanceId = rec.taggedObj.InstanceId;
                    analysisObj.resourceIdentifier = rec.taggedObj.InstanceId;
                    analysisObj.objectType = CONSTANTS.EC2_OBJECT_TYPE;
                    allAnalysis[CONSTANTS.EC2_OBJECT_TYPE].push({ ...analysisObj });
                    break;
                case CONSTANTS.EBS_OBJECT_TYPE:
                    analysisObj.volumeId = rec.taggedObj.VolumeId;
                    analysisObj.resourceIdentifier = rec.taggedObj.VolumeId;
                    analysisObj.objectType = CONSTANTS.EBS_OBJECT_TYPE;
                    allAnalysis[CONSTANTS.EBS_OBJECT_TYPE].push({ ...analysisObj });
                    break;
                case CONSTANTS.RDS_OBJECT_TYPE:
                    analysisObj.instanceIdentifier = rec.taggedObj.DBInstanceIdentifier;
                    analysisObj.resourceIdentifier = rec.taggedObj.DBInstanceIdentifier;
                    analysisObj.objectType = CONSTANTS.RDS_OBJECT_TYPE;
                    allAnalysis[CONSTANTS.RDS_OBJECT_TYPE].push({ ...analysisObj });
                    break;
                case CONSTANTS.S3_OBJECT_TYPE:
                    analysisObj.bucketName = rec.taggedObj.Name;
                    analysisObj.resourceIdentifier = rec.taggedObj.Name;
                    analysisObj.objectType = CONSTANTS.S3_OBJECT_TYPE;
                    allAnalysis[CONSTANTS.S3_OBJECT_TYPE].push({ ...analysisObj });
                    break;
            }
        });

        // Get a list of resources with no valid product tag - we can't identify them
        let objectsWithoutProductTags = analysisRecords.filter((rec) =>
            rec.unmatchedTags.some((t) => t.toLowerCase() === "product")
        );

        let objectsWithouValidProductTags = analysisRecords.filter((rec) =>
            Object.keys(rec.invalidTags).some((k) => k.toLowerCase() === "product")
        );

        let combinedObjects = [...objectsWithouValidProductTags, ...objectsWithoutProductTags];
        let mappedInvalidProductsObjects = combinedObjects.map((rec) => {
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
        });

        // require("fs").writeFileSync(
        //     "output/objectsWithoutValidProductTags.json",
        //     JSON.stringify(mappedInvalidProductsObjects, null, 2)
        // );

        logger.info(`${mappedInvalidProductsObjects.length} objects without a product tag`);

        // Get the config
        getConfig().then((config) => {
            // Interate over the consolidated analysis record and update AWS per the defined associations in the config
            // EC2 records
            const newTagsToWrite = [];

            allAnalysis[CONSTANTS.EC2_OBJECT_TYPE].forEach((ec2Rec) => {
                const newInstanceTags = createNewTagObj(ec2Rec, config);
                //logger.info(`EC2 instance ${ec2Rec.instanceId}\n ${JSON.stringify(newInstanceTags, null, 2)}`);
                Object.keys(newInstanceTags.tagsToWrite).length > 0 &&
                    newTagsToWrite.push({ EC2: ec2Rec.instanceId, ...newInstanceTags });
            });

            // RDS instances
            allAnalysis[CONSTANTS.RDS_OBJECT_TYPE].forEach((rdsRec) => {
                const newRdsTags = createNewTagObj(rdsRec, config);
                //logger.info(`RDS instance ${rdsRec.instanceIdentifier}\n ${JSON.stringify(newRdsTags, null, 2)}`);
                Object.keys(newRdsTags.tagsToWrite).length > 0 &&
                    newTagsToWrite.push({ RDS: rdsRec.instanceIdentifier, ...newRdsTags });
            });

            // EBS instances
            allAnalysis[CONSTANTS.EBS_OBJECT_TYPE].forEach((ebsRec) => {
                const newEbsTags = createNewTagObj(ebsRec, config);
                //logger.info(`EBS instance ${ebsRec.volumeId}\n ${JSON.stringify(newEbsTags, null, 2)}`);
                Object.keys(newEbsTags.tagsToWrite).length > 0 &&
                    newTagsToWrite.push({ EBS: ebsRec.volumeId, ...newEbsTags });
            });

            // S3 instances
            allAnalysis[CONSTANTS.S3_OBJECT_TYPE].forEach((s3Rec) => {
                const news3Tags = createNewTagObj(s3Rec, config);
                //logger.info(`S3 bucket ${s3Rec.bucketName}\n ${JSON.stringify(news3Tags, null, 2)}`);
                Object.keys(news3Tags.tagsToWrite).length > 0 &&
                    newTagsToWrite.push({ S3: s3Rec.bucketName, ...news3Tags });
            });

            // write to a file temporarily
            //require("fs").writeFileSync("output/tagsToWrite.json", JSON.stringify(newTagsToWrite, null, 2));
            //logger.info(`wrote ${newTagsToWrite.length} records to file`);
            logger.info(`Tagging EC2 instances...`);

            newTagsToWrite.forEach(async (instance) => {
                let keys = Object.keys(instance);
                switch (keys[0]) {
                    case "EC2":
                        try {
                            await writeTagsToResource(instance.EC2, instance.tagsToWrite);
                            logger.info(
                                `successfully tagged EC2 instance ${instance.EC2} with ${JSON.stringify(
                                    instance.tagsToWrite,
                                    null,
                                    1
                                )}`
                            );
                        } catch (err) {
                            logger.error(`error processing EC2 instance ${instance.InstanceId}: ${err.message}`);
                        }
                        break;
                }
            });
        });
    }
);

const writeTagsToResource = (resourceId, tagSet) => {
    // Convert tag set to valid api format
    let tagArr = Object.keys(tagSet).map((key) => {
        return { Key: key, Value: tagSet[key] ? tagSet[key] : "" };
    });

    let params = {
        Resources: [resourceId],
        Tags: tagArr,
    };

    return new Promise((resolve, reject) => {
        // EC2 and ebs volumes
        ec2.createTags(params, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    // rds.addTagsToResource(params, function (err, data) {
    //     if (err) logger.info(err, err.stack);
    //     // an error occurred
    //     else logger.info(data); // successful response
    // });

    // var params = {
    //     Bucket: "examplebucket",
    //     Tagging: {
    //         TagSet: [
    //             {
    //                 Key: "Key1",
    //                 Value: "Value1",
    //             },
    //             {
    //                 Key: "Key2",
    //                 Value: "Value2",
    //             },
    //         ],
    //     },
    // };
    // s3.putBucketTagging(params, function (err, data) {
    //     if (err) logger.info(err, err.stack);
    //     // an error occurred
    //     else logger.info(data); // successful response
    // });
};

const createNewTagObj = (analysisRecord, config) => {
    const tagsToWrite = {};

    // Enforce the missing and invalid tags
    let unmatchedAndInvalidTags = [...Object.keys(analysisRecord.invalidTags), ...analysisRecord.unmatchedTags];

    unmatchedAndInvalidTags.forEach((tagKey) => {
        if (hasPopulationInstruction(tagKey, config)) {
            //logger.info(`DEBUG: ${analysisRecord.resourceIdentifier} - key: ${tagKey} `);
            tagsToWrite[tagKey] = tagValueFinder(
                tagKey,
                analysisRecord.matchedTags,
                analysisRecord.objectType,
                analysisRecord.resourceIdentifier,
                config
            );
        }
    });

    return { tagsToWrite };
};
