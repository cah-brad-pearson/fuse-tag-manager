const getRes = require("../lambda/get-resources");

getRes.handler({}, {}, (data) => {
    console.log(JSON.stringify(data, null, 2));
});
