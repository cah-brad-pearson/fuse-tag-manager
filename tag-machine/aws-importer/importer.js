const AWS = require("aws-sdk");
const CONSTANTS = require("../util/constants");
const logger = require("../util/logger").init();
const { writeRecordsToDynamoDB } = require("../util/db");
const { clearAndFetchEc2Instances } = require("./importer-ec2");
const { clearAndFetchRDSRecords } = require("./importer-rds");
const { clearAndFetchEBSVolumes } = require("./importer-ebs");
const { clearAndFetchS3Records } = require("./importer-s3");
const { pcfInit, clearAndFetchPCFOrgs } = require("./importer-pcf");

const PCF_USERNAME = process.env.PCF_USERNAME;
const PCF_PASSWORD = process.env.PCF_PASSWORD;
const defaultPCFEnvironments = [
    {
        url: "https://api.system.np1.fuseapps.io",
    },
];

AWS.config.update({ region: "us-east-1" });

const importResources = (pcfEnvironments = defaultPCFEnvironments) => {
    const addTimestamp = (records) => records.map((r) => ({ ...r, timeStamp: new Date().toUTCString() }));

    return new Promise((resolve) => {
        clearAndFetchEc2Instances()
            //EC2 instances
            .then((ec2Instances) => {
                return new Promise((resolve) => {
                    writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, addTimestamp(ec2Instances)).then(
                        (ec2RecordsWritten) => {
                            logger.info(`wrote ${ec2RecordsWritten} EC2 records to db table`);
                            resolve();
                        }
                    );
                });
            })
            // RDS instances
            .then(() => {
                return new Promise((resolve) => {
                    clearAndFetchRDSRecords()
                        .then((rdsInstances) => {
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, addTimestamp(rdsInstances)).then(
                                (rdsRecordsWritten) => {
                                    logger.info(`wrote ${rdsRecordsWritten} RDS records to db table`);
                                    resolve();
                                }
                            );
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
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, addTimestamp(ebsVolumes)).then(
                                (recordsWritten) => {
                                    logger.info(`wrote ${recordsWritten} EBS records to db table`);
                                    resolve();
                                }
                            );
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
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, addTimestamp(buckets)).then(
                                (recordsWritten) => {
                                    logger.info(`wrote ${recordsWritten} S3 records to db table`);
                                    resolve();
                                }
                            );
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
                // Set the PCF username and password
                pcfInit(PCF_USERNAME, PCF_PASSWORD);
                return new Promise((resolve) => {
                    clearAndFetchPCFOrgs(pcfEnvironments)
                        .then((results) => {
                            let keysLength = Object.keys(results.orgs).length;
                            logger.info(`${keysLength} pcf orgs fetched`);
                            let pcfEnvs = { _pk: CONSTANTS.PCF_ORG_PK, orgs: results.orgs };
                            writeRecordsToDynamoDB(CONSTANTS.TABLE_NAME, [pcfEnvs]).then(() => {
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
};
module.exports.importResources = importResources;
