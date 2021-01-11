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
    new Promise((resolve) => {
        clearAndFetchEc2Instances()
            //EC2 instances
            .then((ec2Instances) => {
                return new Promise((resolve) => {
                    writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ec2Instances).then((ec2RecordsWritten) => {
                        logger.info(`wrote ${ec2RecordsWritten} EC2 records to db table`);
                        resolve();
                    });
                });
            })
            // RDS instances
            .then(() => {
                return new Promise((resolve) => {
                    clearAndFetchRDSRecords()
                        .then((rdsInstances) => {
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, rdsInstances).then((rdsRecordsWritten) => {
                                logger.info(`wrote ${rdsRecordsWritten} RDS records to db table`);
                                resolve();
                            });
                        })
                        .catch((err) => {
                            logger.error(`error processing RDS instances: ${err.message}`);
                            resolve();
                        });
                });
            })
            // EBS volumes
            .then(() => {
                return new Promise((resolve) => {
                    clearAndFetchEBSVolumes()
                        .then((ebsVolumes) => {
                            logger.info(`fetched ${ebsVolumes.length} EBS records`);
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, ebsVolumes).then((recordsWritten) => {
                                logger.info(`wrote ${recordsWritten} EBS records to db table`);
                                resolve();
                            });
                        })
                        .catch((err) => {
                            logger.error(`error processing EBS volumes: ${err.message}`);
                            resolve();
                        });
                });
            })

            // S3 buckets
            .then(() => {
                return new Promise((resolve) => {
                    clearAndFetchS3Records()
                        .then((buckets) => {
                            logger.info(`${buckets.length} buckets fetched from S3`);
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, buckets).then((recordsWritten) => {
                                logger.info(`wrote ${recordsWritten} S3 records to db table`);
                                resolve();
                            });
                        })
                        .catch((err) => {
                            logger.error(`error processing S3 buckets: ${err.message}`);
                            resolve();
                        });
                });
            })
            .then(() => {
                //PCF orgs
                logger.info("Importing PCF orgs...");
                return new Promise((resolve) => {
                    clearAndFetchPCFOrgs(pcfEnvironments)
                        .then((results) => {
                            let keysLength = Object.keys(results.orgs).length;
                            logger.info(`${keysLength} pcf orgs fetched`);
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, [pcfOrgsRec]).then(() => {
                                resolve();
                            });
                        })
                        .catch((err) => {
                            logger.error(`Error in importer: ${err.message}`);
                            resolve();
                        });
                });
            })
            .then(() => {
                resolve();
            })
            .catch((err) => {
                logger.error(`error processing EC2 instances: ${err.message}`);
                resolve();
            });
    });

module.exports.importResources = importResources;
