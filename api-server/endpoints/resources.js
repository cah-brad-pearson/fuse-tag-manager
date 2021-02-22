const dbutil = require('../util/db');
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });

const CONSTANTS = require('../util/constants');

const getResources = (params) => {
  return new Promise((resolve, reject) => {
    const normalizeResources = (result) => {
      let retVal = {
        _pk: result._pk,
        tags: result.Tags,
        timeStamp: result.timeStamp,
      };

      const resultType = result._pk.split('-')[0];
      switch (resultType) {
        case CONSTANTS.EC2_OBJECT_TYPE: {
          retVal.resourceType = CONSTANTS.EC2_OBJECT_TYPE;
          retVal.instanceId = result.InstanceId;
          retVal.instanceType = result.InstanceType;
          retVal.ipAddress = result.PrivateIpAddress;
          break;
        }
        case CONSTANTS.S3_OBJECT_TYPE: {
          retVal.resourceType = CONSTANTS.S3_OBJECT_TYPE;
          retVal.name = result.Name;
          break;
        }
        case CONSTANTS.EBS_OBJECT_TYPE: {
          retVal.resourceType = CONSTANTS.EBS_OBJECT_TYPE;
          retVal.volumeId = result.VolumeId;
          retVal.volumeType = result.VolumeType;
          retVal.attachments = result.Attachments.map((r) => ({
            state: r.State,
            instanceId: r.InstanceId,
          }));
          break;
        }
        case CONSTANTS.RDS_OBJECT_TYPE: {
          retVal.resourceType = CONSTANTS.RDS_OBJECT_TYPE;
          retVal.name = result.DBInstanceIdentifier;
          break;
        }
      }

      return retVal;
    };

    console.log('getting dynamo DB tagging resources...');

    // Query the table for all AWS resources
    const ec2Filter = 'begins_with(#pk, :ec2_type)';
    const ec2FilterExpression =
      params.resourceType === 'EC2' || !params.resourceType ? ec2Filter : '';

    const rdsFilter = 'begins_with(#pk, :rds_type)';
    const rdsFilterExpression =
      params.resourceType === 'RDS' || !params.resourceType ? rdsFilter : '';

    const ebsFilter = 'begins_with(#pk, :ebs_type)';
    const ebsFilterExpression =
      params.resourceType === 'EBS' || !params.resourceType ? ebsFilter : '';

    const s3Filter = 'begins_with(#pk, :s3_type)';
    const s3FilterExpression =
      params.resourceType === 'S3' || !params.resourceType ? s3Filter : '';

    const filters = [
      ec2FilterExpression,
      rdsFilterExpression,
      ebsFilterExpression,
      s3FilterExpression,
    ];
    let filterExpression = filters.reduce((acc, curr) => {
      if (acc.length == 0 && curr.length > 0) return curr;
      if (acc.length > 0 && curr.length > 0) return `${acc} or ${curr}`;
      return acc;
    }, '');

    let expressionAttributeNames = { '#pk': '_pk' };

    let expressionAttributeValues = {};
    ec2FilterExpression &&
      (expressionAttributeValues[':ec2_type'] = CONSTANTS.EC2_OBJECT_TYPE);
    rdsFilterExpression &&
      (expressionAttributeValues[':rds_type'] = CONSTANTS.RDS_OBJECT_TYPE);
    ebsFilterExpression &&
      (expressionAttributeValues[':ebs_type'] = CONSTANTS.EBS_OBJECT_TYPE);
    s3FilterExpression &&
      (expressionAttributeValues[':s3_type'] = CONSTANTS.S3_OBJECT_TYPE);

    const lastEvaluatedKey = params.lastEvaluatedKey
      ? params.lastEvaluatedKey
      : '';

    // Call filter builder
    const tagFilterObj = filterBuilder(params);

    // Query for EC2 object types
    dbutil
      .scanDynamoDB(
        docClient,
        CONSTANTS.TABLE_NAME,
        filterExpression,
        expressionAttributeNames,
        expressionAttributeValues,
        tagFilterObj,
        params.resourceType,
        lastEvaluatedKey,
        params.pageSize
      )
      .then((results) => {
        const filteredResults = results.resources.map(normalizeResources);
        console.log(`returning ${filteredResults.length} records`);
        resolve({
          resources: filteredResults,
          lastEvaluatedKey: results.lastEvaluatedKey,
        });
      })
      .catch((error) => {
        console.error(JSON.stringify(error, null, 2));
        reject(error);
      });
  });
};

const filterBuilder = (params) => {
  const filterObject = { match: [], missing: [] };

  // assemble the tag filter object
  Object.keys(params).forEach((p) => {
    // Check if the param filter is a special case
    if (params[p] === 'MISSING') {
      filterObject.missing.push(p);
    }

    // The default case for matching against tag value and key
    else {
      Object.keys(CONSTANTS.TAG_FILTERS).some((tf) => {
        if (tf.toLowerCase() === p.toLowerCase()) {
          filterObject.match.push({
            key: p.toLowerCase(),
            value: params[p].toLowerCase(),
          });
        }
      });
    }
  });

  return filterObject;
};

module.exports = {
  getResources,
};
