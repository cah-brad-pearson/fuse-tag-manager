import Head from "next/head";

export default function Layout({ children }) {
    return (
        <>
            <Head>
                <title>Fuse Tag Manager</title>
                <link rel="icon" href="/favicon.ico" />
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/frow@3/dist/frow.min.css"></link>
            </Head>
            <div>{children}</div>
        </>
    );
}
