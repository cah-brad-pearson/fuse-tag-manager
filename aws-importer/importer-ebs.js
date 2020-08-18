const AWS = require("aws-sdk");
const { scanDynamoDB, deleteRecordsByPK } = require("../util/db");
const CONSTANTS = require("../util/constants");
const { v4: uuidv4 } = require("uuid");
const OS = require("os");
const logger = require("../util/logger").init();

var ec2 = new AWS.EC2();

const clearAndFetchEBSVolumes = () => {
    return new Promise(async (resolve, reject) => {
        logger.info(`scanning DB for EBS volume records...`);
        try {
            let ebsDynamoRecords = await getDynamoEBSVolumes();
            logger.info(`found ${ebsDynamoRecords.length} EBS records in the DB...`);

            // Clear old EC2 records from dynamo table
            if (ebsDynamoRecords.length > 0) {
                logger.info(`deleting ${ebsDynamoRecords.length} records...`);
                await deleteRecordsByPK(
                    CONSTANTS.TABLE_NAME,
                    ebsDynamoRecords.map((ebr) => ebr[CONSTANTS.PRIMARY_KEY_NAME])
                );
                logger.info(`deleted all EBS volume records from the DB`);
            }

            //Query AWS for EBS volumes
            logger.info(`querying AWS EC2 instances...`);
            let ebsVolumes = await getEBSVolumes();
            logger.info(`${ebsVolumes.length} volumes found`);
            resolve(ebsVolumes);
        } catch (error) {
            reject(`Error deleting and fetching EBS volume records: ${error.message}`);
        }
    });
};

const getDynamoEBSVolumes = () => {
    let filterExpression = "begins_with(#pk, :ebs_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = { ":ebs_type": CONSTANTS.EBS_OBJECT_TYPE };

    // Query for EC2 object types
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

const getEBSVolumes = () => {
    return new Promise((resolve, reject) => {
        let params = {
            MaxResults: 200,
        };

        let ebsRecords = [];
        logger.info("fetching EBS volumes");

        const getNextPage = () => {
            ec2.describeVolumes(params, (err, data) => {
                if (err) {
                    reject(`error querying for ebs volumes. Error: ${err}`);
                }

                try {
                    if (Array.isArray(data.Volumes) && data.Volumes.length > 0) {
                        logger.info(`fetched ${data.Volumes.length} EBS records...`);
                        ebsRecords = [...data.Volumes, ...ebsRecords];
                    }

                    if (data.NextToken) {
                        params.NextToken = data.NextToken;
                        logger.info("getting another page of EBS volume records");
                        getNextPage();
                    } else {
                        logger.info("All EBS volumes are fetched");
                        // Add in the primary key
                        const ebsRecPk = ebsRecords.map((r) => {
                            let newRec = { ...r };
                            newRec[CONSTANTS.PRIMARY_KEY_NAME] = `${CONSTANTS.EBS_OBJECT_TYPE}-${uuidv4()}`;
                            return newRec;
                        });
                        resolve(ebsRecPk);
                    }
                } catch (error) {
                    throw `Error fetching EBS volumes. Error: ${JSON.stringify(error)}`;
                }
            });
        };
        getNextPage();
    });
};

module.exports = {
    getEBSVolumes,
    clearAndFetchEBSVolumes,
};
