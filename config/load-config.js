const AWS = require("aws-sdk");
const fs = require("fs");
const { deleteDynamoDBRecord, addDynamoDBRecord } = require("../util/db");
const CONSTANTS = require("../util/constants");
const logger = require("../util/logger").init();

let clearMasterConfig = () => {
    let key = { _pk: CONSTANTS.CONFIG_PK };
    logger.info("attempting to delete previous master config...");
    return deleteDynamoDBRecord(CONSTANTS.TABLE_NAME, key);
};

let clearPcfOrgLookupConfig = () => {
    let key = { _pk: CONSTANTS.PCF_ORG_LOOKUP_PK };
    logger.info("attempting to delete previous pcf config...");
    return deleteDynamoDBRecord(CONSTANTS.TABLE_NAME, key);
};

let createMasterConfig = () => {
    // recreate new config
    logger.info("importing master tag config data into DynamoDB...");
    const configData = JSON.parse(fs.readFileSync("config/master-tags.json", "utf8"));

    let configRecord = { _pk: CONSTANTS.CONFIG_PK };

    // Loop through the keys of the config object and add the keys and values
    Object.keys(configData).forEach((k) => {
        configRecord[k] = configData[k];
    });

    return addDynamoDBRecord(CONSTANTS.TABLE_NAME, configRecord);
};

let createPcfOrgLookupConfig = () => {
    logger.info("importing PCF org lookup data into DynamoDB...");
    const configData = JSON.parse(fs.readFileSync("config/pcf-orgs.json", "utf8"));

    let configRecord = { _pk: CONSTANTS.PCF_ORG_LOOKUP_PK, pcforgs: {} };

    // Loop through the keys of the config object and add the keys and values
    if (configData[CONSTANTS.PCF_CONFIG_ORG_LABEL]) {
        Object.keys(configData[CONSTANTS.PCF_CONFIG_ORG_LABEL]).forEach((k) => {
            configRecord[CONSTANTS.PCF_CONFIG_ORG_LABEL][k] = configData[CONSTANTS.PCF_CONFIG_ORG_LABEL][k];
        });

        return addDynamoDBRecord(CONSTANTS.TABLE_NAME, configRecord);
    }

    throw new Error("Didn't find the pcfOrgs key in the config file");
};

const clearAndLoadMasterTags = () =>
    new Promise((resolve, reject) => {
        clearMasterConfig()
            .then(() => createMasterConfig())
            .then((paramsAdded) => {
                logger.info(`successfully reloaded master tag config`);
                resolve();
            })
            .catch((err) => {
                logger.error(`error loading master tag config: ${err.message}`);
                reject(err.message);
            });
    });

const clearAndLoadPcfOrgs = () =>
    new Promise((resolve, reject) => {
        clearPcfOrgLookupConfig()
            .then(() => {
                createPcfOrgLookupConfig();
                logger.info("successfully imported pcf org lookup config data");
                resolve();
            })
            .catch((error) => {
                logger.error(`error importing PCF lookup config: ${error.message}`);
                reject(error);
            });
    });

module.exports.clearAndLoadConfig = () => clearAndLoadMasterTags().then(() => clearAndLoadPcfOrgs());
