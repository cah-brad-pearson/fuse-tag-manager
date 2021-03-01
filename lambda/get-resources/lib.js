const scanDynamoDB = (docClient, tableName, filterExpression, expressionAttributeNames, expressionAttributeValues) => {
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

module.exports = {
    scanDynamoDB,
};
