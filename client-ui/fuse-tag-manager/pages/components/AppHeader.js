import styles from './AppHeader.module.css';
import { useState } from 'react';

export default function AppHeader({ onQueryChange }) {
  const [queryOptions, setQueryOptions] = useState({});
  const [showProductTeamDropdown, setProductTeamDropdown] = useState(true);

  return (
    <div className={styles.headerwrapper}>
      <div className="frow row-start gutters">
        <div className="col-sm-1-12">
          <label>
            Resource Type
            <select
              onChange={(e) => {
                setQueryOptions({
                  ...queryOptions,
                  resourceType: e.target.value,
                });
              }}
            >
              <option defaultValue value="">
                ALL
              </option>
              <option value="EC2">EC2</option>
              <option value="RDS">RDS</option>
              <option value="EBS">EBS</option>
            </select>
          </label>
        </div>
        <div className="col-sm-1-10">
          <label className={styles.teamLabel}>
            Product Team
            <a
              className={styles.teamSwitcher}
              onClick={() => {
                console.log(
                  `switching showProductTeamDropdown to ${!showProductTeamDropdown}`
                );
                setProductTeamDropdown(!showProductTeamDropdown);
                if (showProductTeamDropdown === false) {
                  const newQueryOptions = { ...queryOptions };
                  delete newQueryOptions.product;
                  setQueryOptions(newQueryOptions);
                }
              }}
            >
              *
            </a>
            {showProductTeamDropdown && (
              <select
                onChange={(e) => {
                  if (e.target.value !== 'ALL') {
                    setQueryOptions({
                      ...queryOptions,
                      product: e.target.value,
                    });
                  } else {
                    const newQueryOptions = { ...queryOptions };
                    delete newQueryOptions.product;
                    setQueryOptions(newQueryOptions);
                  }
                }}
              >
                <option defaultValue>ALL</option>
                <option>Foundational</option>
                <option>Outcomes</option>
                <option>Care</option>
              </select>
            )}
            {!showProductTeamDropdown && (
              <input
                type="text"
                onChange={(e) => {
                  setQueryOptions({
                    ...queryOptions,
                    product: e.target.value,
                  });
                }}
              ></input>
            )}
          </label>
        </div>
        <div className="col-sm-1-12">
          <label>
            Page Size (Min)
            <select
              onChange={(e) => {
                setQueryOptions({
                  ...queryOptions,
                  pageSize: e.target.value,
                });
              }}
            >
              <option defaultValue value="50">
                Small
              </option>
              <option value="500">Medium</option>
              <option value="1000">Large</option>
              <option value="5000">MAX (use caution)</option>
            </select>
          </label>
        </div>
        <div className="col-sm-1-10">
          <label className={styles.ncslabel}>
            <input
              className={styles.ncsinput}
              type="checkbox"
              onClick={() => {
                let newOptions = {
                  ...queryOptions,
                };
                if (queryOptions.costcenter === 'MISSING') {
                  delete newOptions.costcenter;
                } else {
                  newOptions.costcenter = 'MISSING';
                }
                setQueryOptions(newOptions);
              }}
            />
            No Cost Center
          </label>
        </div>
      </div>
      <div className="frow row-start"></div>
      <div className="frow row-start">
        <div className="col-sm-1-2">
          <button
            onClick={() => {
              onQueryChange(queryOptions);
            }}
            className={styles.querybutton}
          >
            Run Query
          </button>
        </div>
      </div>
    </div>
  );
}
