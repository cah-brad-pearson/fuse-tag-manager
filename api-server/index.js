const express = require('express');
const app = express();

const HTTP_PORT = 8000;

const { getResources } = require('./endpoints/resources');

app.get('/resources', async (req, res) => {
  console.log(`resource params: ${JSON.stringify(req.query)}`);
  const payload = await getResources(req.query);
  setCORSHeaders(res);
  res.json(payload);
});

console.log(`listening on port ${HTTP_PORT}`);
app.listen(HTTP_PORT);

const setCORSHeaders = (res) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,GET',
  };
  res.set(headers);
};
