const AWS = require("aws-sdk");
const OS = require("os");
const { write } = require("fs");
const { v4: uuidv4 } = require("uuid");

const AWS_REGIONS = {
  US_EAST_1: "us-east-1",
};

const TABLE_NAME = "fuse-tag-manager";
const SORT_KEY_NAME = "_sk";
const PARTITION_KEY_NAME = "_pk";
const EC2_OBJECT_TYPE = "EC2";

AWS.config.update({ region: AWS_REGIONS.US_EAST_1 });

// Create EC2 service object
const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
const dynamodb = new AWS.DynamoDB();

const params = {
  DryRun: false,
};

async function processInstances(cb) {
  // Try to clear the table first
  console.log(`querying DB for EC2 records...`);
  let tableInstances = await getDynamoEc2Instances();
  console.log(`found ${tableInstances.length} EC2 records in the DB...`);
  if (tableInstances.length > 0) {
    console.log(`deleting ${tableInstances.length} records...`);
    await clearEc2Instances(tableInstances.map((ti) => ti[PARTITION_KEY_NAME]));
    console.log(`deleted all EC2 records from the DB`);
  }

  // Query AWS for EC2 instances
  console.log(`Querying AWS EC2 instances...`);
  let instances = await getAWSEC2Instances(params);
  console.log(`${instances.length} instances to process`);

  // Populate the DB table
  let instancesWritten = await writeEc2InstancesToDB(TABLE_NAME, instances);
  console.log(`wrote ${instancesWritten} records to db table`);
  cb && cb(null, 1);
}

function checkError(err, exit = false) {
  if (err) {
    console.log("Error", err.stack);
    exit && OS.exit(-1);
    return err;
  }
}

const getAWSEC2Instances = (params) => {
  return new Promise((resolve, reject) => {
    let instances = [];
    // Call EC2 to retrieve policy for selected bucket
    ec2.describeInstances(params, (err, data) => {
      checkError(err) && reject(err);
      data.Reservations.forEach((r) => {
        r.Instances.forEach((instance) => {
          // Add in the UUID and type for each instance
          let newInstance = {
            ...instance,
          };
          newInstance[PARTITION_KEY_NAME] = `${EC2_OBJECT_TYPE}-${uuidv4()}`;
          instances.push(newInstance);
        });
      });
      resolve(instances);
    });
  });
};

const getDynamoEc2Instances = () => {
  return new Promise((resolve, reject) => {
    let instances = [];
    let docClient = new AWS.DynamoDB.DocumentClient();

    // Query for EC2 object types
    let queryParams = {
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(#pk, :ec2_type)",
      ExpressionAttributeNames: {
        "#pk": "_pk",
      },
      ExpressionAttributeValues: {
        ":ec2_type": EC2_OBJECT_TYPE,
      },
    };

    const onScan = (err, data) => {
      if (err) {
        console.error("unable to scan. Error:", JSON.stringify(err, null, 2));
      } else {
        console.log(`scan returned ${data.Items.length} items...`);
        instances = [].concat(instances, data.Items);
        if (data.LastEvaluatedKey) {
          queryParams.ExclusiveStartKey = data.LastEvaluatedKey;
          docClient.scan(queryParams, onScan);
        } else {
          resolve(instances);
        }
      }
    };

    docClient.scan(queryParams, onScan);
  });
};

const clearEc2Instances = (partitionKeys) => {
  return new Promise((resolve, reject) => {
    let docClient = new AWS.DynamoDB.DocumentClient();
    let promises = [];

    // Build the array of promises to clear all the instances
    partitionKeys.forEach((pk) => {
      let p = new Promise((res, rej) => {
        const params = {
          TableName: TABLE_NAME,
          Key: {},
        };
        params.Key[PARTITION_KEY_NAME] = pk;

        docClient.delete(params, (err, data) => {
          if (err) {
            console.error(`Error deleting instanceId: ${iid} from dynamoDb`);
          }
          res();
        });
      });
      promises.push(p);
    });

    // Run the clear promises on all the instances
    Promise.all(promises).then(() => {
      resolve();
    });
  });
};

const writeEc2InstancesToDB = (tableName, instances) => {
  return new Promise((resolve, reject) => {
    let instancesWritten = 0;
    let docClient = new AWS.DynamoDB.DocumentClient();

    let promises = [];
    instances.forEach((instance) => {
      const params = {
        TableName: tableName,
        Item: instance,
      };

      let p = new Promise((res, rej) => {
        docClient.put(params, (err, data) => {
          if (err) {
            console.error(`Error loading instanceId: ${instance.InstanceId} into dynamoDb`);
            console.error(`error: ${err.message}`);
          }
          res();
        });
      });
      promises.push(p);
    });

    Promise.all(promises).then(() => {
      resolve(promises.length);
    });
  });
};

//processInstances();
module.exports = {
  processInstances,
};
