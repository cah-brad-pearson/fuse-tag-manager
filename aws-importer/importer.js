const AWS = require("aws-sdk");
const CONSTANTS = require("../util/constants");
const {
    scanDynamoDB,
    deleteDynamoDBRecord,
    deleteRecordsByPK,
    addDynamoDBRecord,
    writeRecordsToDynamoDB,
    queryDynamoDB,
} = require("../util/db");

const { getAWSEC2Instances, getDynamoEc2Instances } = require("./importer-ec2");

const { getRDSInstancesFromAWS, getDynamoRDSInstances } = require("./importer-rds");

AWS.config.update({ region: "us-east-1" });

async function processResources(cb) {
    // EC2 instances
    try {
        console.log(`querying DB for EC2 records...`);
        let ec2DynamoRecords = await getDynamoEc2Instances();
        console.log(`found ${ec2DynamoRecords.length} EC2 records in the DB...`);

        // Clear old EC2 records from dynamo table
        if (ec2DynamoRecords.length > 0) {
            console.log(`deleting ${ec2DynamoRecords.length} records...`);
            await deleteRecordsByPK(
                CONSTANTS.TABLE_NAME,
                ec2DynamoRecords.map((ti) => ti[CONSTANTS.PRIMARY_KEY_NAME])
            );
            console.log(`deleted all EC2 records from the DB`);
        }

        //Query AWS for EC2 instances
        console.log(`querying AWS EC2 instances...`);
        let ec2Instances = await getAWSEC2Instances();
        console.log(`${ec2Instances.length} instances to process`);

        // Populate the DB table
        let instancesWritten = await writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ec2Instances);
        console.log(`wrote ${instancesWritten} EC2 records to db table`);
    } catch (error) {
        console.error(`error processing EC2 records. Error: ${error.message}`);
    }

    // RDS instances
    try {
        console.log(`querying DB for RDS records...`);
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

        let rdsDBWritten = await writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, rdsInstances);
        console.log(`wrote ${rdsDBWritten} RDS records to db table`);
    } catch (error) {
        console.error(`Error processing RDS records. Error: ${error.message}`);
    }

    // Query AWS for EBS volumes

    // Query AWS for S3 buckets

    cb && cb(null, 1);
}

//processInstances();
module.exports = {
    processResources,
};
