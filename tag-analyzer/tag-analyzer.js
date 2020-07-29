const CONSTANTS = require("../util/constants.js");
const { v4: uuidv4 } = require("uuid");
const { addDynamoDBRecord, scanDynamoDB, queryDynamoDB } = require("../util/db");

const getDynamoAWSObjects = () => {
    let filterExpression = "begins_with(#pk, :ec2_type) or begins_with(#pk, :rds_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = { ":ec2_type": CONSTANTS.EC2_OBJECT_TYPE, ":rds_type": CONSTANTS.RDS_OBJECT_TYPE };

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
    const findTagKeyInList = (tagKey, tagKeyList) => {
        return tagKeyList.some((tk) => tagKey === tk);
    };

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

    let tagConfig = await getTagConfig();

    if (Array.isArray(tagConfig) && tagConfig.length > 0) {
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
            };

            //Loop over the tags in the config info and try to match it to one of the tags in the db object
            tagConfigObj.enforced_tags.forEach((enforcedTag) => {
                let foundTag = false;
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
                if (!findTagKeyInList(currTag.Key, enforcedKeys)) {
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

getDynamoAWSObjects()
    .then((taggedObjects) => {
        console.log(`found ${taggedObjects.length} objects from dynamodb`);
        return analyzeTagInfo(taggedObjects);
    })
    .then((tagAnalysisResults) => {
        console.log(`tag analysis complete. Writing to dynamodb...`);
        // Write the tag analysis to dynamodb
        let analysisRecord = {
            createdAt: new Date().toISOString(),
            tagAnalysis: tagAnalysisResults,
        };

        analysisRecord[CONSTANTS.PRIMARY_KEY_NAME] = `${CONSTANTS.ANALYSIS_OBJECT_TYPE}-${uuidv4()}`;

        return addDynamoDBRecord(CONSTANTS.TABLE_NAME, analysisRecord);
    })
    .then(() => {
        console.log("analysis object written successfully. Tags successfully processed");
    })
    .catch((err) => {
        console.log(`error analyzing tags. Error: ${err.message}`);
    });
