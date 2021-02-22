const CONSTANTS = require('../util/constants');

const scanDynamoDB = (
  docClient,
  tableName,
  filterExpression,
  expressionAttributeNames,
  expressionAttributeValues,
  tagFilterObj,
  resourceFilter = '',
  lastEvaluatedKey,
  numRecordsToReturn = 50
) => {
  return new Promise((resolve, reject) => {
    // Query params obj
    let queryParams = {
      TableName: tableName,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    };

    if (lastEvaluatedKey.length > 0) {
      queryParams.ExclusiveStartKey = { _pk: lastEvaluatedKey };
    }

    console.log(`scanDynamDB queryParams: ${JSON.stringify(queryParams)}`);

    let dataItems = [];
    const onScan = (err, data) => {
      dataItems =
        dataItems.length > 0 ? [...dataItems, ...data.Items] : [...data.Items];

      if (err) {
        console.error('unable to scan. Error:', JSON.stringify(err, null, 2));
        reject(err);
      } else {
        //Apply tag filter
        dataItems = tagFilter(dataItems, tagFilterObj);

        //Apply resource type filter
        if (resourceFilter.length > 0) {
          dataItems = dataItems.filter((di) => {
            const pkArr = di._pk.split('-');
            return pkArr.length > 0 && pkArr[0] === resourceFilter;
          });
        }

        console.log(
          `current items: ${dataItems.length} - items needed: ${numRecordsToReturn}`
        );

        //Check to see if we have the minimum number of items asked for
        if (
          numRecordsToReturn &&
          data.LastEvaluatedKey &&
          dataItems.length <= numRecordsToReturn
        ) {
          queryParams.ExclusiveStartKey = data.LastEvaluatedKey;
          docClient.scan(queryParams, onScan);
        } else {
          resolve({
            resources: dataItems,
            lastEvaluatedKey: data.LastEvaluatedKey,
          });
        }
      }
    };

    docClient.scan(queryParams, onScan);
  });
};

const tagFilter = (dataItems, tagFilterObj) => {
  const matchAssociations = (tagKey, keyToMatch) => {
    let match = false;
    // First just match the key
    if (tagKey.toLowerCase() === keyToMatch.toLowerCase()) {
      return true;
    }

    // Try to match the keys that are associated
    if (
      CONSTANTS.TAG_FILTERS[tagKey] &&
      Array.isArray(CONSTANTS.TAG_FILTERS[tagKey]) &&
      CONSTANTS.TAG_FILTERS[tagKey].length > 0
    ) {
      CONSTANTS.TAG_FILTERS[tagKey].some((tfa) => {
        if (tfa.toLowerCase === keyToMatch.toLowerCase) {
          match = true;
          return true;
        }
      });
    }
    return match;
  };

  const itemsToReturn = dataItems.filter((di) => {
    let matched = 0;

    //Filter on matches
    tagFilterObj.match.forEach((tf) => {
      di.Tags.some((t) => {
        let tValue =
          typeof t.Value === 'string' ? t.Value.toLowerCase() : t.Value;
        if (
          matchAssociations(tf.key, t.Key) &&
          typeof t.Value === 'string' &&
          tValue === tf.value.toLowerCase()
        ) {
          matched++;
          // break out of the loop
          return true;
        }
      });
    });

    //Filter on missing
    tagFilterObj.missing.forEach((tf) => {
      let found = false;
      di.Tags.some((t) => {
        if (t.Key.toLowerCase() === tf.toLowerCase()) {
          found = true;
          return true;
        }
      });
      !found && matched++;
    });

    if (
      matched ===
      Object.keys(tagFilterObj.match).length +
        Object.keys(tagFilterObj.missing).length
    ) {
      return true;
    }
  });

  return itemsToReturn;
};

module.exports = {
  scanDynamoDB,
};
