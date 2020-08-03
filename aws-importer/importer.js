const AWS = require("aws-sdk");
const CONSTANTS = require("../util/constants");
const { writeRecordsToDynamoDB } = require("../util/db");
const { clearAndFetchEc2Instances } = require("./importer-ec2");
const { clearAndFetchRDSRecords } = require("./importer-rds");
const { clearAndFetchEBSVolumes } = require("./importer-ebs");
const { clearAndFetchS3Records } = require("./importer-s3");

AWS.config.update({ region: "us-east-1" });

async function processResources(cb) {
    // EC2 instances
    // clearAndFetchEc2Instances()
    //     .then((ec2Instances) => {
    //         // Populate the DB table
    //         return writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ec2Instances);
    //     })
    //     .then((ec2RecordsWritten) => {
    //         console.log(`wrote ${ec2RecordsWritten} EC2 records to db table`);
    //     })
    //     // RDS instances
    //     .then(() => {
    //         return clearAndFetchRDSRecords();
    //     })

    // .then((rdsInstances) => {
    //     return writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, rdsInstances);
    // })
    // .then((rdsRecordsWritten) => {
    //     console.log(`wrote ${rdsRecordsWritten} RDS records to db table`);
    // })
    // // Query AWS for EBS volumes
    // .then(() => {
    //     getEBSVolumes();
    // })
    // clearAndFetchEBSVolumes()
    //     .then((ebsVolumes) => {
    //         console.log(`fetched ${ebsVolumes.length} EBS records`);
    //         return writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ebsVolumes);
    //     })
    //     .then((recordsWritten) => {
    //         console.log(`wrote ${recordsWritten} EBS records to db table`);
    //     })
    clearAndFetchS3Records()
        .then((buckets) => {
            console.log(`${buckets.length} buckets fetched from S3`);
            return writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, buckets);
        })
        .then((recordsWritten) => {
            console.log(`wrote ${recordsWritten} S3 records to db table`);
        })
        .catch((error) => {
            console.error(`error processing AWS records. Error: ${error}`);
        })
        .finally(() => {
            typeof cb == "function" && cb();
        });
}

//processInstances();
module.exports = {
    processResources,
};
