const { deleteRecordsByPK, scanDynamoDB } = require("../util/db");
const CONSTANTS = require("../util/constants");
const logger = require("../util/logger").init();

const cfClient = require("../node_modules/cf-nodejs-client");

const getPCFOrgs = (pcfUsername, pcfPassword, endpoint) => {
    const UsersUAA = new cfClient.UsersUAA();
    const Apps = new cfClient.Apps(endpoint);
    const Orgs = new cfClient.Organizations(endpoint);
    const CloudController = new cfClient.CloudController(endpoint);

    let apps;
    let orgs;
    let token;

    return CloudController.getInfo()
        .then((result) => {
            UsersUAA.setEndPoint(result.authorization_endpoint);
            return UsersUAA.login(pcfUsername, pcfPassword);
        })
        .then((result) => {
            token = result;
            Apps.setToken(token);
            return Apps.getApps();
        })
        .then((results) => {
            Orgs.setToken(token);
            apps = results;
            return Orgs.getOrganizations();
        })
        .then((result) => {
            orgs = result;
            let apps = result.resources.map((r) => ({ [r.metadata.guid]: r.entity.name }));
            return apps;
        })
        .catch((reason) => {
            throw new Error("Error fetching PCF orgs: " + reason);
        });
};

const getDynamoPCFConfigRecord = () => {
    let filterExpression = "begins_with(#pk, :pcf_type)";
    let expressionAttributeNames = { "#pk": CONSTANTS.PRIMARY_KEY_NAME };
    let expressionAttributeValues = { ":pcf_type": CONSTANTS.PCF_ORG_PK };

    // Query for EC2 object types
    return scanDynamoDB(CONSTANTS.TABLE_NAME, filterExpression, expressionAttributeNames, expressionAttributeValues);
};

const clearAndFetchPCFOrgs = (pcfEnvironments = []) => {
    return new Promise((resolve, reject) => {
        // query the current record and delete it
        getDynamoPCFConfigRecord()
            .then((records) => {
                if (records.length > 0) {
                    return deleteRecordsByPK(CONSTANTS.TABLE_NAME, [CONSTANTS.PCF_ORG_PK]);
                }
            })
            .then(() => {
                // support fetching different PCF environments
                let pcfEndpoints = [];
                pcfEnvironments.forEach((env) => pcfEndpoints.push(getPCFOrgs(env.username, env.password, env.url)));
                return Promise.all(pcfEndpoints)
                    .then((resultArrays) => {
                        let pcfOrgsDBRec = {
                            [CONSTANTS.PRIMARY_KEY_NAME]: CONSTANTS.PCF_ORG_PK,
                            orgs: {},
                        };

                        resultArrays.forEach((pcfOrgs) => {
                            let orgsToAdd = {};
                            pcfOrgs.forEach((o) => {
                                let key = Object.keys(o)[0];
                                orgsToAdd[key] = o[key];
                            });

                            pcfOrgsDBRec.orgs = { ...pcfOrgsDBRec.orgs, ...orgsToAdd };
                        });

                        resolve(pcfOrgsDBRec);
                    })
                    .catch((error) => {
                        throw new Error(error);
                    });
            })
            .then(() => {
                resolve();
            })
            .catch((err) => {
                reject(err);
            });
    });
};

module.exports = {
    clearAndFetchPCFOrgs,
};
