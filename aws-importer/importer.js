const AWS = require("aws-sdk");
const CONSTANTS = require("../util/constants");
const logger = require("../util/logger").init();
const { writeRecordsToDynamoDB } = require("../util/db");
const { clearAndFetchEc2Instances } = require("./importer-ec2");
const { clearAndFetchRDSRecords } = require("./importer-rds");
const { clearAndFetchEBSVolumes } = require("./importer-ebs");
const { clearAndFetchS3Records } = require("./importer-s3");

AWS.config.update({ region: "us-east-1" });

const importResources = () =>
    new Promise((resolve, reject) => {
        clearAndFetchEc2Instances()
            // Populate the DB table
            .then((ec2Instances) => writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ec2Instances))
            .then((ec2RecordsWritten) => {
                logger.info(`wrote ${ec2RecordsWritten} EC2 records to db table`);
            })
            // RDS instances
            .then(() => clearAndFetchRDSRecords())
            .then((rdsInstances) => writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, rdsInstances))
            .then((rdsRecordsWritten) => {
                logger.info(`wrote ${rdsRecordsWritten} RDS records to db table`);
            })
            // Query AWS for EBS volumes
            .then(() => clearAndFetchEBSVolumes())
            .then((ebsVolumes) => {
                logger.info(`fetched ${ebsVolumes.length} EBS records`);
                return writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ebsVolumes);
            })
            .then((recordsWritten) => {
                logger.info(`wrote ${recordsWritten} EBS records to db table`);
                return clearAndFetchS3Records();
            })
            .then((buckets) => {
                logger.info(`${buckets.length} buckets fetched from S3`);
                return writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, buckets);
            })
            .then((recordsWritten) => {
                logger.info(`wrote ${recordsWritten} S3 records to db table`);
                resolve();
            })
            .catch((error) => {
                logger.error(`error processing AWS records. Error: ${error}`);
                reject();
            });
    });

module.exports.importResources = importResources;
