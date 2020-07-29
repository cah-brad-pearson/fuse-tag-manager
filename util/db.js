const AWS = require("aws-sdk");
AWS.config.update({ region: "us-east-1" });
const docClient = new AWS.DynamoDB.DocumentClient();

const scanDynamoDB = (tableName, filterExpression, expressionAttributeNames, expressionAttributeValues) => {
    return new Promise((resolve, reject) => {
        let dataItems = [];

        // Query params obj
        let queryParams = {
            TableName: tableName,
            FilterExpression: filterExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        };

        const onScan = (err, data) => {
            if (err) {
                console.error("unable to scan. Error:", JSON.stringify(err, null, 2));
            } else {
                console.log(`scan returned ${data.Items.length} items...`);
                dataItems = [].concat(dataItems, data.Items);
                if (data.LastEvaluatedKey) {
                    console.log("more items exist, scanning more...");
                    queryParams.ExclusiveStartKey = data.LastEvaluatedKey;
                    docClient.scan(queryParams, onScan);
                } else {
                    resolve(dataItems);
                }
            }
        };

        docClient.scan(queryParams, onScan);
    });
};

const deleteRecordsByPK = (tableName, primaryKeys) => {
    return new Promise((resolve) => {
        let promises = [];

        // Build the array of promises to clear all the instances
        primaryKeys.forEach((pk) => {
            promises.push(deleteDynamoDBRecord(tableName, { _pk: pk }));
        });

        // Run the clear promises on all the instances
        Promise.all(promises).then(() => {
            resolve();
        });
    });
};

const deleteDynamoDBRecord = (tableName, key) => {
    return new Promise((resolve, reject) => {
        var params = {
            TableName: tableName,
            Key: key,
        };

        //console.log("Attempting to delete record...");
        docClient.delete(params, (err, data) => {
            if (err) {
                console.error(`Unable to delete record. Error: ${JSON.stringify(err, null, 2)}`);
                reject();
            } else {
                //console.log("Delete succeeded");
                resolve();
            }
        });
    });
};

const addDynamoDBRecord = (tableName, item) => {
    return new Promise((resolve, reject) => {
        //console.log("Writing DB record");
        let params = {
            TableName: tableName,
            Item: item,
        };

        docClient.put(params, (err, data) => {
            if (err) {
                console.error(`Unable to add record. Error: ${JSON.stringify(err, null, 2)}`);
                reject();
            } else {
                //console.log("Record added");
                resolve();
            }
        });
    });
};

const writeRecordsToDynamoDB = (tableName, records) => {
    return new Promise((resolve) => {
        let promises = [];
        records.forEach((record) => {
            promises.push(addDynamoDBRecord(tableName, record));
        });

        Promise.all(promises).then(() => {
            resolve(promises.length);
        });
    });
};

const queryDynamoDB = (tableName, keyConditionExpression, expressionAttributeNames, expressionAttributeValues) => {
    return new Promise((res, rej) => {
        var params = {
            TableName: tableName,
            KeyConditionExpression: keyConditionExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        };

        docClient.query(params, (err, data) => {
            if (err) {
                console.error(`Error querying dynamoDB. Error: ${err.message}`);
                rej(err.message);
            }
            res(data.Items);
        });
    });
};


module.exports = {
    scanDynamoDB,
    deleteDynamoDBRecord,
    deleteRecordsByPK,
    addDynamoDBRecord,
    writeRecordsToDynamoDB,
    queryDynamoDB,
};
