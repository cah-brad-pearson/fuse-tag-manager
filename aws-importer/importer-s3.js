const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const { deleteRecordsByPK } = require("../util/db");

const { v4: uuidv4 } = require("uuid");
const CONSTANTS = require("../util/constants");

const { scanDynamoDB } = require("../util/db");

const clearAndFetchS3Records = () => {
    return new Promise(async (resolve, reject) => {
        console.log(`querying DB for S3 buckets...`);
        try {
            let s3DynamoInstances = await getDynamoS3Instances();
            if (s3DynamoInstances.length > 0) {
                // Clear old records from dynamo
                console.log(`deleting ${s3DynamoInstances.length} records...`);
                await deleteRecordsByPK(
                    CONSTANTS.TABLE_NAME,
                    s3DynamoInstances.map((ins) => ins[CONSTANTS.PRIMARY_KEY_NAME])
                );
                console.log(`deleted all S3 bucket records from the DB`);
            }
            // Query AWS for RDS instances
            let s3Instances = await getS3BucketsFromAWS();
            resolve(s3Instances);
        } catch (error) {
            reject(`Error deleting and fetching new S3 bucket records. Error: ${JSON.stringify(error)}`);
        }
    });
};

const getS3BucketsFromAWS = () => {
    return new Promise((resolve, reject) => {
        const params = {};

        const getS3Buckets = () => {
            return new Promise((res, rej) => {
                s3.listBuckets(params, (err, data) => {
                    if (err) {
                        console.log(err, err.stack);
                        rej(err);
                    }
                    // Add in primary key
                    let newBuckets = data.Buckets.map((b) => {
                        const newBucket = { ...b };
                        newBucket[CONSTANTS.PRIMARY_KEY_NAME] = `${CONSTANTS.S3_OBJECT_TYPE}-${uuidv4()}`;
                        return newBucket;
                    });

                    res(newBuckets);
                });
            });
        };

        const getBucketTags = (bucketObj) => {
            return new Promise((res, rej) => {
                var params = {
                    Bucket: bucketObj.Name,
                };

                s3.getBucketTagging(params, function (err, data) {
                    if (err) {
                        console.warn(`error getting tag list for bucket ${bucketObj.Name}: ${err.message}`);
                        res({ ...bucketObj });
                    } else {
                        let newBucketObj = { ...bucketObj };
                        newBucketObj.Tags = data.TagSet;
                        res(newBucketObj);
                    }
                });
            });
        };

        console.log(`Getting S3 bucket data from AWS...`);

        getS3Buckets()
            .then((buckets) => {
                console.log(`${buckets.length} buckets fetched from AWS`);
                // Get all tags for the buckets
                let tagPromises = buckets.map((b) => {
                    return getBucketTags(b);
                });

                return Promise.all(tagPromises);
            })
            .then((bucketsWithTags) => {
                resolve(bucketsWithTags);
            })
            .catch((err) => {
                console.error(`\nError getting S3 buckets from AWS. Error: ${err.message}`);
            });
    });
};

const getDynamoS3Instances = () => {
    let filterExpression = "begins_with(#pk, :s3_type)";
    let expressionAttributeNames = { "#pk": "_pk" };
    let expressionAttributeValues = { ":s3_type": CONSTANTS.S3_OBJECT_TYPE };

    // Query for EC2 object types
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

module.exports = {
    clearAndFetchS3Records,
};
