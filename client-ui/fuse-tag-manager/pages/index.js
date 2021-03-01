import useSWR from 'swr';
import Layout from './components/Layout';
import { useState } from 'react';
import AwsResource from './components/AwsResource';
import AppHeader from './components/AppHeader';

const API_URL = 'http://localhost:8000/resources'; //"https://k5fot7uo0g.execute-api.us-east-1.amazonaws.com/v1/resources";
const fetcher = (...args) => fetch(...args).then((res) => res.json());

export default function Home() {
  const [qsObj, setQsObj] = useState({});
  const { data, error } = useSWR(
    `${API_URL}?${buildQuerystring(qsObj)}`,
    fetcher
  );
  const awsResources = data ? [].concat(...data.resources) : [];
  const lastEvaluatedKey = data && data.lastEvaluatedKey;
  let loadingData = !data;

  const getMoreResources = (e) => {
    let newQsObj = {
      ...qsObj,
      lastEvaluatedKey: lastEvaluatedKey._pk,
    };

    setQsObj(newQsObj);
  };

  if (error) return <div>failed to load</div>;
  if (!awsResources) return <div>loading...</div>;

  return (
    <Layout>
      <div className="app-container">
        <AppHeader
          onQueryChange={(queryObj) => {
            console.log(
              `app header queryObject: ${JSON.stringify(queryObj, null, 2)}`
            );
            let newQsObj = { ...queryObj };
            if (qsObj.lastEvaluatedKey) {
              newQsObj.lastEvaluatedKey = qsObj.lastEvaluatedKey;
            }
            setQsObj(newQsObj);
          }}
        />
        {!loadingData && (
          <>
            <div>Total Resources: {awsResources.length}</div>
            <div>Last Resources Returned: {awsResources.length}</div>
            <div>
              Last Eval Key: {lastEvaluatedKey ? lastEvaluatedKey._pk : ''}
            </div>
            {awsResources.map((elem) => {
              return (
                <div key={elem._pk}>
                  <AwsResource data={elem}></AwsResource>
                </div>
              );
            })}
            {lastEvaluatedKey && (
              <div className="more-button" onClick={getMoreResources}>
                Get More
              </div>
            )}
          </>
        )}
        {loadingData && <div> Loading Data...</div>}
      </div>
    </Layout>
  );
}

const buildQuerystring = (qsObj) => {
  let qs = '';

  console.log(`qsObj keys: ${Object.keys(qsObj)}`);
  Object.keys(qsObj).forEach((k, i) => {
    let qsPrefix = qs.length > 0 ? `${qs}&` : '';
    qs = `${qsPrefix}${k}=${qsObj[k]}`;
  });

  return qs;
};
