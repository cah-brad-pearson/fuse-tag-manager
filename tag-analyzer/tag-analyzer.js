const CONSTANTS = require("../util/constants.js");
const { v4: uuidv4 } = require("uuid");
const { addDynamoDBRecord, scanDynamoDB, queryDynamoDB, deleteRecordsByPK } = require("../util/db");
const pLimit = require("p-limit");

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
    console.log(`querying dynamodb for all aws objects to analyze...`);
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

const getTagConfig = () => {
    // Query the DB for the config info
    let keyCondition = `#pk = :config_pk`;
    let expressionAttributeNames = {
        "#pk": CONSTANTS.PRIMARY_KEY_NAME,
    };
    let expressionAttributeValues = {
        ":config_pk": CONSTANTS.CONFIG_PK,
    };

    return queryDynamoDB(CONSTANTS.TABLE_NAME, keyCondition, expressionAttributeNames, expressionAttributeValues);
};

async function analyzeTagInfo(taggedObjects) {
    const checkEnforcedTagValue = (tagValue, enforcedValues) => {
        // Try to match the value of the tag
        let tagValueMatched = false;
        if (enforcedValues.length == 0) return true;
        enforcedValues.some((enforcedTagVal) => {
            let lowerInstanceTagValue = tagValue.toLowerCase();
            if (lowerInstanceTagValue === enforcedTagVal) {
                // Tag matches and value matches
                tagValueMatched = true;
                return true;
            }
        });

        return tagValueMatched;
    };

    const isTagKeyInConfigList = (tagKey, configObj) => {
        let matched = false;
        Object.keys(configObj).some((k) => {
            if (
                !matched &&
                k != "enforced_tags" &&
                (tagKey === configObj[k].key || tagKey === configObj[k].alternate_key)
            ) {
                matched = true;
                return true;
            }
        });
        return matched;
    };

    let tagConfig = await getTagConfig();

    if (Array.isArray(tagConfig) && tagConfig.length > 0) {
        let results = [];
        let tagConfigObj = tagConfig[0];

        // Build a list of the enforced tags
        console.log(`Iterating over ${taggedObjects.length} objects...`);
        let objCount = 0;
        taggedObjects.forEach((currTaggedObj) => {
            objCount++;
            const objTagAnalysis = {
                matchedTags: {}, // enforced and value is valid
                unmatchedTags: [], // enforced but not found on instance
                invalidTags: {}, // enforced and found but value is not matched
                extraTags: {}, // Not enforced but found
                taggedObj: { ...currTaggedObj }, // Add the original object for convenience
            };
            //objTagAnalysis[CONSTANTS.PRIMARY_KEY_NAME] = currTaggedObj[CONSTANTS.PRIMARY_KEY_NAME];

            //Loop over the tags in the config info and try to match it to one of the tags in the db object
            tagConfigObj.enforced_tags.forEach((enforcedTag) => {
                let foundTag = false;
                // Add the
                if (!currTaggedObj.Tags) {
                    currTaggedObj.Tags = [];
                }
                currTaggedObj.Tags.some((instanceTag) => {
                    let lowerInstanceTagKey = instanceTag.Key.toLowerCase();
                    let enforcedTagKey = tagConfigObj[enforcedTag].key;
                    let alternateTagKey = tagConfigObj[enforcedTag].alternate_key;
                    // Match on either the tag key or the alternate key
                    if (
                        lowerInstanceTagKey === enforcedTagKey ||
                        (alternateTagKey && lowerInstanceTagKey === alternateTagKey)
                    ) {
                        foundTag = true;
                        if (checkEnforcedTagValue(instanceTag.Value, tagConfigObj[enforcedTag].values)) {
                            // Matched the tag and the value - yea!
                            objTagAnalysis.matchedTags[instanceTag.Key] = instanceTag.Value;
                        } else {
                            //Matched the tag but not the value
                            objTagAnalysis.invalidTags[instanceTag.Key] = instanceTag.Value;
                        }
                        // Break out of the some function since we found this tag
                        return true;
                    }
                });
                if (!foundTag) {
                    // Didn't find the enforced tag
                    objTagAnalysis.unmatchedTags.push(enforcedTag);
                }
            });
            switch (currTaggedObj[CONSTANTS.PRIMARY_KEY_NAME]) {
                case CONSTANTS.EC2_OBJECT_TYPE:
                    console.log(
                        `processed EC2 instance ${currTaggedObj.InstanceId} [${objCount} of ${numOfInstances}]`
                    );
                    break;
                case CONSTANTS.RDS_OBJECT_TYPE:
                    console.log(
                        `processed RDS instance ${currTaggedObj.DBInstanceIdentifier} [${objCount} of ${numOfInstances}]`
                    );
                    break;
            }

            // Loop over each tag in the instance and find the tags that aren't in the master list
            currTaggedObj.Tags.forEach((currTag) => {
                if (!isTagKeyInConfigList(currTag.Key, tagConfigObj)) {
                    objTagAnalysis.extraTags[currTag.Key] = currTag.Value;
                }
            });

            results.push(objTagAnalysis);
        });
        return results;
    } else {
        console.error("couldn't find the config object from dynamodb");
    }
}

const getDynamoAnalysisRecords = () => {
    let filterExpression = "begins_with(#pk, :analysis_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = { ":analysis_type": CONSTANTS.ANALYSIS_OBJECT_TYPE };

    // Query for EC2 object types
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

console.log("clearing the analysis records from the table...");
getDynamoAnalysisRecords()
    .then((analysisRecords) =>
        deleteRecordsByPK(
            CONSTANTS.TABLE_NAME,
            analysisRecords.map((ar) => ar[CONSTANTS.PRIMARY_KEY_NAME])
        )
    )
    .then(() => {
        console.log("table cleared. Querying for all tagged objects...");
        return getDynamoAWSObjects();
    })
    .then((taggedObjects) => {
        console.log(`found ${taggedObjects.length} objects from dynamodb`);
        return analyzeTagInfo(taggedObjects);
    })
    .then((tagAnalysisResults) => {
        console.log(`tag analysis complete. Writing to dynamodb...`);
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
        console.log(
            `${analysisRecordsWritten.length} analysis records written successfully. Tags successfully processed`
        );
    })
    .catch((err) => {
        console.log(`error analyzing tags. Error: ${err.message}`);
    });
