const AWS = require("aws-sdk");
const OS = require("os");
const { write } = require("fs");

const AWS_REGIONS = {
  US_EAST_1: "us-east-1",
};

const TABLE_NAMES = {
  EC2_INSTANCES: "fuse-tagging-ec2",
};

AWS.config.update({ region: AWS_REGIONS.US_EAST_1 });

// Create EC2 service object
const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
const dynamodb = new AWS.DynamoDB();

const params = {
  DryRun: false,
};

async function processInstances() {
  // Try to clear the table first
  console.log(`querying DB for EC2 records...`);
  let tableInstances = await getDynamoEc2Instances();
  console.log(`found ${tableInstances.length} EC2 records in the DB. Deleting...`);
  if (tableInstances.length > 0) {
    await clearEc2Instances(tableInstances.map((ti) => ti.InstanceId));
    console.log(`deleted all EC2 records from the DB`);
  }

  // Query AWS for EC2 instances
  console.log(`Querying AWS EC2 instances...`);
  let instances = await getAWSEc2Instances(params);
  console.log(`${instances.length} instances to process`);

  // Populate the DB table
  let instancesWritten = await writeEc2InstancesToDB(TABLE_NAMES.EC2_INSTANCES, instances);
  console.log(`wrote ${instancesWritten} records to db table`);
}

function checkError(err, exit = false) {
  if (err) {
    console.log("Error", err.stack);
    exit && OS.exit(-1);
    return err;
  }
}

const getAWSEc2Instances = (params) => {
  return new Promise((resolve, reject) => {
    let instances = [];
    // Call EC2 to retrieve policy for selected bucket
    ec2.describeInstances(params, (err, data) => {
      checkError(err) && reject(err);
      data.Reservations.forEach((r) => {
        r.Instances.forEach((instance) => {
          instances.push(instance);
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

    let onScan = (err, data) => {
      instances = instances.concat(data.Items);
      if (data.LastEvaluatedKey) {
        docClient.scan(
          {
            TableName: TABLE_NAMES.EC2_INSTANCES,
            ExclusiveStartKey: data.LastEvaluatedKey,
          },
          onScan
        );
      } else {
        resolve(instances);
      }
    };

    docClient.scan({ TableName: TABLE_NAMES.EC2_INSTANCES }, onScan);
  });
};

const clearEc2Instances = (instanceIds) => {
  return new Promise((resolve, reject) => {
    let docClient = new AWS.DynamoDB.DocumentClient();
    let promises = [];

    // Build the array of promises to clear all the instances
    instanceIds.forEach((iid) => {
      let p = new Promise((res, rej) => {
        const params = {
          TableName: TABLE_NAMES.EC2_INSTANCES,
          Key: { InstanceId: iid },
        };

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
      resolve();
    });
  });
};

processInstances();
