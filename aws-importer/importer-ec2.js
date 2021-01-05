const AWS = require("aws-sdk");
const { deleteRecordsByPK, scanDynamoDB } = require("../util/db");
const CONSTANTS = require("../util/constants");
const { v4: uuidv4 } = require("uuid");
const OS = require("os");
const logger = require("../util/logger").init();

// Create EC2 service object
const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });

const clearAndFetchEc2Instances = () => {
    return new Promise(async (resolve, reject) => {
        logger.info(`querying DB for EC2 records...`);
        try {
            let ec2DynamoRecords = await getDynamoEc2Instances();
            logger.info(`found ${ec2DynamoRecords.length} EC2 records in the DB...`);

            // Clear old EC2 records from dynamo table
            if (ec2DynamoRecords.length > 0) {
                logger.info(`deleting ${ec2DynamoRecords.length} records...`);
                await deleteRecordsByPK(
                    CONSTANTS.TABLE_NAME,
                    ec2DynamoRecords.map((ti) => ti[CONSTANTS.PRIMARY_KEY_NAME])
                );
                logger.info(`deleted all EC2 records from the DB`);
            }

            //Query AWS for EC2 instances
            logger.info(`querying AWS EC2 instances...`);
            let ec2Instances = await getAWSEC2Instances();
            logger.info(`${ec2Instances.length} instances found`);
            resolve(ec2Instances);
        } catch (error) {
            reject(`Error deleting and fetching EC2 records. Error ${JSON.stringify(error)}`);
        }
    });
};

const getDynamoEc2Instances = () => {
    let filterExpression = "begins_with(#pk, :ec2_type)";
    let expressionAttributeNames = { "#pk": CONSTANTS.PRIMARY_KEY_NAME };
    let expressionAttributeValues = { ":ec2_type": CONSTANTS.EC2_OBJECT_TYPE };

    // Query for EC2 object types
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
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
        logger.info("Error", err.stack);
        exit && OS.exit(-1);
        return err;
    }
}

module.exports = {
    getAWSEC2Instances,
    getDynamoEc2Instances,
    clearAndFetchEc2Instances,
};
