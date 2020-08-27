const AWS = require("aws-sdk");
const fs = require("fs");
const { deleteDynamoDBRecord, addDynamoDBRecord } = require("../util/db");
const CONSTANTS = require("../util/constants");

let clearConfig = () => {
    let key = { _pk: CONSTANTS.CONFIG_PK };
    console.log("Attempting to delete previous config...");
    return deleteDynamoDBRecord(CONSTANTS.TABLE_NAME, key);
};

let createConfig = () => {
    // recreate new config
    console.log("Importing config data into DynamoDB...");
    const configData = JSON.parse(fs.readFileSync("config/master-tags.json", "utf8"));

    let configRecord = { _pk: CONSTANTS.CONFIG_PK };

    // Loop through the keys of the config object and add the keys and values
    Object.keys(configData).forEach((k) => {
        configRecord[k] = configData[k];
    });

    return addDynamoDBRecord(CONSTANTS.TABLE_NAME, configRecord);
};

clearConfig()
    .then(() => {
        createConfig();
    })
    .then(() => {
        console.log("successfully reloaded config");
    })
    .catch((err) => {
        console.errors(`error loading config: ${err.message}`);
    });
