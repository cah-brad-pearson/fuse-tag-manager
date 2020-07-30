const AWS = require("aws-sdk");
const utils = require("../util/db");
const CONSTANTS = require("../util/constants");
const { v4: uuidv4 } = require("uuid");
const OS = require("os");

// Create EC2 service object
const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });

const getDynamoEc2Instances = () => {
    let filterExpression = "begins_with(#pk, :ec2_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = { ":ec2_type": CONSTANTS.EC2_OBJECT_TYPE };

    // Query for EC2 object types
    return utils.scanDynamoDB(
        CONSTANTS.TABLE_NAME,
        filterExpression,
        expressionAttributeNames,
        expressionAttributeValues
    );
};

const getAWSEC2Instances = (params) => {
    return new Promise((resolve, reject) => {
        let instances = [];
        // Call EC2 to retrieve policy for selected bucket
        ec2.describeInstances(params, (err, data) => {
            checkError(err) && reject(err);
            data.Reservations.forEach((r) => {
                r.Instances.forEach((instance) => {
                    // Add in the dynamodb primary key for each instance
                    let newInstance = {
                        ...instance,
                    };
                    newInstance[CONSTANTS.PRIMARY_KEY_NAME] = `${CONSTANTS.EC2_OBJECT_TYPE}-${uuidv4()}`;
                    instances.push(newInstance);
                });
            });
            resolve(instances);
        });
    });
};

function checkError(err, exit = false) {
    if (err) {
        console.log("Error", err.stack);
        exit && OS.exit(-1);
        return err;
    }
}

module.export = {
    getAWSEC2Instances,
    getDynamoEc2Instances,
};
