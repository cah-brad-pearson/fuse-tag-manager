import "../styles/globals.css";

function MyApp({ Component, pageProps }) {
    return <Component className="app-wrapper" {...pageProps} />;
}

export default MyApp;
