import styles from './AwsResource.module.css';
import ResourceHeader from './ResourceHeader';
import AwsTags from './AwsTags';

export default function AwsResource({ data }) {
  return (
    <>
      <div className="resource-wrapper">
        <div className="frow row-start">
          <div className="col-md-1-10">
            <div className={styles.title}>
              {getResourceName(data.resourceType)}
            </div>
          </div>
          <div className="col-xl-1-2">
            <ResourceHeader data={data} />
          </div>
          <div className="col-md-1">
            <AwsTags data={data} />
          </div>
        </div>
      </div>
    </>
  );
}

const getResourceName = (resourceType) => {
  switch (resourceType) {
    case 'EC2':
      return 'EC2 Instance';
    case 'S3':
      return 'S3 Bucket';
    case 'EBS':
      return 'EBS Volume';
    case 'RDS':
      return 'RDS DB';
    default:
      return 'AWS Resource';
  }
};
