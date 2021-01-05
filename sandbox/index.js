const endpoint = "https://api.system.np1.fuseapps.io";
const username = "bradley.pearson";
const password = "BenHadley.1020";

const client = require("../node_modules/cf-nodejs-client");

const UsersUAA = new client.UsersUAA();
const Apps = new client.Apps(endpoint);
const Orgs = new client.Organizations(endpoint);
const CloudController = new client.CloudController(endpoint);

let apps;
let orgs;
let token;
CloudController.getInfo()
    .then((result) => {
        UsersUAA.setEndPoint(result.authorization_endpoint);
        return UsersUAA.login(username, password);
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
        const apps = result.resources.map((r) => ({
            name: r.entity.name,
            guid: r.metadata.guid,
            status: r.entity.status,
        }));
        console.log(JSON.stringify({ orgs, apps }, null, 2));
        //return apps
    })
    .catch((reason) => {
        console.error("Error: " + reason);
    });
