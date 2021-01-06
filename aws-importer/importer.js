const AWS = require("aws-sdk");
const CONSTANTS = require("../util/constants");
const logger = require("../util/logger").init();
const { writeRecordsToDynamoDB } = require("../util/db");
const { clearAndFetchEc2Instances } = require("./importer-ec2");
const { clearAndFetchRDSRecords } = require("./importer-rds");
const { clearAndFetchEBSVolumes } = require("./importer-ebs");
const { clearAndFetchS3Records } = require("./importer-s3");
const { clearAndFetchPCFOrgs } = require("./importer-pcf");

AWS.config.update({ region: "us-east-1" });

const importResources = (pcfEnvironments) =>
    new Promise((resolve, reject) => {
        clearAndFetchEc2Instances()
            // EC2 instances
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
            // EBS volumes
            .then(() => clearAndFetchEBSVolumes())
            .then((ebsVolumes) => {
                logger.info(`fetched ${ebsVolumes.length} EBS records`);
            })
            .then(() => writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ebsVolumes))
            .then((recordsWritten) => {
                logger.info(`wrote ${recordsWritten} EBS records to db table`);
            })
            // S3 buckets
            .then(() => clearAndFetchS3Records())
            .then((buckets) => {
                logger.info(`${buckets.length} buckets fetched from S3`);
            })
            .then(() => writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, buckets))
            .then((recordsWritten) => {
                logger.info(`wrote ${recordsWritten} S3 records to db table`);
            })
            //PCF orgs
            .then(() => clearAndFetchPCFOrgs(pcfEnvironments))
            .then((results) => {
                let keysLength = Object.keys(results.orgs).length;
                logger.info(`${keysLength} pcf orgs fetched`);
                return results;
            })
            .then((pcfOrgsRec) => writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, [pcfOrgsRec]))
            .catch((error) => {
                logger.error(`error processing AWS records. Error: ${error}`);
                reject();
            })
            .finally(() => {
                resolve();
            });
    });

module.exports.importResources = importResources;
