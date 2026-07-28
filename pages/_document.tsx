import { Head, Html, Main, NextScript } from "next/document";

const themeInitScript = `
  try {
    var savedTheme = window.localStorage.getItem("wca-rankings-theme");
    var theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", theme === "dark" ? "#121417" : "#fffcff");
  } catch (error) {}
`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta id="theme-color" name="theme-color" content="#fffcff" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
