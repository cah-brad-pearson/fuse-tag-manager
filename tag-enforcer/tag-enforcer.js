const CONSTANTS = require("../util/constants.js");
const { addDynamoDBRecord, scanDynamoDB, queryDynamoDB, deleteRecordsByPK } = require("../util/db");

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
            };

            // switch on the object type
            switch (pkSplit[0]) {
                case CONSTANTS.EC2_OBJECT_TYPE:
                    analysisObj.instanceId = rec.taggedObj.instanceId;
                    allAnalysis[CONSTANTS.EC2_OBJECT_TYPE].push({ ...analysisObj });
                    break;
                case CONSTANTS.EBS_OBJECT_TYPE:
                    analysisObj.volumeId = rec.taggedObj.VolumeId;
                    allAnalysis[CONSTANTS.EBS_OBJECT_TYPE].push({ ...analysisObj });
                    break;
                case CONSTANTS.RDS_OBJECT_TYPE:
                    analysisObj.instanceIdentifier = rec.taggedObj.DBInstanceIdentifier;
                    allAnalysis[CONSTANTS.RDS_OBJECT_TYPE].push({ ...analysisObj });
                    break;
                case CONSTANTS.S3_OBJECT_TYPE:
                    analysisObj.bucketName = rec.taggedObj.Name;
                    allAnalysis[CONSTANTS.S3_OBJECT_TYPE].push({ ...analysisObj });
                    break;
            }
        });

        // Output the results
        require("fs").writeFileSync("./output/tag-results.json", JSON.stringify(allAnalysis));
    }
);
