//import styles from "./ResourceHeader.module.css";

export default function ResourceHeader({ data }) {
  let formattedDateString = 'n/a';
  try {
    const dateObj = new Date(Date.parse(data.timeStamp));
    formattedDateString = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString()}`;
  } catch (e) {
    console.warn('Error parsing date string on ', data._pk);
  }

  switch (data.resourceType) {
    case 'EC2':
      return (
        <>
          <div className="field">{data.instanceId}</div>
          <div className="field-separator">|</div>
          <div className="field">{data.instanceType}</div>
          <div className="field-separator">|</div>
          <div className="field">{data.ipAddress}</div>
          <div className="field-separator">|</div>
          <div className="field">{formattedDateString}</div>
        </>
      );
    case 'S3':
      return (
        <>
          <div className="field">{data.name}</div>
          <div className="field-separator">|</div>
          <div className="field">{formattedDateString}</div>
        </>
      );
    case 'EBS':
      return (
        <>
          <div className="field">{data.volumeId}</div>
          <div className="field-separator">|</div>
          <div className="field">{data.volumeType}</div>
          {data.attachments && data.attachments.length > 0 && (
            <>
              <div className="field-separator">|</div>
              <div className="field">{data.attachments[0].instanceId}</div>
              <div className="field-separator">|</div>
              <div className="field">{data.attachments[0].state}</div>
            </>
          )}
          <div className="field-separator">|</div>
          <div className="field">{formattedDateString}</div>
        </>
      );
    case 'RDS':
      return (
        <>
          <div className="field">{data.name}</div>
          <div className="field-separator">|</div>
          <div className="field">{formattedDateString}</div>
        </>
      );
    default:
      return <div>AWS Resource</div>;
  }
}
