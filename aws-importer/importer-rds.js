const AWS = require("aws-sdk");
const rds = new AWS.RDS();
const pLimit = require("p-limit");
const { deleteRecordsByPK } = require("../util/db");

const { v4: uuidv4 } = require("uuid");
const CONSTANTS = require("../util/constants");

const { scanDynamoDB } = require("../util/db");

const clearAndFetchRDSInstances = () => {
    return new Promise(async (resolve, reject) => {
        console.log(`querying DB for RDS records...`);
        try {
            let rdsDynamoInstances = await getDynamoRDSInstances();
            if (rdsDynamoInstances.length > 0) {
                // Clear old records from dynamo
                console.log(`deleting ${rdsDynamoInstances.length} records...`);
                await deleteRecordsByPK(
                    CONSTANTS.TABLE_NAME,
                    rdsDynamoInstances.map((ins) => ins[CONSTANTS.PRIMARY_KEY_NAME])
                );
                console.log(`deleted all RDS records from the DB`);
            }

            // Query AWS for RDS instances
            let rdsInstances = await getRDSInstancesFromAWS();
            resolve(rdsInstances);
        } catch (error) {
            reject(`Error deleting and fetching new RDS records. Error: ${JSON.stringify(error)}`);
        }
    });
};

const getRDSInstancesFromAWS = () => {
    return new Promise((resolve, reject) => {
        let rdsInstances = [];
        const params = {};

        const getDBInstances = () => {
            return new Promise((res, rej) => {
                const getPageOfDBs = () => {
                    rds.describeDBInstances(params, (err, data) => {
                        if (err) {
                            rej(err);
                            console.log(err, err.stack);
                        } else rdsInstances = [].concat(rdsInstances, data.DBInstances);

                        if (data.Marker) {
                            params.Marker = data.Marker;
                            getPageOfDBs();
                        } else res();
                    });
                };
                getPageOfDBs();
            });
        };

        console.log(`Getting RDS data from AWS...`);
        getDBInstances().then(() => {
            console.log(`${rdsInstances.length} RDS instances fetched from AWS`);
            // // Get the tags for each RDS instance
            const tagPromises = [];
            const limit = pLimit(1);
            rdsInstances.forEach((ins) => {
                tagPromises.push(
                    limit(() => {
                        return getTagsFromRDSInstance(ins.DBInstanceArn);
                    })
                );
            });

            console.log(`Getting tag records for RDS instances from AWS...`);

            Promise.all(tagPromises)
                .then((results) => {
                    results.forEach((res) => {
                        rdsInstances.some((rdsIns, index) => {
                            if (rdsIns.DBInstanceArn === res.resourceName) {
                                rdsInstances[index].Tags = res.Tags;
                                // Also need to add the primary key for dynamoDB
                                rdsInstances[index][CONSTANTS.PRIMARY_KEY_NAME] = `${
                                    CONSTANTS.RDS_OBJECT_TYPE
                                }-${uuidv4()}`;
                                return true;
                            }
                        });
                    });
                    console.log(`\nTags fetched successfully`);
                    resolve(rdsInstances);
                })
                .catch((err) => {
                    console.error(`\nError getting RDS tags from AWS. Error: ${err.message}`);
                });
        });
    });
};

const getTagsFromRDSInstance = (resourceName) => {
    return new Promise((resolve, reject) => {
        var params = {
            ResourceName: resourceName,
        };

        rds.listTagsForResource(params, (err, data) => {
            if (err) {
                reject(err);
            }
            // an error occurred
            else {
                resolve({ resourceName, Tags: data.TagList }); // successful response
            }
        });
    });
};

const getDynamoRDSInstances = () => {
    let filterExpression = "begins_with(#pk, :rds_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = { ":rds_type": CONSTANTS.RDS_OBJECT_TYPE };

    // Query for EC2 object types
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

module.exports = {
    getRDSInstancesFromAWS,
    getDynamoRDSInstances,
    clearAndFetchRDSRecords: clearAndFetchRDSInstances,
};
