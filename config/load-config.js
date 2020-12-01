const AWS = require("aws-sdk");
const fs = require("fs");
const { deleteDynamoDBRecord, addDynamoDBRecord } = require("../util/db");
const CONSTANTS = require("../util/constants");
const logger = require("../util/logger").init();

let clearConfig = () => {
    let key = { _pk: CONSTANTS.CONFIG_PK };
    logger.info("attempting to delete previous config...");
    return deleteDynamoDBRecord(CONSTANTS.TABLE_NAME, key);
};

let createConfig = () => {
    // recreate new config
    logger.info("importing config data into DynamoDB...");
    const configData = JSON.parse(fs.readFileSync("config/master-tags.json", "utf8"));

    let configRecord = { _pk: CONSTANTS.CONFIG_PK };

    // Loop through the keys of the config object and add the keys and values
    Object.keys(configData).forEach((k) => {
        configRecord[k] = configData[k];
    });

    return addDynamoDBRecord(CONSTANTS.TABLE_NAME, configRecord);
};

const clearAndLoadConfig = () => {
    return new Promise((resolve, reject) => {
        clearConfig()
            .then(() => createConfig())
            .then((paramsAdded) => {
                logger.info(`successfully reloaded config with values ${JSON.stringify(paramsAdded, null, 2)}`);
                resolve();
            })
            .catch((err) => {
                logger.error(`error loading config: ${err.message}`);
                reject(err.message);
            });
    });
};

module.exports.clearAndLoadConfig = clearAndLoadConfig;
