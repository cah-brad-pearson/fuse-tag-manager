import styles from "./AwsTags.module.css";

export default function AwsTags({ data }) {
    return (
        <>
            <div className={styles.title}>Tags</div>
            <div className={styles.tagwrapper}>
                <div>
                    {data.tags.sort(sortTagKeys).map((tag, i) => {
                        return (
                            <div className="frow row-start" key={i}>
                                <div className="col-md-1-8">
                                    <div className={styles.tagpair}>{tag.Key}</div>
                                </div>
                                <div className="col-md-1-2">
                                    <div className={styles.tagpair}>{tag.Value}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}

const sortTagKeys = (t1, t2) => {
    if (t1.Key.toLowerCase() < t2.Key.toLowerCase()) {
        return -1;
    }
    if (t1.Key.toLowerCase() > t2.Key.toLowerCase()) {
        return 1;
    }
    return 0;
};
