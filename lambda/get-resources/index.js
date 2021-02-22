const AWS = require("aws-sdk");
const lib = require("./lib");
const docClient = new AWS.DynamoDB.DocumentClient({ region: "us-east-1" });

const CONSTANTS = {
    EC2_OBJECT_TYPE: "EC2",
    RDS_OBJECT_TYPE: "RDS",
    EBS_OBJECT_TYPE: "EBS",
    S3_OBJECT_TYPE: "S3",
    TABLE_NAME: "fuse-tag-manager",
};

const handler = (event, context, callback) => {
    console.log(`event: ${JSON.stringify(event, null, 2)}`);
    console.log(`context: ${JSON.stringify(context, null, 2)}`);

    console.log("getting dynamo DB tagging resources...");

    // Query the table for all AWS resources
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
    lib.scanDynamoDB(
        docClient,
        CONSTANTS.TABLE_NAME,
        filterExpression,
        expressionAttributeNames,
        expressionAttributeValues
    )
        .then((results) => {
            let response = {
                statusCode: 200,
                // headers: {
                //     "x-custom-header": "my custom header value",
                // },
            };
            const filteredResults = results.map(filterResults);
            response.body = JSON.stringify(filteredResults);
            console.log(`returning ${filteredResults.length} records`);
            //console.log("filteredResults: " + JSON.stringify(filteredResults, null, 2));
            callback(null, response);
        })
        .catch((error) => {
            console.error(JSON.stringify(error, null, 2));
            callback(null, {
                statusCode: 500,
            });
        });
};

const filterResults = (result) => {
    let retVal = {
        _pk: result._pk,
        tags: result.Tags,
    };

    const resultType = result._pk.split("-")[0];
    switch (resultType) {
        case CONSTANTS.EC2_OBJECT_TYPE: {
            retVal.resourceType = CONSTANTS.EC2_OBJECT_TYPE;
            retVal.instanceId = result.InstanceId;
            retVal.instanceType = result.InstanceType;
            retVal.ipAddress = result.PrivateIpAddress;
            break;
        }
        case CONSTANTS.S3_OBJECT_TYPE: {
            retVal.resourceType = CONSTANTS.S3_OBJECT_TYPE;
            retVal.name = result.Name;
            break;
        }
        case CONSTANTS.EBS_OBJECT_TYPE: {
            retVal.resourceType = CONSTANTS.EBS_OBJECT_TYPE;
            retVal.volumeId = result.Volume;
            retVal.volumeType = result.VolumeType;
            break;
        }
        case CONSTANTS.RDS_OBJECT_TYPE: {
            retVal.resourceType = CONSTANTS.RDS_OBJECT_TYPE;
            retVal.name = result.DBInstanceIdentifier;
            break;
        }
        default: {
            retVal.resourceType = "undefined";
        }
    }

    if (retVal.resourceType != "undefined") {
        return retVal;
    }
};

exports.handler = handler;
